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

// TEMP: One-time migration to fix schema mismatches
app.get('/api/run-migration-fix', async (req, res) => {
  try {
    const { sequelize } = require('./config/database');
    const results = [];

    // 1. Fix stock_logs ENUM to include 'refund' and 'manual_reduction'
    try {
      await sequelize.query("ALTER TABLE stock_logs MODIFY COLUMN type ENUM('auto_deduction','restock','manual_adjustment','refund','manual_reduction') NOT NULL");
      results.push('✅ stock_logs.type ENUM updated');
    } catch (e) {
      results.push('⚠️ stock_logs.type: ' + e.message);
    }

    // 2. Fix customers.phone to allow NULL
    try {
      await sequelize.query("ALTER TABLE customers MODIFY COLUMN phone VARCHAR(20) NULL DEFAULT NULL");
      results.push('✅ customers.phone set to nullable');
    } catch (e) {
      results.push('⚠️ customers.phone: ' + e.message);
    }

    // 3. Add cashier_id to orders if not exists
    try {
      await sequelize.query("ALTER TABLE orders ADD COLUMN cashier_id INT NULL AFTER order_type");
      results.push('✅ orders.cashier_id added');
    } catch (e) {
      if (e.message.includes('Duplicate')) results.push('ℹ️ orders.cashier_id already exists');
      else results.push('⚠️ orders.cashier_id: ' + e.message);
    }

    // 4. Add capacity to tables_ if not exists
    try {
      await sequelize.query("ALTER TABLE tables_ ADD COLUMN capacity INT DEFAULT 4 AFTER qr_code_url");
      results.push('✅ tables_.capacity added');
    } catch (e) {
      if (e.message.includes('Duplicate')) results.push('ℹ️ tables_.capacity already exists');
      else results.push('⚠️ tables_.capacity: ' + e.message);
    }

    // 5. Add status to order_items if not exists
    try {
      await sequelize.query("ALTER TABLE order_items ADD COLUMN status ENUM('pending','preparing','completed','rejected') DEFAULT 'pending' AFTER item_type");
      results.push('✅ order_items.status added');
    } catch (e) {
      if (e.message.includes('Duplicate')) results.push('ℹ️ order_items.status already exists');
      else results.push('⚠️ order_items.status: ' + e.message);
    }

    // 6. Add completed_at to order_items if not exists
    try {
      await sequelize.query("ALTER TABLE order_items ADD COLUMN completed_at DATETIME NULL DEFAULT NULL AFTER status");
      results.push('✅ order_items.completed_at added');
    } catch (e) {
      if (e.message.includes('Duplicate')) results.push('ℹ️ order_items.completed_at already exists');
      else results.push('⚠️ order_items.completed_at: ' + e.message);
    }

    res.json({ success: true, message: 'Migration completed', results });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await testConnection();

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
