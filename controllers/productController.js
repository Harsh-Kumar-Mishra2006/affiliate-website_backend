const Product = require('../models/Product');
const Category = require('../models/Category');
const User = require('../models/User');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');

// ============= AFFILIATE: ADD PRODUCT =============
const addProduct = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    // Only affiliates and admin can add products
    if (req.user.role !== 'affiliate' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only affiliates and admin can add products'
      });
    }

    const {
      name,
      productId,
      price,
      company,
      category,
      description,
      shortDescription,
      discountedPrice,
      brand,
      sku,
      stock,
      affiliateUrl,
      images,
      mainImage,
      tags,
      specifications,
      metaTitle,
      metaDescription
    } = req.body;

    // Validate required fields
    if (!name || !productId || !price || !company || !category) {
      return res.status(400).json({
        success: false,
        error: 'Name, Product ID, Price, Company, and Category are required fields'
      });
    }

    // Check if product with same productId exists
    const existingProduct = await Product.findOne({
      where: { 
        [Op.or]: [
          { sku: productId },
          { slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') }
        ]
      }
    });

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        error: 'Product with this ID or name already exists'
      });
    }

    // Find or create category
    let categoryRecord = await Category.findOne({
      where: { 
        [Op.or]: [
          { name: category },
          { slug: category.toLowerCase().replace(/[^a-z0-9]+/g, '-') }
        ]
      }
    });

    if (!categoryRecord) {
      // Create new category if it doesn't exist
      categoryRecord = await Category.create({
        name: category,
        slug: category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        isActive: true
      }, { transaction });
    }

    // Generate slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Create product
    const product = await Product.create({
      name,
      slug,
      description: description || `${name} - Premium quality product from ${company}`,
      shortDescription: shortDescription || null,
      price,
      discountedPrice: discountedPrice || null,
      company,
      categoryId: categoryRecord.id,
      brand: brand || company,
      sku: productId,
      stock: stock || 0,
      affiliateUrl: affiliateUrl || null,
      images: images || [],
      mainImage: mainImage || null,
      tags: tags || [],
      specifications: specifications || {},
      metaTitle: metaTitle || name,
      metaDescription: metaDescription || `${name} - ${company} - ${category}`,
      addedBy: req.user.id,
      isActive: true,
      isFeatured: false
    }, { transaction });

    await transaction.commit();

    // Fetch complete product with category
    const completeProduct = await Product.findByPk(product.id, {
      include: [
        {
          model: Category,
          attributes: ['id', 'name', 'slug']
        },
        {
          model: User,
          as: 'addedByUser',
          attributes: ['id', 'name', 'email', 'role']
        }
      ]
    });

    res.status(201).json({
      success: true,
      data: completeProduct,
      message: 'Product added successfully!'
    });

  } catch (err) {
    await transaction.rollback();
    console.error("Add Product Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to add product: " + err.message
    });
  }
};

// ============= GET ALL PRODUCTS (Public) =============
const getAllProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      company,
      minPrice,
      maxPrice,
      search,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = { isActive: true };

    // Filters
    if (category) {
      const categoryRecord = await Category.findOne({
        where: { 
          [Op.or]: [
            { name: category },
            { slug: category }
          ]
        }
      });
      if (categoryRecord) {
        whereClause.categoryId = categoryRecord.id;
      }
    }

    if (company) {
      whereClause.company = { [Op.like]: `%${company}%` };
    }

    if (minPrice) {
      whereClause.price = { [Op.gte]: minPrice };
    }

    if (maxPrice) {
      whereClause.price = { ...whereClause.price, [Op.lte]: maxPrice };
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
        { brand: { [Op.like]: `%${search}%` } },
        { company: { [Op.like]: `%${search}%` } }
      ];
    }

    // Sorting
    const order = [[sortBy, sortOrder]];

    const { count, rows } = await Product.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Category,
          attributes: ['id', 'name', 'slug']
        },
        {
          model: User,
          as: 'addedByUser',
          attributes: ['id', 'name', 'email', 'role']
        }
      ],
      order,
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    // Calculate average rating and review count
    const productsWithStats = rows.map(product => {
      const productData = product.toJSON();
      // In a real app, you'd have a Review model
      // For now, we'll use placeholder values
      productData.averageRating = productData.rating || 0;
      productData.reviewCount = productData.reviews || 0;
      return productData;
    });

    res.json({
      success: true,
      data: {
        products: productsWithStats,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (err) {
    console.error("Get All Products Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch products"
    });
  }
};

// ============= GET PRODUCT BY ID OR SLUG (Public) =============
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findOne({
      where: {
        [Op.or]: [
          { id: isNaN(id) ? 0 : parseInt(id) },
          { slug: id }
        ],
        isActive: true
      },
      include: [
        {
          model: Category,
          attributes: ['id', 'name', 'slug', 'description']
        },
        {
          model: User,
          as: 'addedByUser',
          attributes: ['id', 'name', 'email', 'role']
        }
      ]
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Increment view count (optional)
    // product.viewCount = (product.viewCount || 0) + 1;
    // await product.save();

    res.json({
      success: true,
      data: product
    });

  } catch (err) {
    console.error("Get Product Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch product"
    });
  }
};

// ============= GET PRODUCTS BY AFFILIATE =============
const getProductsByAffiliate = async (req, res) => {
  try {
    const affiliateId = req.params.id || req.user.id;
    
    // Check permission
    if (req.user.role !== 'admin' && req.user.id !== parseInt(affiliateId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows } = await Product.findAndCountAll({
      where: { addedBy: affiliateId },
      include: [
        {
          model: Category,
          attributes: ['id', 'name', 'slug']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    res.json({
      success: true,
      data: {
        products: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (err) {
    console.error("Get Affiliate Products Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch affiliate products"
    });
  }
};

// ============= UPDATE PRODUCT =============
const updateProduct = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const product = await Product.findByPk(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Check permission: Affiliate can only update their own products, Admin can update any
    if (req.user.role === 'affiliate' && product.addedBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own products'
      });
    }

    if (req.user.role === 'user') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const {
      name,
      productId,
      price,
      company,
      category,
      description,
      shortDescription,
      discountedPrice,
      brand,
      sku,
      stock,
      affiliateUrl,
      images,
      mainImage,
      tags,
      specifications,
      metaTitle,
      metaDescription,
      isActive,
      isFeatured
    } = req.body;

    // Update category if provided
    let categoryId = product.categoryId;
    if (category) {
      let categoryRecord = await Category.findOne({
        where: { 
          [Op.or]: [
            { name: category },
            { slug: category.toLowerCase().replace(/[^a-z0-9]+/g, '-') }
          ]
        }
      });

      if (!categoryRecord) {
        categoryRecord = await Category.create({
          name: category,
          slug: category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          isActive: true
        }, { transaction });
      }
      categoryId = categoryRecord.id;
    }

    // Update product
    const updateData = {};
    if (name) updateData.name = name;
    if (name) updateData.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (price) updateData.price = price;
    if (company) updateData.company = company;
    if (category) updateData.categoryId = categoryId;
    if (description) updateData.description = description;
    if (shortDescription !== undefined) updateData.shortDescription = shortDescription;
    if (discountedPrice !== undefined) updateData.discountedPrice = discountedPrice;
    if (brand) updateData.brand = brand;
    if (sku) updateData.sku = sku;
    if (stock !== undefined) updateData.stock = stock;
    if (affiliateUrl !== undefined) updateData.affiliateUrl = affiliateUrl;
    if (images) updateData.images = images;
    if (mainImage) updateData.mainImage = mainImage;
    if (tags) updateData.tags = tags;
    if (specifications) updateData.specifications = specifications;
    if (metaTitle) updateData.metaTitle = metaTitle;
    if (metaDescription) updateData.metaDescription = metaDescription;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isFeatured !== undefined && req.user.role === 'admin') updateData.isFeatured = isFeatured;

    await product.update(updateData, { transaction });
    await transaction.commit();

    // Fetch updated product
    const updatedProduct = await Product.findByPk(id, {
      include: [
        {
          model: Category,
          attributes: ['id', 'name', 'slug']
        },
        {
          model: User,
          as: 'addedByUser',
          attributes: ['id', 'name', 'email', 'role']
        }
      ]
    });

    res.json({
      success: true,
      data: updatedProduct,
      message: 'Product updated successfully'
    });

  } catch (err) {
    await transaction.rollback();
    console.error("Update Product Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update product: " + err.message
    });
  }
};

// ============= DELETE PRODUCT =============
const deleteProduct = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const product = await Product.findByPk(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Check permission
    if (req.user.role === 'affiliate' && product.addedBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own products'
      });
    }

    if (req.user.role === 'user') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Check if product has affiliate links
    const AffiliateLink = require('../models/AffiliateLink');
    const links = await AffiliateLink.findAll({
      where: { productId: id }
    });

    if (links.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete product with existing affiliate links. Deactivate it instead.'
      });
    }

    await product.destroy({ transaction });
    await transaction.commit();

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (err) {
    await transaction.rollback();
    console.error("Delete Product Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to delete product: " + err.message
    });
  }
};

// ============= GET PRODUCTS BY CATEGORY =============
const getProductsByCategory = async (req, res) => {
  try {
    const { categorySlug } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const category = await Category.findOne({
      where: { 
        [Op.or]: [
          { slug: categorySlug },
          { name: categorySlug }
        ]
      }
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    const { count, rows } = await Product.findAndCountAll({
      where: { 
        categoryId: category.id,
        isActive: true 
      },
      include: [
        {
          model: Category,
          attributes: ['id', 'name', 'slug']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    res.json({
      success: true,
      data: {
        category,
        products: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (err) {
    console.error("Get Products By Category Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch category products"
    });
  }
};

// ============= SEARCH PRODUCTS =============
const searchProducts = async (req, res) => {
  try {
    const { q } = req.query;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    const { count, rows } = await Product.findAndCountAll({
      where: {
        [Op.or]: [
          { name: { [Op.like]: `%${q}%` } },
          { description: { [Op.like]: `%${q}%` } },
          { brand: { [Op.like]: `%${q}%` } },
          { company: { [Op.like]: `%${q}%` } },
          { tags: { [Op.like]: `%${q}%` } }
        ],
        isActive: true
      },
      include: [
        {
          model: Category,
          attributes: ['id', 'name', 'slug']
        }
      ],
      order: [
        ['name', 'ASC']
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    res.json({
      success: true,
      data: {
        products: rows,
        searchQuery: q,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (err) {
    console.error("Search Products Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to search products"
    });
  }
};

// ============= GET FEATURED PRODUCTS =============
const getFeaturedProducts = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const products = await Product.findAll({
      where: {
        isActive: true,
        isFeatured: true
      },
      include: [
        {
          model: Category,
          attributes: ['id', 'name', 'slug']
        }
      ],
      order: [
        ['rating', 'DESC'],
        ['createdAt', 'DESC']
      ],
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: products
    });

  } catch (err) {
    console.error("Get Featured Products Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch featured products"
    });
  }
};

// ============= GET PRODUCT STATISTICS (Admin/Affiliate) =============
const getProductStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    const whereClause = {};
    if (role === 'affiliate') {
      whereClause.addedBy = userId;
    }

    const totalProducts = await Product.count({ where: whereClause });

    const activeProducts = await Product.count({
      where: { ...whereClause, isActive: true }
    });

    const inactiveProducts = await Product.count({
      where: { ...whereClause, isActive: false }
    });

    // Get top products by affiliate clicks/conversions
    const AffiliateLink = require('../models/AffiliateLink');
    
    const topProducts = await AffiliateLink.findAll({
      attributes: [
        'productId',
        [sequelize.fn('SUM', sequelize.col('clicks')), 'totalClicks'],
        [sequelize.fn('SUM', sequelize.col('conversions')), 'totalConversions']
      ],
      include: [
        {
          model: Product,
          where: role === 'affiliate' ? { addedBy: userId } : {},
          attributes: ['id', 'name', 'price', 'company', 'mainImage']
        }
      ],
      group: ['productId'],
      order: [[sequelize.literal('totalClicks'), 'DESC']],
      limit: 10
    });

    res.json({
      success: true,
      data: {
        totalProducts,
        activeProducts,
        inactiveProducts,
        topProducts
      }
    });

  } catch (err) {
    console.error("Get Product Stats Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch product statistics"
    });
  }
};

// ============= BULK PRODUCT UPLOAD (Admin/ Affiliate) =============
const bulkUploadProducts = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    if (req.user.role !== 'affiliate' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only affiliates and admin can bulk upload products'
      });
    }

    const { products } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please provide an array of products'
      });
    }

    if (products.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 products can be uploaded at once'
      });
    }

    const createdProducts = [];
    const errors = [];

    for (const [index, productData] of products.entries()) {
      try {
        const {
          name,
          productId,
          price,
          company,
          category,
          description,
          brand,
          stock,
          affiliateUrl,
          images,
          mainImage,
          tags,
          specifications
        } = productData;

        // Validate required fields
        if (!name || !productId || !price || !company || !category) {
          errors.push({
            index,
            product: productData,
            error: 'Missing required fields: name, productId, price, company, category'
          });
          continue;
        }

        // Check if product exists
        const existingProduct = await Product.findOne({
          where: { 
            [Op.or]: [
              { sku: productId },
              { slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') }
            ]
          }
        });

        if (existingProduct) {
          errors.push({
            index,
            product: productData,
            error: 'Product with this ID or name already exists'
          });
          continue;
        }

        // Find or create category
        let categoryRecord = await Category.findOne({
          where: { 
            [Op.or]: [
              { name: category },
              { slug: category.toLowerCase().replace(/[^a-z0-9]+/g, '-') }
            ]
          }
        });

        if (!categoryRecord) {
          categoryRecord = await Category.create({
            name: category,
            slug: category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            isActive: true
          }, { transaction });
        }

        // Create product
        const product = await Product.create({
          name,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          description: description || `${name} - Premium quality product from ${company}`,
          price,
          company,
          categoryId: categoryRecord.id,
          brand: brand || company,
          sku: productId,
          stock: stock || 0,
          affiliateUrl: affiliateUrl || null,
          images: images || [],
          mainImage: mainImage || null,
          tags: tags || [],
          specifications: specifications || {},
          addedBy: req.user.id,
          isActive: true,
          isFeatured: false
        }, { transaction });

        createdProducts.push(product);

      } catch (error) {
        errors.push({
          index,
          product: productData,
          error: error.message
        });
      }
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      data: {
        created: createdProducts.length,
        failed: errors.length,
        products: createdProducts,
        errors: errors
      },
      message: `${createdProducts.length} products uploaded successfully`
    });

  } catch (err) {
    await transaction.rollback();
    console.error("Bulk Upload Products Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to upload products: " + err.message
    });
  }
};

module.exports = {
  addProduct,
  getAllProducts,
  getProductById,
  getProductsByAffiliate,
  updateProduct,
  deleteProduct,
  getProductsByCategory,
  searchProducts,
  getFeaturedProducts,
  getProductStats,
  bulkUploadProducts
};