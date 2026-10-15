const axios = require('axios');
const crypto = require('crypto');
const { Transaction, Order, OrderItem } = require('../models');
const { deductStockForOrder } = require('./stockController');
const { sequelize } = require('../config/database');

// KuyzPay configuration
const KUYZPAY_MERCHANT_ID = process.env.KUYZPAY_MERCHANT_ID;
const KUYZPAY_SECRET = process.env.KUYZPAY_SECRET;
const KUYZPAY_BASE_URL = process.env.KUYZPAY_BASE_URL || 'https://api.kuyzpay.xyz/api/v1';

/**
 * POST /api/payments/create-qris
 * Generate QRIS payment via KuyzPay API
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
          pay_url: existingTrx.pay_url || null,
          status: existingTrx.status,
        },
      });
    }

    const refId = `KTK-${order.id}-${Date.now()}`;
    const grossAmount = Math.round(parseFloat(order.total));

    // Call KuyzPay API to create order
    const kuyzpayPayload = {
      merchant_id: KUYZPAY_MERCHANT_ID,
      secret: KUYZPAY_SECRET,
      ref_id: refId,
      amount: grossAmount,
      channel: 'QRIS',
      customer_name: order.customer_name || 'Customer',
      expire_minutes: 10,
    };

    console.log('[KuyzPay] Creating order:', { ref_id: refId, amount: grossAmount });

    const kuyzpayRes = await axios.post(`${KUYZPAY_BASE_URL}/order`, kuyzpayPayload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    const kuyzpayData = kuyzpayRes.data;
    console.log('[KuyzPay] Response:', JSON.stringify(kuyzpayData, null, 2));

    if (kuyzpayData.status !== 1 && kuyzpayData.status !== 'Success') {
      throw new Error(`KuyzPay error: ${kuyzpayData.message || 'Unknown error'}`);
    }

    const orderData = kuyzpayData.data;

    // qr_link is a URL to a QR image, qr_string is for rendering locally
    const qrUrl = orderData.qr_link || null;
    const qrString = orderData.qr_string || null;
    const payUrl = orderData.pay_url || null;
    const kuyzpayTrxId = orderData.trx_id || null;
    const totalBayar = orderData.total_bayar || grossAmount;

    // Save or update transaction
    const trxData = {
      ref_id: refId,
      trx_id: kuyzpayTrxId,
      amount: totalBayar,
      payment_method: 'QRIS',
      status: 'pending',
      qris_content: qrUrl || qrString,
      pay_url: payUrl,
    };

    let trx;
    if (existingTrx) {
      trx = await existingTrx.update(trxData);
    } else {
      trx = await Transaction.create({ order_id, ...trxData });
    }

    res.json({
      success: true,
      message: 'QRIS berhasil dibuat via KuyzPay.',
      data: {
        transaction_id: trx.id,
        ref_id: trx.ref_id,
        trx_id: kuyzpayTrxId,
        qr_url: qrUrl,
        qr_string: qrString,
        pay_url: payUrl,
        total_bayar: totalBayar,
        status: trx.status,
      },
    });
  } catch (error) {
    console.error('[KuyzPay] Charge error:', error.response?.data || error.message);

    // Fallback: create mock transaction if KuyzPay fails
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
        message: 'QRIS dibuat (mode fallback — KuyzPay tidak tersedia).',
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
 * KuyzPay webhook/notification handler
 */
const paymentCallback = async (req, res, next) => {
  try {
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['x-kuyzpay-signature'];
    const event = req.headers['x-kuyzpay-event'] || req.body.event;

    console.log(`[KuyzPay Webhook] Event: ${event}, Signature present: ${!!signature}`);

    // Verify HMAC-SHA256 signature if present
    if (signature && KUYZPAY_SECRET) {
      const expected = crypto.createHmac('sha256', KUYZPAY_SECRET).update(rawBody).digest('hex');
      try {
        const isValid = crypto.timingSafeEqual(
          Buffer.from(signature, 'hex'),
          Buffer.from(expected, 'hex')
        );
        if (!isValid) {
          console.warn('[KuyzPay Webhook] Invalid signature');
          return res.status(200).json({ status: true, message: 'Invalid signature, ignored.' });
        }
      } catch (e) {
        // Also verify legacy MD5 signature from body
        const md5Sig = req.body.signature;
        if (md5Sig) {
          const md5Expected = crypto.createHash('md5')
            .update(`${KUYZPAY_MERCHANT_ID}:${KUYZPAY_SECRET}:${req.body.reff_id || req.body.ref_id}`)
            .digest('hex');
          if (md5Sig !== md5Expected) {
            console.warn('[KuyzPay Webhook] Invalid MD5 signature');
          }
        }
      }
    }

    const webhookData = req.body;
    const kuyzpayStatus = webhookData.status;
    const refId = webhookData.reff_id || webhookData.ref_id || webhookData.data?.ref_id;
    const kuyzpayTrxId = webhookData.reference || webhookData.data?.trx_id;

    console.log(`[KuyzPay Webhook] ref_id: ${refId}, status: ${kuyzpayStatus}`);

    // Find transaction by ref_id
    const trx = await Transaction.findOne({ where: { ref_id: refId } });
    if (!trx) {
      console.warn(`[KuyzPay Webhook] Transaction not found for ref_id: ${refId}`);
      return res.status(200).json({ status: true, message: 'Transaction not found, ignored.' });
    }

    // Process based on event/status
    if (event === 'payment.success' || kuyzpayStatus === 'Success' || kuyzpayStatus === 'Completed') {
      const t = await sequelize.transaction();
      try {
        trx.status = 'paid';
        trx.paid_at = new Date();
        if (kuyzpayTrxId) trx.trx_id = kuyzpayTrxId;
        await trx.save({ transaction: t });

        // Update order status to confirmed
        const order = await Order.findByPk(trx.order_id, {
          include: [{ model: OrderItem, as: 'items' }],
          transaction: t,
          lock: t.LOCK.UPDATE,
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
          io.emit('payment-success', { orderId: trx.order_id, ref_id: refId });
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
    } else if (event === 'payment.expired' || kuyzpayStatus === 'Expired') {
      trx.status = 'expired';
      await trx.save();
    } else if (event === 'payment.cancelled' || kuyzpayStatus === 'Cancelled') {
      trx.status = 'failed';
      await trx.save();
    } else if (event === 'payment.late' || kuyzpayStatus === 'PaidLate') {
      // Late payment — still mark as paid
      const t = await sequelize.transaction();
      try {
        trx.status = 'paid';
        trx.paid_at = new Date();
        if (kuyzpayTrxId) trx.trx_id = kuyzpayTrxId;
        await trx.save({ transaction: t });

        const order = await Order.findByPk(trx.order_id, {
          include: [{ model: OrderItem, as: 'items' }],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (order && (order.status === 'pending' || order.status === 'cancelled')) {
          order.status = 'confirmed';
          await order.save({ transaction: t });

          if (order.items && order.items.length > 0) {
            await deductStockForOrder(order.id, order.items, t);
          }
        }

        await t.commit();

        const io = req.app.get('io');
        if (io) {
          io.emit('payment-success', { orderId: trx.order_id, ref_id: refId });
          io.emit('order-status-update', { orderId: trx.order_id, status: 'confirmed' });
          io.emit('stock-updated');
        }

        console.log(`[KuyzPay Webhook] Late payment processed for: ${refId}`);
      } catch (dbError) {
        await t.rollback();
        throw dbError;
      }
    }

    // Always respond 200 with status:true as recommended by KuyzPay docs
    res.status(200).json({ status: true });
  } catch (error) {
    console.error('[KuyzPay Webhook Error]', error.message);
    // Still respond 200 to prevent retries
    res.status(200).json({ status: true, message: 'Notification received.' });
  }
};

/**
 * GET /api/payments/:orderId/status
 * Get payment status — also checks KuyzPay API as fallback
 */
const getPaymentStatus = async (req, res, next) => {
  try {
    const trx = await Transaction.findOne({
      where: { order_id: req.params.orderId },
    });

    if (!trx) {
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
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
        pay_url: trx.pay_url || null,
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
    if (order && order.status === 'pending') {
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
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!order) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }

    if (!['pending', 'confirmed'].includes(order.status)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Pesanan tidak dapat dibayar (status: ' + order.status + ').' });
    }

    // Check if transaction exists
    const existingTrx = await Transaction.findOne({ where: { order_id: order.id }, transaction: t });
    
    if (existingTrx?.status === 'paid') {
      await t.commit();
      return res.json({ success: true, message: 'Pesanan sudah dibayar.', data: existingTrx });
    }
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
