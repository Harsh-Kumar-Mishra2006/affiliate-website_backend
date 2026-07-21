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

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Authorization']
}));

// Handle preflight requests
app.options('/*splat', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files for uploads
app.use('/uploads', express.static('uploads'));

// Set up model associations with unique aliases
const setupAssociations = () => {
  // ============ USER ASSOCIATIONS ============
  User.hasMany(AffiliateLink, { foreignKey: 'userId', as: 'affiliateLinks' });
  User.hasMany(Commission, { foreignKey: 'userId', as: 'commissions' });
  User.hasMany(Purchase, { foreignKey: 'userId', as: 'userPurchases' });
  User.hasMany(Purchase, { foreignKey: 'affiliateId', as: 'affiliateEarnings' });
  User.hasMany(Purchase, { foreignKey: 'paymentVerifiedBy', as: 'verifiedPurchases' });

  // ============ PRODUCT ASSOCIATIONS ============
  Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
  Product.belongsTo(User, { foreignKey: 'addedBy', as: 'addedByUser' });
  Product.hasMany(AffiliateLink, { foreignKey: 'productId', as: 'productAffiliateLinks' });
  Product.hasMany(Purchase, { foreignKey: 'productId', as: 'productPurchases' });
  Product.hasMany(Commission, { foreignKey: 'productId', as: 'productCommissions' });

  // ============ CATEGORY ASSOCIATIONS ============
  Category.hasMany(Product, { foreignKey: 'categoryId', as: 'products' });
  Category.hasMany(Category, { foreignKey: 'parentId', as: 'subcategories' });
  Category.belongsTo(Category, { foreignKey: 'parentId', as: 'parentCategory' });

  // ============ AFFILIATE LINK ASSOCIATIONS ============
  AffiliateLink.belongsTo(User, { foreignKey: 'userId', as: 'affiliateUser' });
  AffiliateLink.belongsTo(Product, { foreignKey: 'productId', as: 'affiliateProduct' });
  AffiliateLink.hasMany(Commission, { foreignKey: 'affiliateLinkId', as: 'linkCommissions' });

  // ============ COMMISSION ASSOCIATIONS ============
  Commission.belongsTo(User, { foreignKey: 'userId', as: 'commissionAffiliate' });
  Commission.belongsTo(Product, { foreignKey: 'productId', as: 'commissionProduct' });
  Commission.belongsTo(AffiliateLink, { foreignKey: 'affiliateLinkId', as: 'commissionLink' });
  Commission.belongsTo(Purchase, { foreignKey: 'orderId', targetKey: 'orderId', as: 'commissionPurchase' });

  // ============ PURCHASE ASSOCIATIONS ============
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
    status: 'OK',
    message: 'Affiliate Products API is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler - MUST be before error handler
app.use((req, res) => {
  console.log(`404: ${req.method} ${req.url} not found`);
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.url} not found`
  });
});

// Error handling middleware - ALWAYS last
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    success: false,
    error: err.message || 'Something went wrong!'
  });
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Test database connection
    await testConnection();
    
    console.log('🔄 Checking database schema...');
    
    // Check if Users table exists
    const [tables] = await sequelize.query('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0]);
    const hasUsersTable = tableNames.includes('Users');
    
    if (hasUsersTable) {
      console.log('⚠️ Tables already exist. Using existing schema...');
      // Just sync without altering - this won't change the schema
      await sequelize.sync({ alter: false });
      console.log('✅ Tables checked successfully');
    } else {
      console.log('🔄 No tables found. Creating fresh schema...');
      // Create fresh tables
      await sequelize.sync({ force: true });
      console.log('✅ All tables created successfully');
    }
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 API URL: http://localhost:${PORT}/api`);
      console.log(`📁 Uploads directory: ${uploadsDir}`);
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