// models/CommissionModel.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Commission = sequelize.define('Commission', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // Affiliate who earned commission
  affiliateId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // Admin who owns the product
  adminId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products',
      key: 'id'
    }
  },
  purchaseId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'purchases',
      key: 'id'
    }
  },
  orderId: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  // Affiliate commission details
  affiliateCommissionAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  affiliateCommissionRate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false
  },
  // Admin commission details
  adminCommissionAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  adminCommissionRate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false
  },
  // Original purchase details
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'paid', 'rejected'),
    defaultValue: 'pending'
  },
  paymentDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true,
  tableName: 'commissions'
});

module.exports = Commission;