const midtransClient = require('midtrans-client');
const { Transaction, Order, OrderItem } = require('../models');
const { deductStockForOrder } = require('./stockController');
const { sequelize } = require('../config/database');

// Initialize Midtrans Core API client
const coreApi = new midtransClient.CoreApi({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

/**
 * POST /api/payments/create-qris
 * Generate QRIS payment via Midtrans Core API
 */
const createQrisPayment = async (req, res, next) => {
  try {
    const { order_id } = req.body;

    const order = await Order.findByPk(order_id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }

    // Check if transaction already exists and is paid
    const existingTrx = await Transaction.findOne({ where: { order_id } });
    if (existingTrx && existingTrx.status === 'paid') {
      return res.status(400).json({ success: false, message: 'Pesanan sudah dibayar.' });
    }

    // If existing pending transaction with a valid QR, return it
    if (existingTrx && existingTrx.status === 'pending' && existingTrx.qris_content) {
      return res.json({
        success: true,
        message: 'QRIS sudah tersedia.',
        data: {
          transaction_id: existingTrx.id,
          ref_id: existingTrx.ref_id,
          amount: parseFloat(existingTrx.amount),
          qr_url: existingTrx.qris_content,
          status: existingTrx.status,
        },
      });
    }

    const orderId = `KTK-${order.id}-${Date.now()}`;
    const grossAmount = Math.round(parseFloat(order.total));

    // Call Midtrans Core API
    const chargeParams = {
      payment_type: 'qris',
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount,
      },
      qris: {
        acquirer: 'gopay',
      },
    };

    const chargeResponse = await coreApi.charge(chargeParams);

    // Extract QR URL from response
    let qrUrl = null;
    if (chargeResponse.actions && chargeResponse.actions.length > 0) {
      const qrAction = chargeResponse.actions.find(
        (action) => action.name === 'generate-qr-code'
      );
      if (qrAction) {
        qrUrl = qrAction.url;
      }
    }

    // Save or update transaction
    const trxData = {
      ref_id: orderId,
      trx_id: chargeResponse.transaction_id || null,
      amount: grossAmount,
      payment_method: 'QRIS',
      status: 'pending',
      qris_content: qrUrl,
    };

    let trx;
    if (existingTrx) {
      trx = await existingTrx.update(trxData);
    } else {
      trx = await Transaction.create({ order_id, ...trxData });
    }

    res.json({
      success: true,
      message: 'QRIS berhasil dibuat via Midtrans.',
      data: {
        transaction_id: trx.id,
        ref_id: trx.ref_id,
        trx_id: trx.trx_id,
        qr_url: qrUrl,
        status: trx.status,
      },
    });
  } catch (error) {
    console.error('Midtrans charge error:', error.message);

    // Fallback: create mock transaction if Midtrans fails
    try {
      const { order_id } = req.body;
      const order = await Order.findByPk(order_id);
      if (!order) {
        return next(error);
      }

      const ref_id = `KTK-MOCK-${Date.now()}`;
      const existingTrx = await Transaction.findOne({ where: { order_id } });
      const trx = existingTrx || await Transaction.create({
        order_id,
        ref_id,
        amount: parseFloat(order.total),
        payment_method: 'QRIS',
        status: 'pending',
        qris_content: `mock-qris-${ref_id}`,
      });

      return res.json({
        success: true,
        message: 'QRIS dibuat (mode fallback — Midtrans tidak tersedia).',
        data: {
          transaction_id: trx.id,
          ref_id: trx.ref_id,
          amount: parseFloat(order.total),
          qr_url: null,
          qris_content: trx.qris_content,
          status: trx.status,
        },
      });
    } catch (fallbackError) {
      next(fallbackError);
    }
  }
};

/**
 * POST /api/payments/callback
 * Midtrans webhook/notification handler
 */
const paymentCallback = async (req, res, next) => {
  try {
    const notification = req.body;

    // Verify notification with Midtrans
    const statusResponse = await coreApi.transaction.notification(notification);

    const midtransOrderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    console.log(`[Midtrans Webhook] Order: ${midtransOrderId}, Status: ${transactionStatus}, Fraud: ${fraudStatus}`);

    // Find transaction by ref_id (which is our midtrans order_id)
    const trx = await Transaction.findOne({ where: { ref_id: midtransOrderId } });
    if (!trx) {
      console.warn(`[Midtrans Webhook] Transaction not found for order_id: ${midtransOrderId}`);
      return res.status(200).json({ success: true, message: 'Transaction not found, ignored.' });
    }

    // Process based on transaction status
    if (transactionStatus === 'settlement' || transactionStatus === 'capture') {
      if (fraudStatus === 'accept' || !fraudStatus) {
        // Payment successful
        const t = await sequelize.transaction();
        try {
          trx.status = 'paid';
          trx.paid_at = new Date();
          trx.trx_id = statusResponse.transaction_id;
          await trx.save({ transaction: t });

          // Update order status to confirmed
          const order = await Order.findByPk(trx.order_id, {
            include: [{ model: OrderItem, as: 'items' }],
            transaction: t,
          });

          if (order && order.status === 'pending') {
            order.status = 'confirmed';
            await order.save({ transaction: t });

            // Deduct stock
            if (order.items && order.items.length > 0) {
              await deductStockForOrder(order.id, order.items, t);
            }
          }

          await t.commit();

          // Emit socket events
          const io = req.app.get('io');
          if (io) {
            io.emit('payment-success', { orderId: trx.order_id, ref_id: midtransOrderId });
            io.emit('order-status-update', {
              orderId: trx.order_id,
              status: 'confirmed',
            });
            io.emit('stock-updated');
          }
        } catch (dbError) {
          await t.rollback();
          throw dbError;
        }
      }
    } else if (transactionStatus === 'expire') {
      trx.status = 'expired';
      await trx.save();
    } else if (transactionStatus === 'cancel' || transactionStatus === 'deny') {
      trx.status = 'failed';
      await trx.save();
    }
    // pending status — no action needed

    // Always respond 200 to Midtrans
    res.status(200).json({ success: true, message: 'Notification processed.' });
  } catch (error) {
    console.error('[Midtrans Webhook Error]', error.message);
    // Still respond 200 to prevent Midtrans from retrying
    res.status(200).json({ success: true, message: 'Notification received.' });
  }
};

/**
 * GET /api/payments/:orderId/status
 * Get payment status — also checks Midtrans API as fallback
 */
const getPaymentStatus = async (req, res, next) => {
  try {
    const trx = await Transaction.findOne({
      where: { order_id: req.params.orderId },
    });

    if (!trx) {
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
    }

    // If still pending, check Midtrans for latest status
    if (trx.status === 'pending' && trx.ref_id && !trx.ref_id.startsWith('KTK-MOCK') && !trx.ref_id.startsWith('CASH')) {
      try {
        const midtransStatus = await coreApi.transaction.status(trx.ref_id);
        const transactionStatus = midtransStatus.transaction_status;

        if (transactionStatus === 'settlement' || transactionStatus === 'capture') {
          // Payment was successful but webhook hasn't arrived yet
          const t = await sequelize.transaction();
          try {
            trx.status = 'paid';
            trx.paid_at = new Date();
            trx.trx_id = midtransStatus.transaction_id;
            await trx.save({ transaction: t });

            const order = await Order.findByPk(trx.order_id, {
              include: [{ model: OrderItem, as: 'items' }],
              transaction: t,
            });

            if (order && order.status === 'pending') {
              order.status = 'confirmed';
              await order.save({ transaction: t });

              if (order.items && order.items.length > 0) {
                await deductStockForOrder(order.id, order.items, t);
              }
            }

            await t.commit();

            // Emit socket events
            const io = req.app.get('io');
            if (io) {
              io.emit('payment-success', { orderId: trx.order_id, ref_id: trx.ref_id });
              io.emit('order-status-update', {
                orderId: trx.order_id,
                status: 'confirmed',
              });
              io.emit('stock-updated');
            }
          } catch (dbError) {
            await t.rollback();
            console.error('Error updating payment from polling:', dbError.message);
          }
        } else if (transactionStatus === 'expire') {
          trx.status = 'expired';
          await trx.save();
        } else if (transactionStatus === 'cancel' || transactionStatus === 'deny') {
          trx.status = 'failed';
          await trx.save();
        }
      } catch (midtransError) {
        // Midtrans check failed — just return local data
        console.warn('Midtrans status check failed:', midtransError.message);
      }
    }

    res.json({
      success: true,
      data: {
        status: trx.status,
        payment_method: trx.payment_method,
        amount: parseFloat(trx.amount),
        paid_at: trx.paid_at,
        qr_url: trx.qris_content,
        qris_content: trx.qris_content,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/payments/:orderId/simulate-pay
 * Development only - simulate successful payment
 */
const simulatePayment = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const trx = await Transaction.findOne({
      where: { order_id: req.params.orderId },
      transaction: t,
    });

    if (!trx) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
    }

    trx.status = 'paid';
    trx.paid_at = new Date();
    await trx.save({ transaction: t });

    // Update order
    const order = await Order.findByPk(trx.order_id, {
      include: [{ model: OrderItem, as: 'items' }],
      transaction: t,
    });
    if (order) {
      order.status = 'confirmed';
      await order.save({ transaction: t });

      // Deduct stock
      if (order.items && order.items.length > 0) {
        await deductStockForOrder(order.id, order.items, t);
      }
    }

    await t.commit();

    const io = req.app.get('io');
    if (io) {
      io.emit('payment-success', { orderId: trx.order_id, ref_id: trx.ref_id });
      io.emit('order-status-update', {
        orderId: trx.order_id,
        status: 'confirmed',
      });
      io.emit('stock-updated');
    }

    res.json({ success: true, message: 'Pembayaran berhasil (simulasi).', data: trx });
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

/**
 * POST /api/payments/:orderId/cash
 * Process manual cash payment (Kasir)
 */
const payCash = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const order = await Order.findByPk(req.params.orderId, {
      include: [{ model: OrderItem, as: 'items' }],
      transaction: t
    });

    if (!order) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }

    if (order.status !== 'pending') {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Pesanan sudah tidak pending.' });
    }

    // Check if transaction exists
    const existingTrx = await Transaction.findOne({ where: { order_id: order.id }, transaction: t });
    
    let trx;
    if (existingTrx) {
      existingTrx.status = 'paid';
      existingTrx.payment_method = 'CASH';
      existingTrx.paid_at = new Date();
      await existingTrx.save({ transaction: t });
      trx = existingTrx;
    } else {
      trx = await Transaction.create({
        order_id: order.id,
        ref_id: `CASH-${Date.now()}`,
        amount: parseFloat(order.total),
        payment_method: 'CASH',
        status: 'paid',
        paid_at: new Date(),
      }, { transaction: t });
    }

    order.status = 'confirmed';
    await order.save({ transaction: t });

    // Deduct stock
    if (order.items && order.items.length > 0) {
      await deductStockForOrder(order.id, order.items, t);
    }

    await t.commit();

    const io = req.app.get('io');
    if (io) {
      io.emit('payment-success', { orderId: order.id, ref_id: trx.ref_id });
      io.emit('order-status-update', {
        orderId: order.id,
        status: 'confirmed',
      });
      io.emit('stock-updated');
    }

    res.json({ success: true, message: 'Pembayaran tunai berhasil diproses.', data: trx });
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

module.exports = { createQrisPayment, paymentCallback, getPaymentStatus, simulatePayment, payCash };
