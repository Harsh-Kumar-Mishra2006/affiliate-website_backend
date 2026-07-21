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

// ============ MODEL ASSOCIATIONS ============
const setupAssociations = () => {
  // User associations
  User.hasMany(AffiliateLink, { foreignKey: 'userId', as: 'affiliateLinks' });
  User.hasMany(Commission, { foreignKey: 'userId', as: 'commissions' });
  User.hasMany(Purchase, { foreignKey: 'userId', as: 'userPurchases' });
  User.hasMany(Purchase, { foreignKey: 'affiliateId', as: 'affiliateEarnings' });
  User.hasMany(Purchase, { foreignKey: 'paymentVerifiedBy', as: 'verifiedPurchases' });

  // Product associations
  Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
  Product.belongsTo(User, { foreignKey: 'addedBy', as: 'addedByUser' });
  Product.hasMany(AffiliateLink, { foreignKey: 'productId', as: 'productAffiliateLinks' });
  Product.hasMany(Purchase, { foreignKey: 'productId', as: 'productPurchases' });
  Product.hasMany(Commission, { foreignKey: 'productId', as: 'productCommissions' });

  // Category associations
  Category.hasMany(Product, { foreignKey: 'categoryId', as: 'products' });
  Category.hasMany(Category, { foreignKey: 'parentId', as: 'subcategories' });
  Category.belongsTo(Category, { foreignKey: 'parentId', as: 'parentCategory' });

  // AffiliateLink associations
  AffiliateLink.belongsTo(User, { foreignKey: 'userId', as: 'affiliateUser' });
  AffiliateLink.belongsTo(Product, { foreignKey: 'productId', as: 'affiliateProduct' });
  AffiliateLink.hasMany(Commission, { foreignKey: 'affiliateLinkId', as: 'linkCommissions' });

  // Commission associations
  Commission.belongsTo(User, { foreignKey: 'userId', as: 'commissionAffiliate' });
  Commission.belongsTo(Product, { foreignKey: 'productId', as: 'commissionProduct' });
  Commission.belongsTo(AffiliateLink, { foreignKey: 'affiliateLinkId', as: 'commissionLink' });
  Commission.belongsTo(Purchase, { foreignKey: 'orderId', targetKey: 'orderId', as: 'commissionPurchase' });

  // Purchase associations
  Purchase.belongsTo(User, { foreignKey: 'userId', as: 'purchaser' });
  Purchase.belongsTo(User, { foreignKey: 'affiliateId', as: 'purchaseAffiliate' });
  Purchase.belongsTo(User, { foreignKey: 'paymentVerifiedBy', as: 'paymentVerifier' });
  Purchase.belongsTo(Product, { foreignKey: 'productId', as: 'purchasedProduct' });
  Purchase.hasOne(Commission, { foreignKey: 'orderId', sourceKey: 'orderId', as: 'purchaseCommission' });

  console.log('✅ All model associations configured successfully');
};

setupAssociations();

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
    uptime: process.uptime()
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

// ============ START SERVER ============
const startServer = async () => {
  try {
    await testConnection();
    
    console.log('🔄 Performing complete database reset...');
    console.log('⚠️ WARNING: This will delete ALL existing data!');
    
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
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 API URL: http://localhost:${PORT}/api`);
      console.log(`📁 Uploads directory: ${uploadsDir}`);
      console.log(`✅ CORS enabled for: ${allowedOrigins.join(', ')}`);
      console.log('ℹ️ Database is empty. Run seeder to populate with sample data.');
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