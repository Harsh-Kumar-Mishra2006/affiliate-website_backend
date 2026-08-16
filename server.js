// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sequelize, testConnection } = require('./config/db');
const fs = require('fs');
const path = require('path');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads/payments');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Import models
const Category = require('./models/Category');
const User = require('./models/User');
const Product = require('./models/Product');
const AffiliateLink = require('./models/AffiliateLink');
const Commission = require('./models/CommissionModel');
const Purchase = require('./models/Purchase');

// Import routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const seederRoutes = require('./routes/seedersRoute');
const purchaseRoutes = require('./routes/purchaseRoutes');
const commissionRoutes = require('./routes/commissionRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// ✅ Initialize associations from model files ONLY
const models = { User, Product, Category, Purchase, Commission, AffiliateLink };
Object.values(models).forEach(model => {
  if (model.associate) {
    model.associate(models);
  }
});

// CORS Configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked for origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  exposedHeaders: ['Authorization', 'X-Total-Count'],
  maxAge: 86400
}));

app.options('/*splat', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', productRoutes);
app.use('/api', seederRoutes);
app.use('/api', purchaseRoutes);
app.use('/api', commissionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    message: 'Affiliate Products API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV
  });
});

// 404 handler
app.use((req, res) => {
  console.log(`⚠️ 404: ${req.method} ${req.url} not found`);
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.url} not found`
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Something went wrong!'
  });
});

const syncDatabase = async () => {
  if (IS_PRODUCTION) {
    // ============ PRODUCTION: SAFE SYNC (NO ALTER, NO FORCE) ============
    console.log('🔄 Running in PRODUCTION mode - Using safe sync...');
    
    try {
      // Check if tables exist
      const [tables] = await sequelize.query('SHOW TABLES');
      const tableNames = tables.map(t => Object.values(t)[0]);
      
      if (tableNames.length === 0) {
        console.error('❌ CRITICAL: No tables found in production!');
        console.error('⚠️ Database appears empty. Please restore from backup or run migrations manually.');
        console.error('⚠️ DO NOT auto-create tables in production to prevent data loss!');
        throw new Error('Production database is empty - manual intervention required');
      } else {
        // Tables exist - DO NOT sync at all (no alter, no force)
        console.log(`📊 Found ${tableNames.length} existing tables.`);
        console.log('📋 Existing tables:', tableNames.join(', '));
        console.log('✅ Database schema is ready (no changes made)');
        
        // Optionally, verify critical tables exist
        const criticalTables = ['Users', 'Products', 'Categories', 'Purchases', 'Commissions'];
        const missingTables = criticalTables.filter(t => !tableNames.includes(t));
        
        if (missingTables.length > 0) {
          console.warn(`⚠️ Warning: Missing critical tables: ${missingTables.join(', ')}`);
          console.warn('⚠️ Some features may not work correctly');
        }
      }
    } catch (error) {
      console.error('❌ Production sync error:', error);
      throw error;
    }
  } else {
    // ============ DEVELOPMENT: Full reset (FORCE SYNC) ============
    console.log('🔄 Running in DEVELOPMENT mode - Performing complete database reset...');
    console.log('⚠️ WARNING: This will delete ALL existing data!');
    
    try {
      // Disable foreign key checks
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
      
      // Get all table names
      const [tables] = await sequelize.query('SHOW TABLES');
      const tableNames = tables.map(t => Object.values(t)[0]);
      
      if (tableNames.length > 0) {
        console.log(`🗑️ Dropping ${tableNames.length} existing tables...`);
        
        // Drop all tables in reverse order (child tables first)
        const dropOrder = ['Commissions', 'Purchases', 'AffiliateLinks', 'Products', 'Categories', 'Users'];
        
        for (const table of dropOrder) {
          if (tableNames.includes(table)) {
            await sequelize.query(`DROP TABLE IF EXISTS ${table}`);
            console.log(`   ✅ Dropped ${table}`);
          }
        }
        
        // Drop any remaining tables
        for (const table of tableNames) {
          if (!dropOrder.includes(table)) {
            await sequelize.query(`DROP TABLE IF EXISTS ${table}`);
            console.log(`   ✅ Dropped ${table}`);
          }
        }
      }
      
      // Re-enable foreign key checks
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
      
      // ============ CREATE TABLES IN CORRECT ORDER ============
      console.log('🔄 Creating tables in correct order...');
      
      // 1. Create Category table first (no foreign keys)
      await Category.sync({ force: true });
      console.log('✅ Categories table created');
      
      // 2. Create User table (no foreign keys to Category)
      await User.sync({ force: true });
      console.log('✅ Users table created');
      
      // 3. Create Product table (foreign keys to Category and User)
      await Product.sync({ force: true });
      console.log('✅ Products table created');
      
      // 4. Create AffiliateLink table (foreign keys to User and Product)
      await AffiliateLink.sync({ force: true });
      console.log('✅ AffiliateLinks table created');
      
      // 5. Create Purchase table (foreign keys to User, Product)
      await Purchase.sync({ force: true });
      console.log('✅ Purchases table created');
      
      // 6. Create Commission table (foreign keys to User, Product, AffiliateLink, Purchase)
      await Commission.sync({ force: true });
      console.log('✅ Commissions table created');
      
      console.log('✅ All tables created successfully');
      console.log('ℹ️ Database is empty. Run seeder to populate with sample data.');
      
    } catch (error) {
      console.error('❌ Development sync error:', error);
      throw error;
    }
  }
};

// ============ START SERVER ============
const startServer = async () => {
  try {
    await testConnection();
    console.log('✅ Database connection established');
    
    // Sync database based on environment
    await syncDatabase();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📝 Environment: ${NODE_ENV}`);
      console.log(`🔗 API URL: http://localhost:${PORT}/api`);
      console.log(`📁 Uploads directory: ${uploadsDir}`);
      console.log(`✅ CORS enabled for: ${allowedOrigins.join(', ')}`);
      
      if (IS_PRODUCTION) {
        console.log('🔒 Running in PRODUCTION mode - Data is safe!');
        console.log('ℹ️ To update database schema, run migrations manually.');
      } else {
        console.log('🔧 Running in DEVELOPMENT mode - Database resets on each restart');
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  sequelize.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  sequelize.close();
  process.exit(0);
});