const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const AffiliateLink = sequelize.define('AffiliateLink', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
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
  affiliateCode: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  clicks: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  uniqueClicks: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  conversions: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  totalCommission: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  expiresAt: {
    type: DataTypes.DATE
  }
}, {
  timestamps: true
});

module.exports = AffiliateLink;