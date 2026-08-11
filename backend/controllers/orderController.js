const { Order, OrderItem, OrderStatusLog, Customer, Table, Menu, MenuCategory, Transaction, User } = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { refundStockForOrderItem } = require('./stockController');

/**
 * Generate unique order number: ORD-YYYYMMDD-XXXX
 */
const generateOrderNumber = async () => {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `ORD-${dateStr}-`;

  const lastOrder = await Order.findOne({
    where: { order_number: { [Op.like]: `${prefix}%` } },
    order: [['order_number', 'DESC']],
  });

  let sequence = 1;
  if (lastOrder) {
    const lastSeq = parseInt(lastOrder.order_number.split('-').pop(), 10);
    sequence = lastSeq + 1;
  }

  return `${prefix}${String(sequence).padStart(4, '0')}`;
};

/**
 * POST /api/orders
 * Create new order (customer QR or kasir)
 */
const createOrder = async (req, res, next) => {
  const t = await sequelize.transaction();

  try {
    const { table_id, customer_name, customer_phone, customer_email, items, order_type } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Pesanan harus memiliki minimal 1 item.' });
    }

    if (!customer_name) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Nama pelanggan wajib diisi.' });
    }

    // Create or find customer
    let customer;
    if (customer_phone) {
      customer = await Customer.findOne({
        where: { phone: customer_phone },
      }, { transaction: t });
    }

    if (!customer) {
      customer = await Customer.create({
        name: customer_name,
        phone: customer_phone || null,
        email: customer_email || null,
      }, { transaction: t });
    } else {
      // Update name if different
      if (customer.name !== customer_name) {
        customer.name = customer_name;
        if (customer_email) customer.email = customer_email;
        await customer.save({ transaction: t });
      }
    }

    // Calculate totals
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const menu = await Menu.findByPk(item.menu_id, {
        include: [{ model: MenuCategory, as: 'category' }],
      });

      if (!menu) {
        await t.rollback();
        return res.status(400).json({ success: false, message: `Menu dengan ID ${item.menu_id} tidak ditemukan.` });
      }

      if (!menu.is_available) {
        await t.rollback();
        return res.status(400).json({ success: false, message: `Menu "${menu.name}" sedang tidak tersedia.` });
      }

      const itemTotal = parseFloat(menu.price) * item.qty;
      subtotal += itemTotal;

      // Determine item_type from category
      let item_type = 'makanan';
      if (menu.category) {
        const catId = menu.category.id;
        if ([1, 2, 3].includes(catId)) {
          item_type = 'minuman';
        } else if (catId === 6) {
          item_type = 'snack';
        } else {
          item_type = 'makanan';
        }
      }

      orderItems.push({
        menu_id: item.menu_id,
        qty: item.qty,
        price: parseFloat(menu.price),
        notes: item.notes || null,
        item_type,
      });
    }

    const tax = Math.round(subtotal * 0.10);
    const total = subtotal + tax;
    const order_number = await generateOrderNumber();

    const hasFood = orderItems.some(i => i.item_type === 'makanan' || i.item_type === 'snack');
    const hasDrink = orderItems.some(i => i.item_type === 'minuman');

    // Determine cashier_id
    let assignedCashierId = req.user ? req.user.id : null;
    if (!assignedCashierId) {
      // Find active kasir
      let activeCashier = await User.findOne({ where: { role: 'kasir', is_active: true } });
      if (!activeCashier) {
        // Fallback to manajer or owner
        activeCashier = await User.findOne({
          where: {
            role: { [Op.in]: ['manajer', 'owner'] },
            is_active: true
          }
        });
      }
      if (activeCashier) {
        assignedCashierId = activeCashier.id;
      }
    }

    // Create order
    const order = await Order.create({
      table_id: table_id || null,
      customer_id: customer.id,
      cashier_id: assignedCashierId,
      order_number,
      status: 'pending',
      subtotal,
      tax,
      total,
      order_type: order_type || 'qr',
    }, { transaction: t });

    // Create order items
    for (const item of orderItems) {
      await OrderItem.create({
        order_id: order.id,
        ...item,
      }, { transaction: t });
    }

    // Create initial status log
    await OrderStatusLog.create({
      order_id: order.id,
      status: 'pending',
      notes: 'Pesanan dibuat',
    }, { transaction: t });

    await t.commit();

    // Fetch complete order for response
    const completeOrder = await Order.findByPk(order.id, {
      include: [
        { model: OrderItem, as: 'items', include: [{ model: Menu, as: 'menu', attributes: ['id', 'name', 'image'] }] },
        { model: Customer, as: 'customer' },
        { model: Table, as: 'table' },
        { model: User, as: 'cashier', attributes: ['id', 'name'] },
      ],
    });

    // Emit Socket.io event for real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('new-order', completeOrder);
    }

    res.status(201).json({
      success: true,
      message: 'Pesanan berhasil dibuat.',
      data: completeOrder,
    });
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

/**
 * GET /api/orders
 * List orders with filters
 */
const getOrders = async (req, res, next) => {
  try {
    const { status, order_type, date, page = 1, limit = 20 } = req.query;

    const where = {};
    if (status) where.status = status;
    if (order_type) where.order_type = order_type;
    if (date) {
      // date = "YYYY-MM-DD", create range in WIB (UTC+7)
      const startDate = new Date(`${date}T00:00:00+07:00`);
      const endDate = new Date(`${date}T23:59:59+07:00`);
      where.created_at = { [Op.between]: [startDate, endDate] };
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Order.findAndCountAll({
      where,
      include: [
        { model: OrderItem, as: 'items', include: [{ model: Menu, as: 'menu', attributes: ['id', 'name', 'image'] }] },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone', 'email'] },
        { model: Table, as: 'table', attributes: ['id', 'table_number'] },
        { model: Transaction, as: 'transaction', attributes: ['id', 'status', 'payment_method'] },
        { model: User, as: 'cashier', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset,
      distinct: true,
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/orders/:id
 * Get single order detail
 */
const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findByPk(req.params.id, {
      include: [
        { model: OrderItem, as: 'items', include: [{ model: Menu, as: 'menu' }] },
        { model: Customer, as: 'customer' },
        { model: Table, as: 'table' },
        { model: Transaction, as: 'transaction' },
        { model: User, as: 'cashier', attributes: ['id', 'name'] },
        {
          model: OrderStatusLog,
          as: 'statusLogs',
          order: [['changed_at', 'ASC']],
        },
      ],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/orders/track/:orderNumber
 * Track order by order_number (for customer)
 */
const trackOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      where: { order_number: req.params.orderNumber },
      include: [
        { model: OrderItem, as: 'items', include: [{ model: Menu, as: 'menu', attributes: ['id', 'name', 'price', 'image'] }] },
        { model: Customer, as: 'customer', attributes: ['name', 'phone'] },
        { model: Table, as: 'table', attributes: ['table_number'] },
        { model: Transaction, as: 'transaction', attributes: ['status', 'payment_method'] },
        { model: OrderStatusLog, as: 'statusLogs', attributes: ['status', 'changed_at', 'notes'] },
        { model: User, as: 'cashier', attributes: ['id', 'name'] },
      ],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/orders/:id/status
 * Update order status
 */
const updateOrderStatus = async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const order = await Order.findByPk(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }

    const validTransitions = {
      pending: ['confirmed', 'preparing', 'cancelled'],
      confirmed: ['preparing', 'cancelled'],
      preparing: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[order.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Tidak dapat mengubah status dari "${order.status}" ke "${status}".`,
      });
    }

    order.status = status;
    await order.save();

    // Log status change
    await OrderStatusLog.create({
      order_id: order.id,
      status,
      changed_by: req.user ? req.user.id : null,
      notes: notes || null,
    });

    // Emit Socket.io event
    const io = req.app.get('io');
    if (io) {
      io.emit('order-status-update', {
        orderId: order.id,
        orderNumber: order.order_number,
        status,
        updatedAt: new Date(),
      });
    }

    res.json({
      success: true,
      message: `Status pesanan berhasil diubah ke "${status}".`,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};



/**
 * PATCH /api/orders/:orderId/items/:itemId/reject
 * Reject a specific item in an order
 */
const rejectOrderItem = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { orderId, itemId } = req.params;

    const order = await Order.findByPk(orderId, { transaction: t });
    if (!order) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }

    const orderItem = await OrderItem.findOne({
      where: { id: itemId, order_id: orderId },
      transaction: t,
    });

    if (!orderItem) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Item pesanan tidak ditemukan.' });
    }

    if (orderItem.status === 'rejected') {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Item sudah ditolak.' });
    }

    // Mark as rejected
    orderItem.status = 'rejected';
    await orderItem.save({ transaction: t });

    // Refund stock if order is not pending (meaning it was paid)
    if (order.status !== 'pending' && order.status !== 'cancelled') {
      await refundStockForOrderItem(order.id, orderItem, t);
    }

    // Recalculate totals
    const allItems = await OrderItem.findAll({ where: { order_id: order.id }, transaction: t });
    let activeTotal = 0;
    let allRejected = true;
    
    for (const item of allItems) {
      if (item.status !== 'rejected') {
        activeTotal += parseFloat(item.price) * item.qty;
        allRejected = false;
      }
    }

    if (allRejected) {
      order.status = 'cancelled';
    }

    // Tax is 10%
    const subtotal = activeTotal;
    const tax = subtotal * 0.1;
    const total = subtotal + tax;

    order.subtotal = subtotal;
    order.tax = tax;
    order.total = total;

    await order.save({ transaction: t });

    await OrderStatusLog.create({
      order_id: order.id,
      status: order.status,
      notes: `Satu item ditolak, total harga disesuaikan.`,
    }, { transaction: t });

    await t.commit();

    // Fetch updated order to broadcast
    const completeOrder = await Order.findByPk(order.id, {
      include: [
        { model: OrderItem, as: 'items', include: [{ model: Menu, as: 'menu', attributes: ['id', 'name', 'image'] }] },
        { model: Customer, as: 'customer' },
        { model: Table, as: 'table' },
      ],
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('order-status-update', {
        orderId: completeOrder.id,
        orderNumber: completeOrder.order_number,
        status: completeOrder.status,
        updatedAt: new Date(),
        items: completeOrder.items,
      });
      io.emit('stock-updated');
    }

    res.json({
      success: true,
      message: 'Item pesanan berhasil ditolak.',
      data: completeOrder,
    });
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

/**
 * PATCH /api/orders/:orderId/items/:itemId/status
 * Update a single item's status (pending → preparing → completed)
 */
const updateItemStatus = async (req, res, next) => {
  try {
    const { orderId, itemId } = req.params;
    const { status } = req.body;

    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }

    const orderItem = await OrderItem.findOne({
      where: { id: itemId, order_id: orderId },
    });

    if (!orderItem) {
      return res.status(404).json({ success: false, message: 'Item pesanan tidak ditemukan.' });
    }

    if (orderItem.status === 'rejected') {
      return res.status(400).json({ success: false, message: 'Item sudah ditolak.' });
    }

    const validItemTransitions = {
      pending: ['preparing'],
      preparing: ['completed'],
      completed: [],
    };

    if (!validItemTransitions[orderItem.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Tidak dapat mengubah status item dari "${orderItem.status}" ke "${status}".`,
      });
    }

    orderItem.status = status;
    if (status === 'completed') {
      orderItem.completed_at = new Date();
    }
    await orderItem.save();

    // Check if all non-rejected items have the same status to auto-advance order
    const allItems = await OrderItem.findAll({ where: { order_id: orderId } });
    const activeItems = allItems.filter(i => i.status !== 'rejected');
    const allPreparing = activeItems.every(i => i.status === 'preparing' || i.status === 'completed');
    const allCompleted = activeItems.every(i => i.status === 'completed');

    if (allCompleted && order.status !== 'completed') {
      order.status = 'completed';
      await order.save();
      await OrderStatusLog.create({
        order_id: order.id,
        status: 'completed',
        changed_by: req.user ? req.user.id : null,
        notes: 'Semua item selesai diproses.',
      });
    } else if (allPreparing && order.status === 'confirmed') {
      order.status = 'preparing';
      await order.save();
      await OrderStatusLog.create({
        order_id: order.id,
        status: 'preparing',
        changed_by: req.user ? req.user.id : null,
        notes: 'Item mulai diproses.',
      });
    }

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('order-item-update', {
        orderId: order.id,
        orderNumber: order.order_number,
        itemId: orderItem.id,
        itemStatus: status,
        orderStatus: order.status,
      });
      io.emit('order-status-update', {
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status,
        updatedAt: new Date(),
      });
    }

    res.json({
      success: true,
      message: `Status item berhasil diubah ke "${status}".`,
      data: { item: orderItem, orderStatus: order.status },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/orders/:orderId/items/process-all
 * Process all pending items at once (pending → preparing)
 */
const processAllItems = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }

    // Update all pending items to preparing
    await OrderItem.update(
      { status: 'preparing' },
      { where: { order_id: orderId, status: 'pending' } }
    );

    // Update order status to preparing
    if (order.status === 'confirmed') {
      order.status = 'preparing';
      await order.save();
      await OrderStatusLog.create({
        order_id: order.id,
        status: 'preparing',
        changed_by: req.user ? req.user.id : null,
        notes: 'Semua item mulai diproses.',
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('order-item-update', {
        orderId: order.id,
        orderNumber: order.order_number,
        itemStatus: 'preparing',
        orderStatus: order.status,
        bulk: true,
      });
      io.emit('order-status-update', {
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status,
        updatedAt: new Date(),
      });
    }

    res.json({
      success: true,
      message: 'Semua item mulai diproses.',
      data: { orderStatus: order.status },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/orders/:orderId/items/complete-all
 * Complete all preparing items at once (preparing → completed)
 */
const completeAllItems = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }

    const now = new Date();

    // Update all preparing items to completed
    await OrderItem.update(
      { status: 'completed', completed_at: now },
      { where: { order_id: orderId, status: 'preparing' } }
    );

    // Also complete any remaining pending items
    await OrderItem.update(
      { status: 'completed', completed_at: now },
      { where: { order_id: orderId, status: 'pending' } }
    );

    // Update order status to completed
    order.status = 'completed';
    await order.save();
    await OrderStatusLog.create({
      order_id: order.id,
      status: 'completed',
      changed_by: req.user ? req.user.id : null,
      notes: 'Semua item selesai diproses.',
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('order-item-update', {
        orderId: order.id,
        orderNumber: order.order_number,
        itemStatus: 'completed',
        orderStatus: 'completed',
        bulk: true,
      });
      io.emit('order-status-update', {
        orderId: order.id,
        orderNumber: order.order_number,
        status: 'completed',
        updatedAt: new Date(),
      });
    }

    res.json({
      success: true,
      message: 'Semua item selesai.',
      data: { orderStatus: order.status },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { createOrder, getOrders, getOrderById, trackOrder, updateOrderStatus, rejectOrderItem, updateItemStatus, processAllItems, completeAllItems };
