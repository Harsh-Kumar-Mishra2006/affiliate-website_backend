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
  discountedPrice: {
    type: DataTypes.DECIMAL(10, 2)
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
    type: DataTypes.STRING(500)
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
  }
}, {
  timestamps: true
});

module.exports = Product;