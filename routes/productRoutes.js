// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const { isAdmin, isAffiliate, isAdminOrAffiliate } = require('../middlewares/roleCheck');
const { upload } = require('../config/cloudinary');

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
  getAdminProducts,
  getAffiliateProducts,
  getAdminProductsWithCommission
} = require('../controllers/productController');

// ============= PUBLIC ROUTES (Anyone can view) =============
router.get('/products', getAllProducts);
router.get('/products/search', searchProducts);
router.get('/products/featured', getFeaturedProducts);
router.get('/products/category/:categorySlug', getProductsByCategory);
router.get('/products/:id', getProductById);

// ============= AUTHENTICATED ROUTES =============

// Affiliate: Get their own products
router.get('/affiliate/products', authenticate, isAffiliate, getAffiliateProducts);

// ============= ADMIN & AFFILIATE ROUTES (Product Management) =============

// Add a product (Admin & Affiliate with image upload)
router.post('/products', 
  authenticate, 
  isAdminOrAffiliate,
  upload.array('images', 10), // Allow up to 10 images
  addProduct
);

// Update a product (Admin & Affiliate with image upload)
router.put('/products/:id', 
  authenticate, 
  isAdminOrAffiliate,
  upload.array('images', 10),
  updateProduct
);

// Delete a product (Admin only)
router.delete('/products/:id', authenticate, isAdmin, deleteProduct);

// ============= ADMIN ONLY ROUTES =============

// Bulk upload products
router.post('/products/bulk', authenticate, isAdmin, bulkUploadProducts);

// Get all products (including inactive) - Admin view
router.get('/admin/products', authenticate, isAdmin, getAdminProducts);

// Get products with commission info
router.get('/admin/products/commission', authenticate, isAdmin, getAdminProductsWithCommission);

// Get product statistics
router.get('/products/stats', authenticate, isAdmin, getProductStats);

// Delete a product (Admin only)
router.delete('/products/:id', authenticate, isAdmin, deleteProduct);

module.exports = router;