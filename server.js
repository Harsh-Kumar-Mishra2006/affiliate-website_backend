// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sequelize, testConnection } = require('./config/db');

// Import models in correct order
const Category = require('./models/Category');
const User = require('./models/User');
const Product = require('./models/Product');
const AffiliateLink = require('./models/AffiliateLink');
const Commission = require('./models/CommissionModel');

// Import routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const seederRoutes = require('./routes/seedersRoute');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up model associations (only define associations that aren't already in models)
const setupAssociations = () => {
  // User associations - REMOVED the duplicate 'addedProducts' association
  // The User.hasMany(Product, { foreignKey: 'addedBy', as: 'addedProducts' }) is already defined in User.js
  User.hasMany(AffiliateLink, { foreignKey: 'userId' });
  User.hasMany(Commission, { foreignKey: 'userId' });
  // User.hasMany(Product, { foreignKey: 'addedBy', as: 'addedProducts' }); // <-- REMOVE THIS LINE

  // Product associations
  Product.belongsTo(Category, { foreignKey: 'categoryId' });
  Product.belongsTo(User, { foreignKey: 'addedBy', as: 'addedByUser' });
  Product.hasMany(AffiliateLink, { foreignKey: 'productId' });

  // Category associations
  Category.hasMany(Product, { foreignKey: 'categoryId' });
  Category.hasMany(Category, { foreignKey: 'parentId', as: 'subcategories' });
  Category.belongsTo(Category, { foreignKey: 'parentId', as: 'parent' });

  // AffiliateLink associations
  AffiliateLink.belongsTo(User, { foreignKey: 'userId' });
  AffiliateLink.belongsTo(Product, { foreignKey: 'productId' });
  AffiliateLink.hasMany(Commission, { foreignKey: 'affiliateLinkId' });

  // Commission associations
  Commission.belongsTo(User, { foreignKey: 'userId' });
  Commission.belongsTo(Product, { foreignKey: 'productId' });
  Commission.belongsTo(AffiliateLink, { foreignKey: 'affiliateLinkId' });
};

// Call setup associations
setupAssociations();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', productRoutes);
app.use('/api', seederRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Affiliate Products API is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    success: false,
    error: 'Something went wrong!'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Test database connection
    await testConnection();
    
    console.log('🔄 Creating tables in correct order...');
    
    // Disable foreign key checks temporarily
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    
    // Sync tables in correct order (parent tables first)
    await Category.sync({ alter: true });
    console.log('✅ Categories table created');
    
    await User.sync({ alter: true });
    console.log('✅ Users table created');
    
    await Product.sync({ alter: true });
    console.log('✅ Products table created');
    
    await AffiliateLink.sync({ alter: true });
    console.log('✅ AffiliateLinks table created');
    
    await Commission.sync({ alter: true });
    console.log('✅ Commissions table created');
    
    // Re-enable foreign key checks
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log('✅ All tables synchronized successfully');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 API URL: http://localhost:${PORT}/api`);
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