const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const { isAdmin } = require('../middlewares/roleCheck');
const seedProducts = require('../seeders/productSeeder');
const { sequelize } = require('../config/db');

// Seed products (Admin only - for testing)
router.post('/seed/products', authenticate, isAdmin, async (req, res) => {
  try {
    // Check if products already exist
    const Product = require('../models/Product');
    const existingCount = await Product.count();
    
    // Optional: Delete existing products
    const { force } = req.query;
    if (force === 'true') {
      await Product.destroy({ where: {}, truncate: true });
      await sequelize.query('ALTER TABLE products AUTO_INCREMENT = 1');
      console.log('🗑️ Existing products deleted');
    }
    
    const products = await seedProducts();
    
    res.status(201).json({
      success: true,
      data: {
        count: products.length,
        products: products.slice(0, 5) // Return first 5 as sample
      },
      message: `${products.length} products seeded successfully!`
    });
  } catch (error) {
    console.error('Seeding API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to seed products: ' + error.message
    });
  }
});

// Get seed status
router.get('/seed/status', authenticate, isAdmin, async (req, res) => {
  try {
    const Product = require('../models/Product');
    const Category = require('../models/Category');
    
    const productCount = await Product.count();
    const categoryCount = await Category.count();
    
    res.json({
      success: true,
      data: {
        productCount,
        categoryCount,
        hasData: productCount > 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get seed status'
    });
  }
});

module.exports = router;