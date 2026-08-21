// migrations/xxxxxxxxxxxxxx-add-affiliate-id-to-products.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if column exists before adding
    const tableInfo = await queryInterface.describeTable('Products');
    if (!tableInfo.affiliateId) {
      await queryInterface.addColumn('Products', 'affiliateId', {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Affiliate ID of the affiliate who added this product'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Products', 'affiliateId');
  }
};