// routes/commissionRoutes.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const { isAdmin, isAffiliate } = require('../middlewares/roleCheck');

// ✅ Fix: Change getCommissionSummary to getAffiliateCommissionSummary
const {
  getAllCommissions,
  updateCommissionStatus,
  getAffiliateCommissionSummary,  
  getAdminCommissionSummary,
  getCommissionStatistics,
  exportCommissionReport
} = require('../controllers/commissionController');

// ============= ADMIN ROUTES =============
// Get all commissions with filters
router.get('/admin/commissions', authenticate, isAdmin, getAllCommissions);

// Update commission status
router.put('/admin/commission/:id', authenticate, isAdmin, updateCommissionStatus);

// Get admin commission summary with analytics
router.get('/admin/commission-summary', authenticate, isAdmin, getAdminCommissionSummary);

// Get commission statistics for charts
router.get('/admin/commission-stats', authenticate, isAdmin, getCommissionStatistics);

// Export commission report
router.get('/admin/commission-export', authenticate, isAdmin, exportCommissionReport);

// ============= AFFILIATE ROUTES =============
// ✅ Fix: Use getAffiliateCommissionSummary
router.get('/affiliate/commission-summary', authenticate, isAffiliate, getAffiliateCommissionSummary);

module.exports = router;