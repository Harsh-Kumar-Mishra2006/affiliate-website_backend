// models/Product.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  slug: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  shortDescription: {
    type: DataTypes.STRING(500)
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  // ✅ NEW: Service ID field - manually added by user
  serviceId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Manual service ID entered by user for identification'
  },
  images: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  mainImage: {
    type: DataTypes.STRING(255)
  },
  categoryId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'categories',
      key: 'id'
    }
  },
  brand: {
    type: DataTypes.STRING(100)
  },
  sku: {
    type: DataTypes.STRING(100),
    unique: true
  },
  company: {  
    type: DataTypes.STRING(100),
    allowNull: false
  },
  stock: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0
  },
  reviews: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  affiliateUrl: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  affiliateId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Affiliate ID of the affiliate who added this product'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isFeatured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  tags: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  specifications: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  metaTitle: {
    type: DataTypes.STRING(255)
  },
  metaDescription: {
    type: DataTypes.TEXT
  },
  addedBy: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  addedByRole: {
    type: DataTypes.ENUM('admin', 'affiliate'),
    allowNull: true
  },
  isMaster: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'True for master products (admin created, not public)'
  },
  status: {
    type: DataTypes.ENUM('draft', 'pending', 'active', 'inactive'),
    defaultValue: 'draft',
    comment: 'draft: admin created, pending: affiliate selected, active: live product'
  },
  commissionRate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    validate: {
      min: 10,
      max: 25
    }
  },
  affiliateEmail: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  purchaseCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  totalRevenue: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  totalCommissionEarned: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  adminCommissionShare: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  }
}, {
  timestamps: true
});

// ✅ Define associations
Product.associate = function(models) {
  Product.belongsTo(models.Category, {
    foreignKey: 'categoryId',
    as: 'category'
  });
  
  Product.belongsTo(models.User, {
    foreignKey: 'addedBy',
    as: 'addedByUser'
  });
  
  Product.hasMany(models.Purchase, {
    foreignKey: 'productId',
    as: 'purchases'
  });
  
  Product.hasMany(models.Commission, {
    foreignKey: 'productId',
    as: 'commissions'
  });
};

module.exports = Product;