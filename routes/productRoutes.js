// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const { isAdmin, isAffiliate, isUser } = require('../middlewares/roleCheck');
const { upload } = require('../config/Cloudinary');

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
// Note: isAffiliate already allows 'affiliate' and 'admin' roles
router.post('/products', 
  authenticate, 
  isAffiliate, // This allows both admin and affiliate
  upload.array('images', 10), // Allow up to 10 images
  addProduct
);

// Update a product (Admin & Affiliate with image upload)
router.put('/products/:id', 
  authenticate, 
  isAffiliate, // Allows both admin and affiliate
  upload.array('images', 10),
  updateProduct
);

// ============= ADMIN ONLY ROUTES =============

// Bulk upload products (Admin only)
router.post('/products/bulk', authenticate, isAdmin, bulkUploadProducts);

// Get all products (including inactive) - Admin view
router.get('/admin/products', authenticate, isAdmin, getAdminProducts);

// Get products with commission info (Admin only)
router.get('/admin/products/commission', authenticate, isAdmin, getAdminProductsWithCommission);

// Get product statistics (Admin only)
router.get('/products/stats', authenticate, isAdmin, getProductStats);

// Delete a product (Admin only)
router.delete('/products/:id', authenticate, isAdmin, deleteProduct);

module.exports = router;