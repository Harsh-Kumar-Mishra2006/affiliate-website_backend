// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const { isAdmin, isAffiliate } = require('../middlewares/roleCheck');
// ✅ Fix: Import uploadProduct instead of upload
const { uploadProduct } = require('../config/cloudinary');

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

// ============= PUBLIC ROUTES =============
router.get('/products', getAllProducts);
router.get('/products/search', searchProducts);
router.get('/products/featured', getFeaturedProducts);
router.get('/products/category/:categorySlug', getProductsByCategory);
router.get('/products/:id', getProductById);

// ============= AUTHENTICATED ROUTES =============
router.get('/affiliate/products', authenticate, isAffiliate, getAffiliateProducts);

// ============= ADMIN & AFFILIATE ROUTES =============
// ✅ Fix: Use uploadProduct instead of upload
router.post('/products', 
  authenticate, 
  isAffiliate,
  uploadProduct.array('images', 10),
  addProduct
);

// ✅ Fix: Use uploadProduct instead of upload
router.put('/products/:id', 
  authenticate, 
  isAffiliate,
  uploadProduct.array('images', 10),
  updateProduct
);

// ============= ADMIN ONLY ROUTES =============
router.post('/products/bulk', authenticate, isAdmin, bulkUploadProducts);
router.get('/admin/products', authenticate, isAdmin, getAdminProducts);
router.get('/admin/products/commission', authenticate, isAdmin, getAdminProductsWithCommission);
router.get('/products/stats', authenticate, isAdmin, getProductStats);
router.delete('/products/:id', authenticate, isAdmin, deleteProduct);

module.exports = router;