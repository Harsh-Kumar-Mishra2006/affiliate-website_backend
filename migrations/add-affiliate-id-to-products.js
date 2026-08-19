// migrations/xxxx-add-affiliate-id-to-products.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Products', 'affiliateId', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'Affiliate ID of the affiliate who added this product'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Products', 'affiliateId');
  }
};