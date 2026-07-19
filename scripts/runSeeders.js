const seedProducts = require('../seeders/productSeeder');
const { sequelize } = require('../config/db');

console.log('🌱 Running Product Seeder...');
console.log('================================');

(async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connected');
    
    // Run seeder
    await seedProducts();
    
    console.log('================================');
    console.log('✅ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
})();