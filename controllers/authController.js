const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'Harsh2006@';

// ============= ADMIN SIGNUP (Direct, No Approval) =============
const adminSignup = async (req, res) => {
  try {
    const { name, email, username, phone, password } = req.body;

    // Validation
    if (!name || !email || !password || !username || !phone) {
      return res.status(400).json({ 
        success: false,
        error: 'All fields are required' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ email }, { username }]
      }
    });

    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: 'Email or username already registered' 
      });
    }

    const adminUser = await User.create({
      name,
      email,
      username,
      phone,
      password,
      role: 'admin',
      isEmailApproved: true,
      isActive: true,
      needsPasswordChange: false
    });

    const token = adminUser.generateAuthToken();

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: adminUser.id,
          name: adminUser.name,
          email: adminUser.email,
          username: adminUser.username,
          phone: adminUser.phone,
          role: adminUser.role
        }
      },
      message: 'Admin account created successfully!'
    });

  } catch (err) {
    console.error("Admin Signup Error:", err);
    res.status(400).json({
      success: false,
      error: "Failed to create admin account: " + err.message
    });
  }
};

// ============= USER SIGNUP (Self-registration) =============
const userSignup = async (req, res) => {
  try {
    const { name, email, username, phone, password } = req.body;

    // Validation
    if (!name || !email || !password || !username || !phone) {
      return res.status(400).json({ 
        success: false,
        error: 'All fields are required' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ email }, { username }]
      }
    });

    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: 'Email or username already registered' 
      });
    }

    const user = await User.create({
      name,
      email,
      username,
      phone,
      password,
      role: 'user',
      isEmailApproved: true,
      isActive: true,
      needsPasswordChange: false
    });

    const token = user.generateAuthToken();

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          phone: user.phone,
          role: user.role
        }
      },
      message: 'User account created successfully!'
    });

  } catch (err) {
    console.error("User Signup Error:", err);
    res.status(400).json({
      success: false,
      error: "Failed to create user account: " + err.message
    });
  }
};

// ============= ADMIN: ADD AFFILIATE =============
const addAffiliate = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admin can add affiliates'
      });
    }

    const {
      name, email, username, phone,
      commissionRate, paymentMethod, paymentDetails
    } = req.body;

    if (!name || !email || !username || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, username, and phone are required'
      });
    }

    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ email }, { username }]
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email or username already exists'
      });
    }

    const generatedPassword = User.generateRandomPassword();
    const affiliateId = User.generateAffiliateId(name);

    const affiliateUser = await User.create({
      name,
      email,
      username,
      phone,
      password: generatedPassword,
      tempPassword: generatedPassword,
      role: 'affiliate',
      isEmailApproved: true,
      isActive: true,
      addedBy: req.user.id,
      needsPasswordChange: true,
      affiliateId,
      commissionRate: commissionRate || 10.00,
      paymentMethod: paymentMethod || null,
      paymentDetails: paymentDetails || null
    }, { transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: affiliateUser.id,
          name: affiliateUser.name,
          email: affiliateUser.email,
          username: affiliateUser.username,
          phone: affiliateUser.phone,
          role: affiliateUser.role,
          affiliateId: affiliateUser.affiliateId,
          commissionRate: affiliateUser.commissionRate
        },
        temporaryPassword: generatedPassword
      },
      message: `Affiliate ${name} added successfully! Temporary password: ${generatedPassword}`
    });

  } catch (err) {
    await transaction.rollback();
    console.error("Add Affiliate Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to add affiliate: " + err.message
    });
  }
};

// ============= ADMIN: GET ALL AFFILIATES =============
const getAffiliates = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admin can view affiliates'
      });
    }

    const affiliates = await User.findAll({
      where: { role: 'affiliate' },
      attributes: { exclude: ['password', 'resetPasswordToken', 'resetPasswordExpires', 'tempPassword'] },
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: affiliates
    });

  } catch (err) {
    console.error("Get Affiliates Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch affiliates"
    });
  }
};

// ============= AFFILIATE: GET OWN PROFILE =============
const getAffiliateProfile = async (req, res) => {
  try {
    if (req.user.role !== 'affiliate' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'resetPasswordToken', 'resetPasswordExpires', 'tempPassword'] }
    });

    // Get affiliate statistics
    const AffiliateLink = require('../models/AffiliateLink');
    const Commission = require('../models/Commission');

    const links = await AffiliateLink.findAll({
      where: { userId: req.user.id }
    });

    const commissions = await Commission.findAll({
      where: { userId: req.user.id }
    });

    const stats = {
      totalLinks: links.length,
      totalClicks: links.reduce((sum, link) => sum + link.clicks, 0),
      totalConversions: links.reduce((sum, link) => sum + link.conversions, 0),
      totalCommission: commissions.reduce((sum, comm) => sum + parseFloat(comm.amount), 0),
      pendingCommission: commissions
        .filter(c => c.status === 'pending')
        .reduce((sum, comm) => sum + parseFloat(comm.amount), 0),
      approvedCommission: commissions
        .filter(c => c.status === 'approved')
        .reduce((sum, comm) => sum + parseFloat(comm.amount), 0)
    };

    res.json({
      success: true,
      data: { user, stats }
    });

  } catch (err) {
    console.error("Get Affiliate Profile Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch affiliate profile"
    });
  }
};

// ============= LOGIN (For all users) =============
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { email: email.toLowerCase() },
          { username: email.toLowerCase() }
        ]
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Account is deactivated. Please contact administrator.'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Update last login
    await user.update({
      lastLogin: new Date(),
      loginCount: user.loginCount + 1
    });

    const token = user.generateAuthToken();

    // Prepare response based on role
    const responseData = {
      token,
      needsPasswordChange: user.needsPasswordChange,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        phone: user.phone
      }
    };

    // Add affiliate specific data if user is affiliate
    if (user.role === 'affiliate') {
      responseData.user.affiliateId = user.affiliateId;
      responseData.user.commissionRate = user.commissionRate;
      responseData.user.totalEarnings = user.totalEarnings;
      responseData.user.availableBalance = user.availableBalance;
    }

    res.json({
      success: true,
      data: responseData,
      message: `Welcome back, ${user.name}!`,
    });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({
      success: false,
      error: "Server error during login"
    });
  }
};

// ============= CHANGE PASSWORD (First login or voluntarily) =============
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters'
      });
    }

    const user = await User.findByPk(userId);
    
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Update password and clear temp password
    user.password = newPassword;
    user.tempPassword = null;
    user.needsPasswordChange = false;
    await user.save();

    const token = user.generateAuthToken();

    res.json({
      success: true,
      data: { token },
      message: 'Password changed successfully'
    });

  } catch (err) {
    console.error("Change Password Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to change password"
    });
  }
};

// ============= FORGOT PASSWORD =============
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const user = await User.findOne({ where: { email: email.toLowerCase() } });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Email not found'
      });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user.id, type: 'password_reset' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Save reset token
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    // TODO: Send email with reset link
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    res.json({
      success: true,
      message: 'Password reset instructions sent to your email',
      data: process.env.NODE_ENV === 'development' ? { resetLink, resetToken } : {}
    });

  } catch (err) {
    console.error("Forgot Password Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to process request"
    });
  }
};

// ============= RESET PASSWORD =============
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Token and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.type !== 'password_reset') {
      return res.status(400).json({
        success: false,
        error: 'Invalid reset token'
      });
    }

    const user = await User.findOne({
      where: {
        id: decoded.userId,
        resetPasswordToken: token,
        resetPasswordExpires: { [Op.gt]: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }

    // Update password
    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.needsPasswordChange = false;
    user.tempPassword = null;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.'
    });

  } catch (err) {
    console.error("Reset Password Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to reset password"
    });
  }
};

// ============= VERIFY TOKEN =============
const verifyToken = async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ['password', 'resetPasswordToken', 'resetPasswordExpires', 'tempPassword'] }
    });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        valid: true,
        needsPasswordChange: user.needsPasswordChange,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          role: user.role,
          phone: user.phone
        }
      }
    });

  } catch (err) {
    console.error("Verify Token Error:", err);
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
};

// ============= GET ALL USERS (Admin only) =============
const getAllUsers = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin only.'
      });
    }

    const { role } = req.query;
    const whereClause = {};
    
    if (role && role !== 'all') {
      whereClause.role = role;
    }

    const users = await User.findAll({
      where: whereClause,
      attributes: { exclude: ['password', 'resetPasswordToken', 'resetPasswordExpires'] },
      order: [['createdAt', 'DESC']]
    });

    // Add temporary password for users who need password change
    const usersWithTempPass = users.map(user => {
      const userObj = user.toJSON();
      if (user.needsPasswordChange && user.tempPassword) {
        userObj.temporaryPassword = user.tempPassword;
      }
      return userObj;
    });

    res.json({
      success: true,
      data: usersWithTempPass
    });

  } catch (err) {
    console.error("Get All Users Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch users"
    });
  }
};

// ============= GET USER BY ID =============
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Users can only view their own profile unless they're admin
    if (req.user.role !== 'admin' && req.user.id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const user = await User.findByPk(id, {
      attributes: { exclude: ['password', 'resetPasswordToken', 'resetPasswordExpires', 'tempPassword'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (err) {
    console.error("Get User Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user"
    });
  }
};

// ============= UPDATE USER (Admin only) =============
const updateUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admin can update users'
      });
    }

    const { id } = req.params;
    const { name, email, username, phone, isActive, role, commissionRate } = req.body;

    const user = await User.findByPk(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const updateData = {
      name: name || user.name,
      email: email || user.email,
      username: username || user.username,
      phone: phone || user.phone,
      isActive: isActive !== undefined ? isActive : user.isActive
    };

    // Only admin can change role
    if (role && req.user.role === 'admin') {
      updateData.role = role;
    }

    // Only update affiliate fields if user is affiliate
    if (user.role === 'affiliate' && commissionRate !== undefined) {
      updateData.commissionRate = commissionRate;
    }

    await user.update(updateData);

    res.json({
      success: true,
      data: user,
      message: 'User updated successfully'
    });

  } catch (err) {
    console.error("Update User Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update user"
    });
  }
};

// ============= DELETE USER (Admin only) =============
const deleteUser = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admin can delete users'
      });
    }

    const { id } = req.params;

    // Don't allow admin to delete themselves
    if (req.user.id === parseInt(id)) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }

    const user = await User.findByPk(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Delete associated data based on role
    if (user.role === 'affiliate') {
      const AffiliateLink = require('../models/AffiliateLink');
      const Commission = require('../models/Commission');
      
      await AffiliateLink.destroy({ where: { userId: id }, transaction });
      await Commission.destroy({ where: { userId: id }, transaction });
    }

    // Delete user
    await user.destroy({ transaction });

    await transaction.commit();

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (err) {
    await transaction.rollback();
    console.error("Delete User Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to delete user"
    });
  }
};

// ============= GET PROFILE (Authenticated user) =============
const getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'resetPasswordToken', 'resetPasswordExpires', 'tempPassword'] }
    });

    let extraData = {};
    
    if (user.role === 'affiliate') {
      const AffiliateLink = require('../models/AffiliateLink');
      const Commission = require('../models/Commission');

      const links = await AffiliateLink.findAll({
        where: { userId: user.id }
      });

      const commissions = await Commission.findAll({
        where: { userId: user.id }
      });

      extraData = {
        affiliateId: user.affiliateId,
        commissionRate: user.commissionRate,
        totalEarnings: user.totalEarnings,
        availableBalance: user.availableBalance,
        stats: {
          totalLinks: links.length,
          totalClicks: links.reduce((sum, link) => sum + link.clicks, 0),
          totalConversions: links.reduce((sum, link) => sum + link.conversions, 0),
          totalCommission: commissions.reduce((sum, comm) => sum + parseFloat(comm.amount), 0)
        }
      };
    }

    res.json({
      success: true,
      data: {
        ...user.toJSON(),
        ...extraData
      }
    });

  } catch (err) {
    console.error("Get Profile Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch profile"
    });
  }
};

// ============= UPDATE PROFILE =============
const updateProfile = async (req, res) => {
  try {
    const { name, phone, paymentMethod, paymentDetails } = req.body;
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const updateData = {
      name: name || user.name,
      phone: phone || user.phone
    };

    // Affiliate specific updates
    if (user.role === 'affiliate') {
      if (paymentMethod) updateData.paymentMethod = paymentMethod;
      if (paymentDetails) updateData.paymentDetails = paymentDetails;
    }

    await user.update(updateData);

    res.json({
      success: true,
      data: user,
      message: 'Profile updated successfully'
    });

  } catch (err) {
    console.error("Update Profile Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update profile"
    });
  }
};

// ============= LOGOUT =============
const logout = async (req, res) => {
  res.json({
    success: true,
    message: "Logged out successfully"
  });
};

// ============= ADMIN: UPDATE AFFILIATE STATUS =============
const updateAffiliateStatus = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admin can update affiliate status'
      });
    }

    const { id } = req.params;
    const { isActive, commissionRate } = req.body;

    const user = await User.findByPk(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.role !== 'affiliate') {
      return res.status(400).json({
        success: false,
        error: 'User is not an affiliate'
      });
    }

    const updateData = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (commissionRate !== undefined) updateData.commissionRate = commissionRate;

    await user.update(updateData);

    res.json({
      success: true,
      data: user,
      message: 'Affiliate status updated successfully'
    });

  } catch (err) {
    console.error("Update Affiliate Status Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update affiliate status"
    });
  }
};

// ============= ADMIN: RESET AFFILIATE PASSWORD =============
const resetAffiliatePassword = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admin can reset affiliate passwords'
      });
    }

    const { id } = req.params;
    const user = await User.findByPk(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.role !== 'affiliate') {
      return res.status(400).json({
        success: false,
        error: 'User is not an affiliate'
      });
    }

    const generatedPassword = User.generateRandomPassword();
    
    user.password = generatedPassword;
    user.tempPassword = generatedPassword;
    user.needsPasswordChange = true;
    await user.save();

    res.json({
      success: true,
      data: {
        temporaryPassword: generatedPassword
      },
      message: `Password reset successfully. Temporary password: ${generatedPassword}`
    });

  } catch (err) {
    console.error("Reset Affiliate Password Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to reset affiliate password"
    });
  }
};

module.exports = {
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
};