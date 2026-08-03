// models/Purchase.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Purchase = sequelize.define('Purchase', {
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
  affiliateId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  orderId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  productName: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  productPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  // Commission tracking
  commissionAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  commissionRate: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00
  },
  adminCommissionAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  adminCommissionRate: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00
  },
  status: {
    type: DataTypes.ENUM('pending', 'paid', 'completed', 'cancelled'),
    defaultValue: 'pending'
  },
  // Payment screenshot with Cloudinary data
  paymentScreenshot: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null
  },
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'verified', 'rejected'),
    defaultValue: 'pending'
  },
  paymentVerifiedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  paymentVerifiedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  paymentNotes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  buyerName: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  buyerEmail: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  buyerPhone: {
    type: DataTypes.STRING(15),
    allowNull: false
  },
  shippingAddress: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true
});


Purchase.associate = function(models) {
  Purchase.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user'
  });
  
  Purchase.belongsTo(models.User, {
    foreignKey: 'affiliateId',
    as: 'affiliate'
  });
  
  Purchase.belongsTo(models.User, {
    foreignKey: 'paymentVerifiedBy',
    as: 'paymentVerifiedByUser'
  });
  
  Purchase.belongsTo(models.Product, {
    foreignKey: 'productId',
    as: 'product'
  });
  
  Purchase.hasOne(models.Commission, {
    foreignKey: 'purchaseId',
    as: 'commission'
  });
};

module.exports = Purchase;