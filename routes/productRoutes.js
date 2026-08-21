// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const { isAdmin, isAffiliate } = require('../middlewares/roleCheck');
const { uploadProduct } = require('../config/Cloudinary');

const {
  createMasterProduct,
  getMasterProducts,
  affiliateAddProduct,
  getAvailableMasterProducts,
  getAllProducts,
  getProductById,
  getProductsByCategory,
  searchProducts,
  getFeaturedProducts,
  updateProduct,
  deleteProduct,
  getAffiliateProducts,
  getAdminProducts,
  getAdminProductsWithCommission,
  getProductStats,
  bulkUploadProducts,
  getProductPurchaseHistory
} = require('../controllers/productController');

// ============================================
// AFFILIATE ROUTES (Must come BEFORE /products/:id)
// ============================================

// AFFILIATE: Get available master products
router.get(
  '/affiliate/products/available',
  authenticate,
  isAffiliate,
  getAvailableMasterProducts
);

// AFFILIATE: Select master product and add to store
router.post(
  '/affiliate/products/add',
  authenticate,
  isAffiliate,
  affiliateAddProduct
);

// AFFILIATE: View their own products
router.get(
  '/affiliate/products',
  authenticate,
  isAffiliate,
  getAffiliateProducts
);

// ============================================
// ADMIN ROUTES
// ============================================

// ADMIN: Create master product
router.post(
  '/admin/products/master',
  authenticate,
  isAdmin,
  uploadProduct.array('images', 10),
  createMasterProduct
);

// ADMIN: Get all master products
router.get(
  '/admin/products/master',
  authenticate,
  isAdmin,
  getMasterProducts
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

// ============================================
// PUBLIC ROUTES
// ============================================

router.get('/products', getAllProducts);
router.get('/products/search', searchProducts);
router.get('/products/featured', getFeaturedProducts);
router.get('/products/category/:categorySlug', getProductsByCategory);

// ⚠️ This must be LAST - it catches /:id
router.get('/products/:id', getProductById);

// ============================================
// UPDATE & DELETE (Protected)
// ============================================

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