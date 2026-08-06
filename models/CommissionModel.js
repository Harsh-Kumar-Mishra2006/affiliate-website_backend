// models/CommissionModel.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Commission = sequelize.define('Commission', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  affiliateId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
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
  affiliateCommissionAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  affiliateCommissionRate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  adminCommissionAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  adminCommissionRate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00
  },
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

// ✅ FIXED: Properly define the associate function with 'models' parameter
Commission.associate = function(models) {
  Commission.belongsTo(models.User, {
    foreignKey: 'affiliateId',
    as: 'affiliate'
  });
  
  Commission.belongsTo(models.User, {
    foreignKey: 'adminId',
    as: 'admin'
  });
  
  Commission.belongsTo(models.Product, {
    foreignKey: 'productId',
    as: 'product'
  });
  
  Commission.belongsTo(models.Purchase, {
    foreignKey: 'purchaseId',
    as: 'purchase'
  });
};

module.exports = Commission;