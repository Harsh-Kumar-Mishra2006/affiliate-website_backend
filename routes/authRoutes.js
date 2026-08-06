// authRoutes.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const {
  signup,
  login,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyToken,
  getProfile,
  updateProfile,
  logout,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  // Admin affiliate management functions
  addAffiliate,
  getAffiliates,
  getAffiliateProfile,
  getAffiliateStats,
  updateAffiliateStatus,
  resetAffiliatePassword,
  getAllUsersWithDetails,
  getAffiliateDetails,
  getUserDashboardStats,
  bulkUpdateUsers,
  exportUsersData
} = require('../controllers/authController');
const {isAdmin, isAffiliate, isUser} = require('../middlewares/roleCheck');
// ============= PUBLIC ROUTES =============

// Unified signup - Allows anyone to create account with role
router.post('/signup', signup);

// Login
router.post('/login', login);

// Forgot password
router.post('/forgot-password', forgotPassword);

// Reset password
router.post('/reset-password', resetPassword);

// Verify token
router.get('/verify-token', verifyToken);

// ============= PROTECTED ROUTES (All authenticated users) =============

// Get own profile
router.get('/profile', authenticate, getProfile);

// Update own profile
router.put('/profile', authenticate, updateProfile);

// Change password
router.post('/change-password', authenticate, changePassword);

// Logout
router.post('/logout', authenticate, logout);

// ============= ADMIN ONLY ROUTES =============

// Get all users (with role filter)
router.get('/users', authenticate, getAllUsers);

// Get user by ID
router.get('/users/:id', authenticate, getUserById);

// Update user
router.put('/users/:id', authenticate, updateUser);

// Delete user
router.delete('/users/:id', authenticate, deleteUser);

// Get all affiliates
router.get('/affiliates', authenticate, getAffiliates);

// Get affiliate stats
router.get('/affiliate-stats', authenticate, getAffiliateStats);

// Get affiliate profile
router.get('/affiliate-profile', authenticate, getAffiliateProfile);

// Add affiliate (admin only)
router.post('/affiliates', authenticate, addAffiliate);

// Update affiliate status
router.put('/affiliates/:id/status', authenticate, updateAffiliateStatus);

// Reset affiliate password
router.post('/affiliates/:id/reset-password', authenticate, resetAffiliatePassword);


router.get('/admin/users', authenticate, isAdmin, getAllUsersWithDetails);

// ✅ NEW: Get affiliate details with full stats
router.get('/admin/affiliates/:id/details', authenticate, isAdmin, getAffiliateDetails);

// ✅ NEW: Get user dashboard stats
router.get('/admin/dashboard-stats', authenticate, isAdmin, getUserDashboardStats);

// ✅ NEW: Bulk update users
router.post('/admin/users/bulk', authenticate, isAdmin, bulkUpdateUsers);

// ✅ NEW: Export users data
router.get('/admin/users/export', authenticate, isAdmin, exportUsersData);


module.exports = router;