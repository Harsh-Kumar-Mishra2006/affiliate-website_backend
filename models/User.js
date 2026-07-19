const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: { msg: 'Name is required' }
    }
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: { msg: 'Invalid email format' }
    }
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  phone: {
    type: DataTypes.STRING(15),
    allowNull: false
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  tempPassword: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  role: {
    type: DataTypes.ENUM('admin', 'affiliate', 'user'),
    allowNull: false,
    defaultValue: 'user'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isEmailApproved: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastLogin: {
    type: DataTypes.DATE
  },
  loginCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  resetPasswordToken: {
    type: DataTypes.STRING(255)
  },
  resetPasswordExpires: {
    type: DataTypes.DATE
  },
  addedBy: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  needsPasswordChange: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // Affiliate specific fields
  affiliateId: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: true
  },
  commissionRate: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 10.00
  },
  totalEarnings: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  availableBalance: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  paymentMethod: {
    type: DataTypes.ENUM('bank', 'paypal', 'upi'),
    allowNull: true
  },
  paymentDetails: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    }
  }
});

// Instance methods
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

User.prototype.generateAuthToken = function() {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { 
      userId: this.id, 
      email: this.email,
      role: this.role,
      username: this.username,
      name: this.name
    },
    process.env.JWT_SECRET || 'Harsh2006@',
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Static method to generate random password
User.generateRandomPassword = function() {
  const length = 10;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

// Generate unique affiliate ID
User.generateAffiliateId = function(name) {
  const prefix = 'AFF';
  const random = Math.floor(10000 + Math.random() * 90000);
  const namePart = name.substring(0, 3).toUpperCase();
  return `${prefix}${namePart}${random}`;
};

// Add this association
User.hasMany(Product, { 
  foreignKey: 'addedBy',
  as: 'addedProducts'
});

module.exports = User;