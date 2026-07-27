// In middleware/auth.js

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'Harsh2006@';

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      console.log('❌ No Authorization header provided');
      return res.status(401).json({
        success: false,
        error: 'Authentication required - No token provided'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      console.log('❌ No token found in Authorization header');
      return res.status(401).json({
        success: false,
        error: 'Authentication required - Invalid token format'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      console.log('❌ JWT Verification failed:', jwtError.message);
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    const user = await User.findByPk(decoded.userId, {
      attributes: { 
        exclude: ['password', 'resetPasswordToken', 'resetPasswordExpires', 'tempPassword'] 
      }
    });

    if (!user) {
      console.log(`❌ User not found for ID: ${decoded.userId}`);
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.isActive) {
      console.log(`❌ User ${user.email} is deactivated`);
      return res.status(403).json({
        success: false,
        error: 'Account is deactivated'
      });
    }

    console.log(`✅ User authenticated: ${user.email} (${user.role})`);
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

module.exports = authenticate;