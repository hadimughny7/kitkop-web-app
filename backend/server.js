const { emitRealtime } = require('./socket/realtimeEvents');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { testConnection } = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const setupSocket = require('./socket/orderSocket');
const { capturePaymentWebhookBody } = require('./services/paymentWebhookSignature');

// Import models (initializes associations)
require('./models');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const menuRoutes = require('./routes/menuRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const tableRoutes = require('./routes/tableRoutes');
const orderRoutes = require('./routes/orderRoutes');
const stockRoutes = require('./routes/stockRoutes');
const recipeRoutes = require('./routes/recipeRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const reportRoutes = require('./routes/reportRoutes');
const settingRoutes = require('./routes/settingRoutes');

const app = express();
app.set('trust proxy', require('./config/trustedProxies')());
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

setupSocket(io);
app.set('io', io);

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ verify: capturePaymentWebhookBody }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads/menus', require('./middleware/menuImageStatic'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/menus', menuRoutes);
app.use('/api/option-groups', require('./routes/optionGroupRoutes'));
app.use('/api/option-templates', require('./routes/optionTemplateRoutes'));
app.use('/api/categories', categoryRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/payments', paymentRoutes);
// Keep the singular URL as a compatibility alias; both use the same role checks.
app.use(['/api/reports', '/api/report'], reportRoutes);
app.use('/api/settings', settingRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Kitkop API is running! ☕', timestamp: new Date() });
});

// Error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await testConnection();
  await require('./migrations/add-barista-role')();
  await require('./migrations/add-session-versions')();
  // Required for safe order creation. Do not accept traffic if this migration fails.
  await require('./migrations/add-order-counters')();
  await require('./migrations/add-qris-attempts')();
  await require('./migrations/validate-recipe-quantities')();
  await require('./migrations/validate-menu-prices')();

  await require('./migrations/add-settings-and-service-charge')();

  // === Background job: Auto-cancel expired pending orders (10 min timeout) ===
  const PAYMENT_TIMEOUT_MINUTES = 10;
  setInterval(async () => {
    try {
      const { Order } = require('./models');
      const { expirePendingOrder } = require('./services/orderCancellation');
      const { Op } = require('sequelize');

      const expiredTime = new Date(Date.now() - PAYMENT_TIMEOUT_MINUTES * 60 * 1000);

      // Find pending orders that are older than 10 minutes
      const expiredOrders = await Order.findAll({
        where: {
          status: 'pending',
          created_at: { [Op.lt]: expiredTime },
        },
      });

      for (const candidate of expiredOrders) {
        const order = await expirePendingOrder(candidate.id, expiredTime);
        if (!order) continue;

        // Emit socket event so customer page updates in real-time
        const io = app.get('io');
        if (io) {
          emitRealtime(io, 'order-status-update', {
            orderId: order.id,
            orderNumber: order.order_number,
            status: 'cancelled',
          });
        }

        console.log(`  ⏰ Auto-cancelled expired order: ${order.order_number}`);
      }
    } catch (err) {
      console.error('  ⚠️ Payment expiry job error:', err.message);
    }
  }, 60 * 1000); // Run every 60 seconds

  server.listen(PORT, () => {
    console.log('');
    console.log('  ☕ ================================');
    console.log(`  ☕  Cafe Kitkop API Server`);
    console.log(`  ☕  Running on port ${PORT}`);
    console.log(`  ☕  http://localhost:${PORT}`);
    console.log('  ☕ ================================');
    console.log('');
  });
};

startServer().catch(async error => {
  console.error('Server startup failed:', error.message);
  await require('./config/database').sequelize.close();
  process.exitCode = 1;
});
