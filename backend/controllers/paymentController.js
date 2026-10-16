const { emitRealtime } = require('../socket/realtimeEvents');
const { Transaction, Order, OrderItem, QrisAttempt } = require('../models');
const { createOrReuseQris, currentAttempt, paymentData } = require('../services/qrisPayments');
const { deductStockForOrder } = require('./stockController');
const { sequelize } = require('../config/database');
const { validPaymentWebhookSignature } = require('../services/paymentWebhookSignature');

// KuyzPay configuration
const KUYZPAY_SECRET = process.env.KUYZPAY_SECRET;

/**
 * POST /api/payments/create-qris
 * Generate QRIS payment via KuyzPay API
 */
const createQrisPayment = async (req, res, next) => {
  try {
    const { order_id } = req.body;
    if (!Number.isInteger(Number(order_id)) || Number(order_id) < 1 || typeof order_id === 'boolean' || Array.isArray(order_id)) {
      return res.status(400).json({ success: false, message: 'ID pesanan tidak valid.' });
    }
    const result = await createOrReuseQris(Number(order_id));
    res.status(result.httpStatus).json({ success: true, message: result.data.status === 'paid' ? 'Pesanan sudah dibayar.' : result.data.qris_state === 'creating' ? 'QRIS sedang dibuat.' : 'Status QRIS diperbarui.', data: result.data });
  } catch (error) { next(error); }
};

/**
 * POST /api/payments/callback
 * KuyzPay webhook/notification handler
 */
const paymentCallback = async (req, res, next) => {
  try {
    if (!KUYZPAY_SECRET || !KUYZPAY_SECRET.trim()) {
      console.error('[KuyzPay Webhook] Webhook secret is not configured');
      return res.status(503).json({ status: false, message: 'Verifikasi pembayaran belum dikonfigurasi.' });
    }
    if (!Buffer.isBuffer(req.rawBody)) {
      return res.status(400).json({ status: false, message: 'Webhook harus berupa JSON dengan raw body yang tersedia.' });
    }
    if (!validPaymentWebhookSignature(req.rawBody, req.headers['x-kuyzpay-signature'], KUYZPAY_SECRET)) {
      return res.status(401).json({ status: false, message: 'Signature webhook tidak valid.' });
    }
    // Only signed body fields may determine payment actions. Headers are not signed.
    const event = req.body.event;
    const headerEvent = req.headers['x-kuyzpay-event'];
    if (headerEvent && headerEvent !== event) {
      return res.status(400).json({ status: false, message: 'Event webhook tidak sesuai dengan payload.' });
    }

    const webhookData = req.body;
    const kuyzpayStatus = webhookData.status;
    const refId = webhookData.reff_id || webhookData.ref_id || webhookData.data?.ref_id;
    const kuyzpayTrxId = webhookData.reference || webhookData.data?.trx_id;

    console.log(`[KuyzPay Webhook] ref_id: ${refId}, status: ${kuyzpayStatus}`);

    // Find transaction by ref_id
    const attempt = await QrisAttempt.findOne({ where: { ref_id: refId, source: 'gateway' } });
    const trx = await Transaction.findOne({ where: { ref_id: refId } })
      || (attempt ? await Transaction.findByPk(attempt.transaction_id) : null);
    if (!trx) {
      console.warn(`[KuyzPay Webhook] Transaction not found for ref_id: ${refId}`);
      return res.status(200).json({ status: true, message: 'Transaction not found, ignored.' });
    }

    // Process based on event/status
    if (event === 'payment.success' || kuyzpayStatus === 'Success' || kuyzpayStatus === 'Completed') {
      const t = await sequelize.transaction();
      try {
        // Update order status to confirmed
        const order = await Order.findByPk(trx.order_id, {
          include: [{ model: OrderItem, as: 'items' }],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        // Keep lock order consistent with cancellation and cash payment: order first.
        await trx.reload({ transaction: t, lock: t.LOCK.UPDATE });
        const alreadyPaid = trx.status === 'paid';
        if (!alreadyPaid) {
          trx.status = 'paid';
          trx.paid_at = new Date();
          if (kuyzpayTrxId) trx.trx_id = kuyzpayTrxId;
        }
        if (attempt) {
          await QrisAttempt.update({ status: 'paid', ...(kuyzpayTrxId ? { trx_id: kuyzpayTrxId } : {}) }, { where: { id: attempt.id }, transaction: t });
          if (!alreadyPaid && trx.payment_method !== 'CASH') trx.amount = (await attempt.reload({ transaction: t })).amount;
        }
        await trx.save({ transaction: t });

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
          emitRealtime(io, 'payment-success', { orderId: trx.order_id, ref_id: refId });
          emitRealtime(io, 'order-status-update', {
            orderId: trx.order_id,
            status: order?.status,
          });
          emitRealtime(io, 'stock-updated');
        }
      } catch (dbError) {
        await t.rollback();
        throw dbError;
      }
    } else if (['payment.expired', 'payment.cancelled'].includes(event) || ['Expired', 'Cancelled'].includes(kuyzpayStatus)) {
      const status = event === 'payment.expired' || kuyzpayStatus === 'Expired' ? 'expired' : 'failed';
      await sequelize.transaction(async transaction => {
        await Order.findByPk(trx.order_id, { transaction, lock: transaction.LOCK.UPDATE });
        const current = await Transaction.findByPk(trx.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (attempt) {
          await QrisAttempt.update({ status }, { where: { id: attempt.id, status: { [require('sequelize').Op.ne]: 'paid' } }, transaction });
        }
        // An old attempt may expire after a newer invoice or cash payment exists.
        if (current.ref_id === refId && current.status !== 'paid') await current.update({ status }, { transaction });
      });
    } else if (event === 'payment.late' || kuyzpayStatus === 'PaidLate') {
      // Late payment — still mark as paid
      const t = await sequelize.transaction();
      try {
        const order = await Order.findByPk(trx.order_id, {
          include: [{ model: OrderItem, as: 'items' }],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        // Keep lock order consistent with cancellation and cash payment: order first.
        await trx.reload({ transaction: t, lock: t.LOCK.UPDATE });
        const alreadyPaid = trx.status === 'paid';
        if (!alreadyPaid) {
          trx.status = 'paid';
          trx.paid_at = new Date();
          if (kuyzpayTrxId) trx.trx_id = kuyzpayTrxId;
        }
        if (attempt) {
          await QrisAttempt.update({ status: 'paid', ...(kuyzpayTrxId ? { trx_id: kuyzpayTrxId } : {}) }, { where: { id: attempt.id }, transaction: t });
          if (!alreadyPaid && trx.payment_method !== 'CASH') trx.amount = (await attempt.reload({ transaction: t })).amount;
        }
        await trx.save({ transaction: t });

        if (order && order.status === 'pending') {
          order.status = 'confirmed';
          await order.save({ transaction: t });

          if (order.items && order.items.length > 0) {
            await deductStockForOrder(order.id, order.items, t);
          }
        }

        await t.commit();

        const io = req.app.get('io');
        if (io) {
          emitRealtime(io, 'payment-success', { orderId: trx.order_id, ref_id: refId });
          emitRealtime(io, 'order-status-update', { orderId: trx.order_id, status: order?.status });
          emitRealtime(io, 'stock-updated');
        }

        console.log(`[KuyzPay Webhook] Late payment processed for: ${refId}`);
      } catch (dbError) {
        await t.rollback();
        throw dbError;
      }
    }

    // Acknowledge only after successful validation and processing.
    res.status(200).json({ status: true });
  } catch (error) {
    console.error('[KuyzPay Webhook Error]', error.message);
    res.status(500).json({ status: false, message: 'Gagal memproses notifikasi pembayaran.' });
  }
};

/**
 * GET /api/payments/:orderId/status
 * Return stored payment status and validated QRIS retry metadata.
 */
const getPaymentStatus = async (req, res, next) => {
  try {
    const trx = await Transaction.findOne({
      where: { order_id: req.params.orderId },
    });

    if (!trx) {
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' });
    }

    const order = await Order.findByPk(trx.order_id);
    const attempt = await currentAttempt(trx);
    res.json({ success: true, data: paymentData(trx, attempt, order) });
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

    // Use the same order-first lock as cash, callbacks and cancellation.
    const order = await Order.findByPk(trx.order_id, {
      include: [{ model: OrderItem, as: 'items' }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    trx.status = 'paid';
    trx.paid_at = new Date();
    await trx.save({ transaction: t });

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
      emitRealtime(io, 'payment-success', { orderId: trx.order_id, ref_id: trx.ref_id });
      emitRealtime(io, 'order-status-update', {
        orderId: trx.order_id,
        status: order?.status,
      });
      emitRealtime(io, 'stock-updated');
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
      existingTrx.amount = Number(order.total);
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
      emitRealtime(io, 'payment-success', { orderId: order.id, ref_id: trx.ref_id });
      emitRealtime(io, 'order-status-update', {
        orderId: order.id,
        status: 'confirmed',
      });
      emitRealtime(io, 'stock-updated');
    }

    res.json({ success: true, message: 'Pembayaran tunai berhasil diproses.', data: trx });
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

module.exports = { createQrisPayment, paymentCallback, getPaymentStatus, simulatePayment, payCash };
