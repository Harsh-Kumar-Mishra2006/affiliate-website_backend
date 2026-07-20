const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const { isAdmin, isAffiliate } = require('../middlewares/roleCheck');
const {
  adminSignup,
  userSignup,
  addAffiliate,
  getAffiliates,
  getAffiliateProfile,
  login,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyToken,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getProfile,
  updateProfile,
  logout,
  updateAffiliateStatus,
  resetAffiliatePassword
} = require('../controllers/authController');

// ============= PUBLIC ROUTES =============
// Admin Signup (Direct)
router.post('/admin/signup', adminSignup);

// User Signup (Self-registration)
router.post('/user/signup', userSignup);

// Login
router.post('/login', login);

// Forgot Password
router.post('/forgot-password', forgotPassword);

// Reset Password
router.post('/reset-password', resetPassword);

// Verify Token
router.get('/verify-token', verifyToken);

// ============= AUTHENTICATED ROUTES =============
// Logout
router.post('/logout', authenticate, logout);

// Get Profile
router.get('/profile', authenticate, getProfile);

// Update Profile
router.put('/profile', authenticate, updateProfile);

// Change Password
router.post('/change-password', authenticate, changePassword);

// ============= ADMIN ONLY ROUTES =============
// Add Affiliate
router.post('/admin/affiliates', authenticate, isAdmin, addAffiliate);

// Get All Affiliates
router.get('/admin/affiliates', authenticate, isAdmin, getAffiliates);

// Update Affiliate Status
router.put('/admin/affiliates/:id', authenticate, isAdmin, updateAffiliateStatus);

// Reset Affiliate Password
router.post('/admin/affiliates/:id/reset-password', authenticate, isAdmin, resetAffiliatePassword);

// Get All Users
router.get('/admin/users', authenticate, isAdmin, getAllUsers);

// Get User by ID
router.get('/admin/users/:id', authenticate, isAdmin, getUserById);

// Update User
router.put('/admin/users/:id', authenticate, isAdmin, updateUser);

// Delete User
router.delete('/admin/users/:id', authenticate, isAdmin, deleteUser);

// ============= AFFILIATE ROUTES =============
// Get Affiliate Profile with Stats
router.get('/affiliate/profile', authenticate, isAffiliate, getAffiliateProfile);

module.exports = router;