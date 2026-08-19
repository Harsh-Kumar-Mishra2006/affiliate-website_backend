// migrations/add-master-product-fields.js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Products', 'isMaster', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });
    await queryInterface.addColumn('Products', 'status', {
      type: Sequelize.ENUM('draft', 'pending', 'active', 'inactive'),
      defaultValue: 'draft'
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Products', 'isMaster');
    await queryInterface.removeColumn('Products', 'status');
  }
};