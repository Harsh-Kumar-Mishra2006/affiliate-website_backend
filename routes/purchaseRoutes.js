// routes/purchaseRoutes.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const { isAdmin, isAffiliate } = require('../middlewares/roleCheck');
const { uploadPayment } = require('../config/cloudinary');

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

module.exports = router;