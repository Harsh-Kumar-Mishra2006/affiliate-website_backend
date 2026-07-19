const { sequelize } = require('../config/db');
const Product = require('../models/Product');
const Category = require('../models/Category');
const User = require('../models/User');
const { faker } = require('@faker-js/faker');

// Generate random product images from picsum.photos
const generateProductImages = (count = 3) => {
  const images = [];
  for (let i = 0; i < count; i++) {
    const width = faker.number.int({ min: 400, max: 800 });
    const height = faker.number.int({ min: 400, max: 800 });
    const id = faker.number.int({ min: 1, max: 1000 });
    images.push(`https://picsum.photos/id/${id}/${width}/${height}`);
  }
  return images;
};

// Generate a single product image
const generateMainImage = () => {
  const width = faker.number.int({ min: 500, max: 800 });
  const height = faker.number.int({ min: 500, max: 800 });
  const id = faker.number.int({ min: 1, max: 1000 });
  return `https://picsum.photos/id/${id}/${width}/${height}`;
};

// Categories with subcategories
const categoryData = [
  {
    name: 'Electronics',
    subcategories: ['Smartphones', 'Laptops', 'Tablets', 'Headphones', 'Smartwatches', 'Cameras']
  },
  {
    name: 'Footwear',
    subcategories: ['Sports Shoes', 'Casual Shoes', 'Formal Shoes', 'Sandals', 'Boots']
  },
  {
    name: 'Clothing',
    subcategories: ['Men\'s Wear', 'Women\'s Wear', 'Kids Wear', 'Sportswear', 'Winter Wear']
  },
  {
    name: 'Home & Kitchen',
    subcategories: ['Furniture', 'Kitchen Appliances', 'Home Decor', 'Bedding', 'Lighting']
  },
  {
    name: 'Beauty & Personal Care',
    subcategories: ['Skincare', 'Makeup', 'Haircare', 'Fragrances', 'Grooming']
  },
  {
    name: 'Sports & Outdoors',
    subcategories: ['Fitness Equipment', 'Outdoor Gear', 'Team Sports', 'Cycling', 'Camping']
  },
  {
    name: 'Books & Stationery',
    subcategories: ['Fiction', 'Non-Fiction', 'Children\'s Books', 'School Supplies', 'Art Supplies']
  },
  {
    name: 'Toys & Games',
    subcategories: ['Action Figures', 'Board Games', 'Puzzles', 'Educational Toys', 'Remote Control']
  }
];

// Product name generators for different categories
const generateProductName = (category, subcategory) => {
  const prefixes = ['Premium', 'Ultra', 'Pro', 'Elite', 'Max', 'Smart', 'Advanced', 'Deluxe', 'Essential', 'Basic'];
  const adjectives = ['Wireless', 'Digital', 'Smart', 'Portable', 'Lightweight', 'Durable', 'Waterproof', 'Compact', 'Ergonomic', 'High-Performance'];
  const suffix = ['Plus', 'X', 'Pro Max', 'Elite', 'Lite', 'Air', 'Mini', 'Ultra', 'Prime', 'One'];
  
  const prefix = faker.helpers.arrayElement(prefixes);
  const adjective = faker.helpers.arrayElement(adjectives);
  const suffixItem = faker.helpers.arrayElement(suffix);
  
  return `${prefix} ${subcategory} ${adjective} ${suffixItem}`.trim();
};

// Generate product description
const generateDescription = (product, category, company) => {
  const features = [
    'High-quality materials',
    'Advanced technology',
    'Sleek and modern design',
    'Excellent performance',
    'Long-lasting durability',
    'User-friendly interface',
    'Eco-friendly construction',
    'Versatile functionality',
    'Premium finish',
    'Superior quality'
  ];
  
  const selectedFeatures = faker.helpers.arrayElements(features, faker.number.int({ min: 3, max: 6 }));
  
  const descriptions = [
    `Experience the ultimate ${category} with the ${product}. ${selectedFeatures.join('. ')}.`,
    `The ${product} is a masterpiece of ${category} engineering. ${selectedFeatures.slice(0, 3).join('. ')}.`,
    `Revolutionize your ${category} experience with the ${product}. ${selectedFeatures.join('. ')}. Perfect for everyday use.`
  ];
  
  return faker.helpers.arrayElement(descriptions);
};

// Generate product specifications
const generateSpecifications = (category, subcategory) => {
  const specs = {
    'Electronics': {
      'Processor': ['Intel i7', 'AMD Ryzen 7', 'Apple M1', 'Snapdragon 888', 'Exynos 2100'],
      'RAM': ['8GB', '16GB', '32GB', '12GB', '6GB'],
      'Storage': ['256GB', '512GB', '1TB', '128GB', '64GB'],
      'Battery Life': ['Up to 12 hours', 'Up to 24 hours', 'Up to 8 hours', 'Up to 48 hours'],
    },
    'Footwear': {
      'Material': ['Leather', 'Synthetic', 'Mesh', 'Canvas', 'Knit', 'Rubber'],
      'Size Range': ['6-12', '7-13', '5-11', '8-14'],
      'Closure': ['Lace-up', 'Slip-on', 'Velcro', 'Zipper'],
      'Sole Type': ['Rubber', 'EVA', 'PU', 'TPR'],
    },
    'Clothing': {
      'Material': ['Cotton', 'Polyester', 'Wool', 'Silk', 'Linen', 'Spandex'],
      'Size': ['S', 'M', 'L', 'XL', 'XXL'],
      'Fit': ['Regular', 'Slim', 'Relaxed', 'Athletic'],
      'Style': ['Casual', 'Formal', 'Sporty', 'Trendy'],
    },
    'Home & Kitchen': {
      'Material': ['Stainless Steel', 'Aluminum', 'Glass', 'Plastic', 'Wood', 'Ceramic'],
      'Color': ['White', 'Black', 'Silver', 'Stainless', 'Copper'],
      'Dimensions': ['10x10x10 inches', '15x15x20 inches', '12x8x14 inches'],
      'Weight': ['2 lbs', '5 lbs', '10 lbs', '15 lbs'],
    },
    default: {
      'Material': ['Premium', 'High-Grade', 'Quality'],
      'Color': ['Black', 'White', 'Blue', 'Red', 'Silver', 'Gold'],
      'Weight': ['Lightweight', 'Medium', 'Heavy'],
      'Dimensions': ['Standard', 'Compact', 'Large'],
    }
  };
  
  const categorySpecs = specs[category] || specs.default;
  const result = {};
  
  Object.keys(categorySpecs).forEach(key => {
    result[key] = faker.helpers.arrayElement(categorySpecs[key]);
  });
  
  // Add some random additional specs
  result['Warranty'] = faker.helpers.arrayElement(['1 Year', '2 Years', '3 Years', '5 Years']);
  result['Country of Origin'] = faker.helpers.arrayElement(['USA', 'China', 'India', 'Japan', 'Germany', 'UK']);
  
  return result;
};

// Generate tags
const generateTags = (category, subcategory) => {
  const tagPool = [
    category, subcategory, 'premium', 'quality', 'new', 'trending',
    'best-seller', 'top-rated', 'durable', 'stylish', 'affordable',
    'luxury', 'eco-friendly', 'innovative', 'classic', 'modern'
  ];
  return faker.helpers.arrayElements(tagPool, faker.number.int({ min: 3, max: 6 }));
};

// Main seeder function
const seedProducts = async () => {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('🚀 Starting product seeding...');
    
    // Check if admin exists, if not create one
    let admin = await User.findOne({ where: { role: 'admin' } });
    if (!admin) {
      console.log('❌ No admin found. Please create an admin first.');
      console.log('👤 Run: POST /api/auth/admin/signup');
      return;
    }

    // Check if products already exist
    const existingProducts = await Product.count();
    if (existingProducts > 0) {
      console.log(`⚠️ ${existingProducts} products already exist. Do you want to proceed?`);
      // Uncomment to delete existing products
      // await Product.destroy({ where: {}, truncate: true });
      // console.log('🗑️ Existing products deleted');
    }

    // Create categories first
    const createdCategories = {};
    for (const catData of categoryData) {
      // Create main category
      const [category] = await Category.findOrCreate({
        where: { name: catData.name },
        defaults: {
          name: catData.name,
          slug: catData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          description: faker.lorem.sentence(),
          image: `https://picsum.photos/id/${faker.number.int({ min: 1, max: 1000 })}/500/500`,
          isActive: true
        },
        transaction
      });
      
      createdCategories[catData.name] = category;
      
      // Create subcategories
      for (const subName of catData.subcategories) {
        const [subcategory] = await Category.findOrCreate({
          where: { name: subName },
          defaults: {
            name: subName,
            slug: subName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            description: faker.lorem.sentence(),
            parentId: category.id,
            image: `https://picsum.photos/id/${faker.number.int({ min: 1, max: 1000 })}/500/500`,
            isActive: true
          },
          transaction
        });
        createdCategories[subName] = subcategory;
      }
    }
    
    console.log(`✅ ${Object.keys(createdCategories).length} categories created`);
    
    // Generate 20 products
    const products = [];
    const allSubcategories = categoryData.flatMap(cat => cat.subcategories);
    
    for (let i = 0; i < 20; i++) {
      // Pick a random category and subcategory
      const category = faker.helpers.arrayElement(categoryData);
      const subcategory = faker.helpers.arrayElement(category.subcategories);
      
      // Generate product details
      const productName = generateProductName(category.name, subcategory);
      const price = parseFloat(faker.commerce.price({ min: 9.99, max: 999.99 }));
      const discountedPrice = faker.datatype.boolean() ? parseFloat((price * (0.6 + Math.random() * 0.3)).toFixed(2)) : null;
      const company = faker.company.name();
      const brand = faker.company.name();
      const sku = faker.string.alphanumeric(10).toUpperCase();
      
      const mainImage = generateMainImage();
      const images = generateProductImages(faker.number.int({ min: 2, max: 5 }));
      
      const product = {
        name: productName,
        slug: productName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + faker.string.alphanumeric(4),
        description: generateDescription(productName, subcategory, company),
        shortDescription: faker.lorem.sentence({ min: 5, max: 15 }),
        price: price,
        discountedPrice: discountedPrice,
        company: company,
        categoryId: createdCategories[subcategory]?.id || createdCategories[category.name]?.id,
        brand: brand,
        sku: sku,
        stock: faker.number.int({ min: 0, max: 100 }),
        rating: parseFloat((2 + Math.random() * 3).toFixed(1)), // 2.0 - 5.0
        reviews: faker.number.int({ min: 0, max: 500 }),
        affiliateUrl: `https://${faker.internet.domainName()}/product/${sku}`,
        images: images,
        mainImage: mainImage,
        tags: generateTags(category.name, subcategory),
        specifications: generateSpecifications(category.name, subcategory),
        metaTitle: `${productName} - Buy Online at Best Price`,
        metaDescription: `Buy ${productName} from ${company}. ${faker.lorem.sentence({ min: 10, max: 20 })}`,
        isActive: true,
        isFeatured: faker.datatype.boolean(0.3), // 30% chance to be featured
        addedBy: admin.id
      };
      
      products.push(product);
    }
    
    // Bulk insert products
    const createdProducts = await Product.bulkCreate(products, { transaction });
    
    await transaction.commit();
    
    console.log(`✅ ${createdProducts.length} products seeded successfully!`);
    console.log('📊 Product Statistics:');
    console.log(`   - Total Products: ${createdProducts.length}`);
    console.log(`   - Featured Products: ${createdProducts.filter(p => p.isFeatured).length}`);
    console.log(`   - Categories Used: ${new Set(products.map(p => p.categoryId)).size}`);
    
    // Log a sample product
    const sample = createdProducts[0];
    console.log('\n📦 Sample Product:');
    console.log(`   - Name: ${sample.name}`);
    console.log(`   - Price: $${sample.price}`);
    console.log(`   - Company: ${sample.company}`);
    console.log(`   - Category: ${sample.categoryId}`);
    console.log(`   - Image: ${sample.mainImage}`);
    
    return createdProducts;
    
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Seeding failed:', error);
    throw error;
  }
};

// Export for use in other scripts
module.exports = seedProducts;

// If run directly
if (require.main === module) {
  (async () => {
    try {
      await seedProducts();
      console.log('\n🎉 Product seeding completed successfully!');
      process.exit(0);
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    }
  })();
}