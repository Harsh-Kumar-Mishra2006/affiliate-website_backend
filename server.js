require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sequelize, testConnection } = require('./config/db');

// Import models
const User = require('./models/User');
const Product = require('./models/Product');
const Category = require('./models/Category');
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

// Set up model associations
User.hasMany(AffiliateLink, { foreignKey: 'userId' });
User.hasMany(Commission, { foreignKey: 'userId' });
User.hasMany(Product, { foreignKey: 'addedBy' });

Product.belongsTo(Category, { foreignKey: 'categoryId' });
Product.hasMany(AffiliateLink, { foreignKey: 'productId' });

AffiliateLink.belongsTo(User, { foreignKey: 'userId' });
AffiliateLink.belongsTo(Product, { foreignKey: 'productId' });
AffiliateLink.hasMany(Commission, { foreignKey: 'affiliateLinkId' });

Commission.belongsTo(User, { foreignKey: 'userId' });
Commission.belongsTo(Product, { foreignKey: 'productId' });
Commission.belongsTo(AffiliateLink, { foreignKey: 'affiliateLinkId' });

Category.hasMany(Category, { foreignKey: 'parentId', as: 'subcategories' });
Category.belongsTo(Category, { foreignKey: 'parentId', as: 'parent' });

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
    
    // Sync database (alter: true for development, false for production)
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    console.log('Database synchronized successfully');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 API URL: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
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