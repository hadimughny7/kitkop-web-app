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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/menus', menuRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Kitkop API is running! ☕', timestamp: new Date() });
});

// Error handler
app.use('/api/report', require('./routes/reportRoutes'));

// TEMP DEBUG ROUTE
app.get('/api/env-debug', (req, res) => {
  res.json({
    proxyDomain: process.env.RAILWAY_TCP_PROXY_DOMAIN,
    proxyPort: process.env.RAILWAY_TCP_PROXY_PORT,
    publicUrl: process.env.MYSQL_PUBLIC_URL
  });
});

app.get('/api/run-import', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const mysql = require('mysql2/promise');
    
    // Connect to internal Railway DB
    const connection = await mysql.createConnection({
      host: 'mysql.railway.internal',
      user: 'root',
      password: 'qkKEpBKRctgKGgPnUfGnchFXOxrDyjQs',
      database: 'railway',
      port: 3306,
      multipleStatements: true
    });
    
    const sqlPath = path.join(__dirname, 'local_backup.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await connection.query(sql);
    await connection.end();
    
    res.json({ success: true, message: 'Database imported successfully!' });
  } catch (err) {
    res.json({ success: false, error: err.message, stack: err.stack });
  }
});




app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await testConnection();

  // Auto-migrate: create settings table & add service_charge column
  try {
    const { Setting } = require('./models');
    const { sequelize } = require('./config/database');

    // Sync Settings table (creates if not exists)
    await Setting.sync();

    // Seed default settings if empty
    const count = await Setting.count();
    if (count === 0) {
      await Setting.bulkCreate([
        { key: 'tax_percentage', value: '10', description: 'Persentase pajak (%)' },
        { key: 'service_charge_percentage', value: '0', description: 'Persentase service charge (%)' },
      ]);
      console.log('  ✅ Default settings seeded');
    }

    // Add service_charge column to orders if not exists
    try {
      await sequelize.query(`ALTER TABLE orders ADD COLUMN service_charge DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER tax`);
      console.log('  ✅ service_charge column added to orders');
    } catch (e) {
      // Column already exists, ignore
    }

    console.log('  ✅ Settings auto-migration complete');
  } catch (e) {
    console.error('  ⚠️ Auto-migration warning:', e.message);
  }

  // === Background job: Auto-cancel expired pending orders (10 min timeout) ===
  const PAYMENT_TIMEOUT_MINUTES = 10;
  setInterval(async () => {
    try {
      const { Order, OrderStatusLog, Transaction } = require('./models');
      const { Op } = require('sequelize');

      const expiredTime = new Date(Date.now() - PAYMENT_TIMEOUT_MINUTES * 60 * 1000);

      // Find pending orders that are older than 10 minutes
      const expiredOrders = await Order.findAll({
        where: {
          status: 'pending',
          created_at: { [Op.lt]: expiredTime },
        },
      });

      for (const order of expiredOrders) {
        order.status = 'cancelled';
        await order.save();

        await OrderStatusLog.create({
          order_id: order.id,
          status: 'cancelled',
          notes: `Pesanan dibatalkan otomatis: batas waktu pembayaran ${PAYMENT_TIMEOUT_MINUTES} menit telah habis.`,
        });

        // Cancel pending transaction if exists
        await Transaction.update(
          { status: 'expired' },
          { where: { order_id: order.id, status: 'pending' } }
        );

        // Emit socket event so customer page updates in real-time
        const io = app.get('io');
        if (io) {
          io.emit('order-status-update', {
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

startServer();
