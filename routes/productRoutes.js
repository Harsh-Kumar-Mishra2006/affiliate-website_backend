// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const { isAdmin, isAffiliate } = require('../middlewares/roleCheck');
const { uploadProduct } = require('../config/Cloudinary');

const {
  // Admin adds admin's own product
  addAdminProduct,
  // Admin adds affiliate product (suggested by affiliate)
  addAffiliateProduct,
  // Public routes
  getAllProducts,
  getProductById,
  getProductsByCategory,
  searchProducts,
  getFeaturedProducts,
  // Update and Delete
  updateProduct,
  deleteProduct,
  // Affiliate routes
  getAffiliateProducts,
  // Admin routes
  getAdminProducts,
  getAdminProductsWithCommission,
  getProductStats,
  bulkUploadProducts,
  getProductPurchaseHistory
} = require('../controllers/productController');

// ============= PUBLIC ROUTES =============
// Get all products (public)
router.get('/products', getAllProducts);

// Search products
router.get('/products/search', searchProducts);

// Get featured products
router.get('/products/featured', getFeaturedProducts);

// Get products by category
router.get('/products/category/:categorySlug', getProductsByCategory);

// Get product by ID or slug
router.get('/products/:id', getProductById);

// ============= AFFILIATE ROUTES =============
// Affiliate view their own products
router.get(
  '/affiliate/products',
  authenticate,
  isAffiliate,
  getAffiliateProducts
);

// ============= ADMIN ROUTES =============

// ADMIN: Add admin's own product (no affiliate fields)
router.post(
  '/admin/products/add',
  authenticate,
  isAdmin,
  uploadProduct.array('images', 10),
  addAdminProduct
);

// ADMIN: Add affiliate product (suggested by affiliate)
router.post(
  '/admin/products/add-affiliate',
  authenticate,
  isAdmin,
  uploadProduct.array('images', 10),
  addAffiliateProduct
);

// ADMIN: View all products with filters
router.get(
  '/admin/products',
  authenticate,
  isAdmin,
  getAdminProducts
);

// ADMIN: View affiliate products with commission info
router.get(
  '/admin/products/affiliate',
  authenticate,
  isAdmin,
  getAdminProductsWithCommission
);

// ADMIN: Get product statistics
router.get(
  '/admin/products/stats',
  authenticate,
  isAdmin,
  getProductStats
);

// ADMIN: Bulk upload products
router.post(
  '/admin/products/bulk',
  authenticate,
  isAdmin,
  bulkUploadProducts
);

// ADMIN: Get product purchase history
router.get(
  '/admin/products/:id/purchases',
  authenticate,
  isAdmin,
  getProductPurchaseHistory
);

// ============= UPDATE & DELETE (Protected) =============

// Update product (admin can update any, affiliate can update their own)
router.put(
  '/products/:id',
  authenticate,
  uploadProduct.array('images', 10),
  updateProduct
);

// Delete product (admin only)
router.delete(
  '/products/:id',
  authenticate,
  isAdmin,
  deleteProduct
);

module.exports = router;