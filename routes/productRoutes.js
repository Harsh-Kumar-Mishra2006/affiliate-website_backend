const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { isAdmin } = require('../middlewares/roleCheck');  // ✅ Only isAdmin now
const {
  addProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getProductsByCategory,
  searchProducts,
  getFeaturedProducts,
  getProductStats,
  bulkUploadProducts,
  getAdminProducts
} = require('../controllers/productController');

// ============= PUBLIC ROUTES (Anyone can view) =============
router.get('/products', getAllProducts);
router.get('/products/search', searchProducts);
router.get('/products/featured', getFeaturedProducts);
router.get('/products/category/:categorySlug', getProductsByCategory);
router.get('/products/:id', getProductById);

// ============= ADMIN ONLY ROUTES (Product Management) =============
// ✅ All these routes require: Authentication + Admin role

// Add a single product
router.post('/products', authenticate, isAdmin, addProduct);

// Bulk upload multiple products
router.post('/products/bulk', authenticate, isAdmin, bulkUploadProducts);

// Get all products (including inactive ones) - Admin view
router.get('/admin/products', authenticate, isAdmin, getAdminProducts);

// Get product statistics
router.get('/products/stats', authenticate, isAdmin, getProductStats);

// Update a product
router.put('/products/:id', authenticate, isAdmin, updateProduct);

// Delete a product
router.delete('/products/:id', authenticate, isAdmin, deleteProduct);

module.exports = router;