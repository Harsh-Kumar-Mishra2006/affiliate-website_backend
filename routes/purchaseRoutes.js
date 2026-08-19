// routes/purchaseRoutes.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const { isAdmin, isAffiliate } = require('../middlewares/roleCheck');
const { uploadPayment } = require('../config/Cloudinary');

const {
  initiatePurchase,
  uploadPaymentScreenshot,
  getMyPurchases,
  getPurchaseDetails,
  getAllPurchases,
  verifyPayment,
  getPurchaseById,
  getMyCommissions
} = require('../controllers/purchaseController');

// ============= USER ROUTES =============
// Initiate purchase
router.post('/purchase/initiate', authenticate, initiatePurchase);

// Upload payment screenshot (using Cloudinary)
router.post('/purchase/upload-payment', authenticate, uploadPayment.single('screenshot'), uploadPaymentScreenshot);

// Get my purchases
router.get('/purchase/my-purchases', authenticate, getMyPurchases);

// Get purchase details
router.get('/purchase/:orderId', authenticate, getPurchaseDetails);

// ============= AFFILIATE ROUTES =============
// Get my commissions
router.get('/affiliate/commissions', authenticate, isAffiliate, getMyCommissions);

// ============= ADMIN ROUTES =============
// Get all purchases with filters
router.get('/admin/purchases', authenticate, isAdmin, getAllPurchases);

// Get purchase by ID
router.get('/admin/purchase/:id', authenticate, isAdmin, getPurchaseById);

// Verify payment
router.put('/admin/purchase/:orderId/verify', authenticate, isAdmin, verifyPayment);

// routes/productRoutes.js

// ============= ADMIN ROUTES =============

// ADMIN: Create master product (draft, not public)
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

// ============= AFFILIATE ROUTES =============

// AFFILIATE: Get available master products to choose from
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
module.exports = router;