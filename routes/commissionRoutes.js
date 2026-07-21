const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const { isAdmin, isAffiliate } = require('../middleware/roleCheck');
const {
  getAllCommissions,
  updateCommissionStatus,
  getCommissionSummary
} = require('../controllers/commissionController');

// ============= ADMIN ROUTES =============
// Get all commissions
router.get('/admin/commissions', authenticate, isAdmin, getAllCommissions);

// Update commission status
router.put('/admin/commission/:id', authenticate, isAdmin, updateCommissionStatus);

// ============= AFFILIATE ROUTES =============
// Get commission summary
router.get('/affiliate/commission-summary', authenticate, isAffiliate, getCommissionSummary);

module.exports = router;