const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const { isAdmin, isAffiliate } = require('../middleware/roleCheck');
const {
  addProduct,
  getAllProducts,
  getProductById,
  getProductsByAffiliate,
  updateProduct,
  deleteProduct,
  getProductsByCategory,
  searchProducts,
  getFeaturedProducts,
  getProductStats,
  bulkUploadProducts
} = require('../controllers/productController');

// ============= PUBLIC ROUTES =============
// Get all products (with filters)
router.get('/products', getAllProducts);

// Search products
router.get('/products/search', searchProducts);

// Get featured products
router.get('/products/featured', getFeaturedProducts);

// Get products by category
router.get('/products/category/:categorySlug', getProductsByCategory);

// Get single product by ID or slug
router.get('/products/:id', getProductById);

// ============= AUTHENTICATED ROUTES =============
// Add product (Affiliate/Admin only)
router.post('/products', authenticate, isAffiliate, addProduct);

// Bulk upload products (Affiliate/Admin only)
router.post('/products/bulk', authenticate, isAffiliate, bulkUploadProducts);

// Get products by affiliate
router.get('/affiliate/products', authenticate, isAffiliate, getProductsByAffiliate);
router.get('/affiliate/products/:id', authenticate, isAffiliate, getProductsByAffiliate);

// Get product statistics
router.get('/products/stats', authenticate, isAffiliate, getProductStats);

// Update product (Affiliate can update own, Admin can update any)
router.put('/products/:id', authenticate, updateProduct);

// Delete product (Affiliate can delete own, Admin can delete any)
router.delete('/products/:id', authenticate, deleteProduct);

module.exports = router;