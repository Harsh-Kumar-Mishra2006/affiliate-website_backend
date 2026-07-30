// controllers/productController.js
const Product = require('../models/Product');
const Category = require('../models/Category');
const User = require('../models/User');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const { cloudinaryUtils } = require('../config/cloudinary');

// ============= ADD PRODUCT (Admin & Affiliate) =============
const addProduct = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    // Allow only Admin and Affiliate
    if (userRole !== 'admin' && userRole !== 'affiliate') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only Admin and Affiliate can add products.'
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
      tags,
      specifications,
      metaTitle,
      metaDescription,
      commissionRate // For affiliate only
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
      categoryRecord = await Category.create({
        name: category,
        slug: category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        isActive: true
      }, { transaction });
    }

    // Generate slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);

    // Handle image uploads
    let imageUrls = [];
    let mainImageUrl = null;

    if (req.files && req.files.length > 0) {
      // Upload to Cloudinary
      const uploadPromises = req.files.map(file => 
        cloudinaryUtils.uploadImage(file.path, {
          folder: `products/${slug}`,
          public_id: `${slug}-${Date.now()}`
        })
      );
      
      const uploadResults = await Promise.all(uploadPromises);
      imageUrls = uploadResults.map(result => result.secure_url);
      mainImageUrl = imageUrls[0]; // First image as main
    }

    // Build product data
    const productData = {
      name,
      slug,
      description: description || `${name} - Premium quality product from ${company}`,
      shortDescription: shortDescription || null,
      price: parseFloat(price),
      discountedPrice: discountedPrice ? parseFloat(discountedPrice) : null,
      company,
      categoryId: categoryRecord.id,
      brand: brand || company,
      sku: productId,
      stock: stock ? parseInt(stock) : 0,
      images: imageUrls,
      mainImage: mainImageUrl,
      tags: tags || [],
      specifications: specifications || {},
      metaTitle: metaTitle || name,
      metaDescription: metaDescription || `${name} - ${company} - ${category}`,
      addedBy: userId,
      addedByRole: userRole,
      isActive: true,
      isFeatured: false
    };

    // Affiliate-specific fields
    if (userRole === 'affiliate') {
      // Affiliate must provide affiliate URL
      if (!affiliateUrl) {
        return res.status(400).json({
          success: false,
          error: 'Affiliate URL is required for affiliate product addition'
        });
      }

      // Validate commission rate
      let finalCommissionRate = 10.00; // Default
      if (commissionRate) {
        const rate = parseFloat(commissionRate);
        if (rate >= 10 && rate <= 25) {
          finalCommissionRate = rate;
        } else {
          return res.status(400).json({
            success: false,
            error: 'Commission rate must be between 10% and 25%'
          });
        }
      }

      productData.affiliateUrl = affiliateUrl;
      productData.commissionRate = finalCommissionRate;
      productData.affiliateEmail = req.user.email;
      productData.adminCommissionShare = finalCommissionRate; // Admin gets the commission
    } else {
      // Admin doesn't need affiliate URL
      productData.affiliateUrl = null;
      productData.commissionRate = null;
      productData.affiliateEmail = null;
      productData.adminCommissionShare = null;
    }

    const product = await Product.create(productData, { transaction });

    await transaction.commit();

    // Fetch complete product with associations
    const completeProduct = await Product.findByPk(product.id, {
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'slug']
        },
        {
          model: User,
          as: 'addedByUser',
          attributes: ['id', 'name', 'email', 'role']
        }
      ]
    });

    // Prepare response message
    let message = 'Product added successfully!';
    if (userRole === 'affiliate') {
      message = `Product added successfully with ${completeProduct.commissionRate}% commission rate. Admin will receive this commission.`;
    }

    res.status(201).json({
      success: true,
      data: completeProduct,
      message: message
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
      sortOrder = 'DESC',
      role // Filter by who added (admin/affiliate)
    } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = { isActive: true };

    // Filter by role who added the product
    if (role && ['admin', 'affiliate'].includes(role)) {
      whereClause.addedByRole = role;
    }

    // Other filters
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

    const order = [[sortBy, sortOrder]];

    const { count, rows } = await Product.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Category,
          as: 'category',
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
    console.error("Get All Products Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch products: " + err.message
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
          as: 'category',
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

    // Hide affiliate commission details from public view
    const productData = product.toJSON();
    if (productData.addedByRole === 'affiliate') {
      // Don't expose commission details to public
      delete productData.commissionRate;
      delete productData.adminCommissionShare;
    }

    res.json({
      success: true,
      data: productData
    });

  } catch (err) {
    console.error("Get Product Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch product: " + err.message
    });
  }
};

// ============= UPDATE PRODUCT =============
const updateProduct = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const userRole = req.user.role;
    const userId = req.user.id;

    const product = await Product.findByPk(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Check permissions
    if (userRole === 'affiliate' && product.addedBy !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only update products you added'
      });
    }

    if (userRole !== 'admin' && userRole !== 'affiliate') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only Admin and Affiliate can update products.'
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
      tags,
      specifications,
      metaTitle,
      metaDescription,
      isActive,
      isFeatured,
      commissionRate // Only for affiliate
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

    // Handle new image uploads
    let imageUrls = product.images || [];
    let mainImageUrl = product.mainImage;

    if (req.files && req.files.length > 0) {
      const slug = product.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const uploadPromises = req.files.map(file => 
        cloudinaryUtils.uploadImage(file.path, {
          folder: `products/${slug}`,
          public_id: `${slug}-${Date.now()}`
        })
      );
      
      const uploadResults = await Promise.all(uploadPromises);
      const newImages = uploadResults.map(result => result.secure_url);
      imageUrls = [...imageUrls, ...newImages];
      if (!mainImageUrl) {
        mainImageUrl = newImages[0];
      }
    }

    // Build update data
    const updateData = {};
    if (name) {
      updateData.name = name;
      updateData.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);
    }
    if (price) updateData.price = price;
    if (company) updateData.company = company;
    if (category) updateData.categoryId = categoryId;
    if (description) updateData.description = description;
    if (shortDescription !== undefined) updateData.shortDescription = shortDescription;
    if (discountedPrice !== undefined) updateData.discountedPrice = discountedPrice;
    if (brand) updateData.brand = brand;
    if (sku) updateData.sku = sku;
    if (stock !== undefined) updateData.stock = stock;
    if (tags) updateData.tags = tags;
    if (specifications) updateData.specifications = specifications;
    if (metaTitle) updateData.metaTitle = metaTitle;
    if (metaDescription) updateData.metaDescription = metaDescription;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isFeatured !== undefined) updateData.isFeatured = isFeatured;

    // Update images if new ones were uploaded
    if (imageUrls.length > 0) {
      updateData.images = imageUrls;
      if (mainImageUrl) {
        updateData.mainImage = mainImageUrl;
      }
    }

    // Affiliate-specific updates
    if (userRole === 'affiliate') {
      if (affiliateUrl) updateData.affiliateUrl = affiliateUrl;
      
      if (commissionRate) {
        const rate = parseFloat(commissionRate);
        if (rate >= 10 && rate <= 25) {
          updateData.commissionRate = rate;
          updateData.adminCommissionShare = rate;
        } else {
          return res.status(400).json({
            success: false,
            error: 'Commission rate must be between 10% and 25%'
          });
        }
      }
    }

    await product.update(updateData, { transaction });
    await transaction.commit();

    // Fetch updated product
    const updatedProduct = await Product.findByPk(id, {
      include: [
        {
          model: Category,
          as: 'category',
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

// ============= AFFILIATE: GET THEIR PRODUCTS =============
const getAffiliateProducts = async (req, res) => {
  try {
    if (req.user.role !== 'affiliate') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only affiliates can view their products.'
      });
    }

    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows } = await Product.findAndCountAll({
      where: {
        addedBy: req.user.id,
        addedByRole: 'affiliate'
      },
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'slug']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    // Calculate commission stats
    const totalCommissionEarned = await Product.sum('totalCommissionEarned', {
      where: { addedBy: req.user.id }
    });

    res.json({
      success: true,
      data: {
        products: rows,
        stats: {
          totalProducts: count,
          totalCommissionEarned: totalCommissionEarned || 0
        },
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
      error: "Failed to fetch affiliate products: " + err.message
    });
  }
};

// ============= ADMIN: GET ALL PRODUCTS WITH COMMISSION INFO =============
const getAdminProductsWithCommission = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only admin can view this data.'
      });
    }

    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows } = await Product.findAndCountAll({
      where: {
        addedByRole: 'affiliate'
      },
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'slug']
        },
        {
          model: User,
          as: 'addedByUser',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    // Calculate total admin commission
    const totalAdminCommission = await Product.sum('adminCommissionShare', {
      where: { addedByRole: 'affiliate' }
    });

    res.json({
      success: true,
      data: {
        products: rows,
        stats: {
          totalAffiliateProducts: count,
          totalAdminCommission: totalAdminCommission || 0
        },
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (err) {
    console.error("Get Admin Products With Commission Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch products: " + err.message
    });
  }
};

// ============= EXPORT ALL FUNCTIONS =============
module.exports = {
  addProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getProductsByCategory,
  searchProducts,
  getFeaturedProducts,
  getProductStats,
  bulkUploadProducts,
  getAdminProducts,
  getAffiliateProducts,
  getAdminProductsWithCommission
};