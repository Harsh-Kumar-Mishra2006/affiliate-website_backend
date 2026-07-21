const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Category = sequelize.define('Category', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
    // ✅ REMOVE: unique: true - this is causing the error
  },
  slug: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true  // ✅ Keep unique on slug only
  },
  description: {
    type: DataTypes.TEXT
  },
  image: {
    type: DataTypes.STRING(255)
  },
  parentId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'categories',
      key: 'id'
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  timestamps: true
});

module.exports = Category;