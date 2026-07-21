const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const { isAdmin, isAffiliate } = require('../middlewares/roleCheck');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/payments/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'payment-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});

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

// Upload payment screenshot
router.post('/purchase/upload-payment', authenticate, upload.single('screenshot'), uploadPaymentScreenshot);

// Get my purchases
router.get('/purchase/my-purchases', authenticate, getMyPurchases);

// Get purchase details
router.get('/purchase/:orderId', authenticate, getPurchaseDetails);

// ============= AFFILIATE ROUTES =============
// Get my commissions
router.get('/affiliate/commissions', authenticate, isAffiliate, getMyCommissions);

// ============= ADMIN ROUTES =============
// Get all purchases
router.get('/admin/purchases', authenticate, isAdmin, getAllPurchases);

// Get purchase by ID
router.get('/admin/purchase/:id', authenticate, isAdmin, getPurchaseById);

// Verify payment
router.put('/admin/purchase/:orderId/verify', authenticate, isAdmin, verifyPayment);

module.exports = router;