// controllers/productController.js
const Product = require('../models/Product');
const Category = require('../models/Category');
const User = require('../models/User');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const { cloudinaryUtils } = require('../config/Cloudinary');

// ============= ADD ADMIN'S OWN PRODUCT (Admin only) =============
const addAdminProduct = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    // Only admin can add admin products
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only Admin can add products.'
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
      brand,
      sku,
      stock,
      tags,
      specifications,
      metaTitle,
      metaDescription,
      serviceId
    } = req.body;

    // Validate required fields
    if (!name || !productId || !price || !company || !category) {
      return res.status(400).json({
        success: false,
        error: 'Name, Product ID, Price, Company, and Category are required fields'
      });
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
      const uploadPromises = req.files.map(file => 
        cloudinaryUtils.uploadImage(file.path, {
          folder: `products/${slug}`,
          public_id: `${slug}-${Date.now()}`
        })
      );
      
      const uploadResults = await Promise.all(uploadPromises);
      imageUrls = uploadResults.map(result => result.secure_url);
      mainImageUrl = imageUrls[0];
    }

    // Build product data - Admin's own products (no affiliate fields)
    const productData = {
      name,
      slug,
      description: description || `${name} - Premium quality product from ${company}`,
      shortDescription: shortDescription || null,
      price: parseFloat(price),
      company,
      categoryId: categoryRecord.id,
      brand: brand || company,
      sku: productId,
      stock: stock ? parseInt(stock) : 0,
      serviceId: serviceId || null,
      images: imageUrls,
      mainImage: mainImageUrl,
      tags: tags || [],
      specifications: specifications || {},
      metaTitle: metaTitle || name,
      metaDescription: metaDescription || `${name} - ${company} - ${category}`,
      addedBy: req.user.id,
      addedByRole: 'admin',  // Marked as admin's own product
      isActive: true,
      isFeatured: false,
      // Admin's own products don't have affiliate fields
      affiliateUrl: null,
      commissionRate: null,
      affiliateEmail: null,
      adminCommissionShare: null
    };

    const product = await Product.create(productData, { transaction });
    await transaction.commit();

    // Fetch complete product
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

    res.status(201).json({
      success: true,
      data: completeProduct,
      message: 'Product added successfully!'
    });

  } catch (err) {
    await transaction.rollback();
    console.error("Add Admin Product Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to add product: " + err.message
    });
  }
};

// ============= ADD AFFILIATE PRODUCT (Admin adds product suggested by affiliate) =============
const addAffiliateProduct = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    // Only admin can add affiliate products
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only Admin can add affiliate products.'
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
      brand,
      sku,
      stock,
      affiliateId,        // The affiliate who suggested this product
      affiliateUrl,       // Affiliate's referral URL
      commissionRate,     // Commission rate for this affiliate
      tags,
      specifications,
      metaTitle,
      metaDescription,
      serviceId
    } = req.body;

    // Validate required fields
    if (!name || !productId || !price || !company || !category) {
      return res.status(400).json({
        success: false,
        error: 'Name, Product ID, Price, Company, and Category are required fields'
      });
    }

    // Validate affiliate-specific required fields
    if (!affiliateId) {
      return res.status(400).json({
        success: false,
        error: 'Affiliate ID is required for affiliate product addition'
      });
    }

    if (!affiliateUrl) {
      return res.status(400).json({
        success: false,
        error: 'Affiliate URL is required for affiliate product'
      });
    }

    if (!commissionRate) {
      return res.status(400).json({
        success: false,
        error: 'Commission rate is required for affiliate product'
      });
    }

    // Validate commission rate
    const rate = parseFloat(commissionRate);
    if (isNaN(rate) || rate < 10 || rate > 25) {
      return res.status(400).json({
        success: false,
        error: 'Commission rate must be between 10% and 25%'
      });
    }

    // Verify that the affiliate exists
    const affiliateUser = await User.findOne({
      where: { 
        id: affiliateId,
        role: 'affiliate'
      }
    });

    if (!affiliateUser) {
      return res.status(404).json({
        success: false,
        error: 'Affiliate not found. Please provide a valid affiliate ID.'
      });
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
      const uploadPromises = req.files.map(file => 
        cloudinaryUtils.uploadImage(file.path, {
          folder: `products/${slug}`,
          public_id: `${slug}-${Date.now()}`
        })
      );
      
      const uploadResults = await Promise.all(uploadPromises);
      imageUrls = uploadResults.map(result => result.secure_url);
      mainImageUrl = imageUrls[0];
    }

    // Build product data with affiliate fields
    const productData = {
      name,
      slug,
      description: description || `${name} - Premium quality product from ${company}`,
      shortDescription: shortDescription || null,
      price: parseFloat(price),
      company,
      categoryId: categoryRecord.id,
      brand: brand || company,
      sku: productId,
      stock: stock ? parseInt(stock) : 0,
      serviceId: serviceId || null,
      images: imageUrls,
      mainImage: mainImageUrl,
      tags: tags || [],
      specifications: specifications || {},
      metaTitle: metaTitle || name,
      metaDescription: metaDescription || `${name} - ${company} - ${category}`,
      addedBy: affiliateId,        // The affiliate who suggested it
      addedByRole: 'affiliate',    // Marked as affiliate product
      isActive: true,
      isFeatured: false,
      // Affiliate-specific fields
      affiliateUrl: affiliateUrl,
      commissionRate: rate,
      affiliateEmail: affiliateUser.email,
      adminCommissionShare: rate,  // Admin gets this commission when sold
    };

    const product = await Product.create(productData, { transaction });
    await transaction.commit();

    // Fetch complete product with affiliate details
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
          attributes: ['id', 'name', 'email', 'role', 'affiliateId']
        }
      ]
    });

    res.status(201).json({
      success: true,
      data: completeProduct,
      message: `Affiliate product added successfully for ${affiliateUser.name} with ${rate}% commission rate!`
    });

  } catch (err) {
    await transaction.rollback();
    console.error("Add Affiliate Product Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to add affiliate product: " + err.message
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
      addedByRole // Filter by who added (admin/affiliate)
    } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = { isActive: true };

    // Filter by role who added the product
    if (addedByRole && ['admin', 'affiliate'].includes(addedByRole)) {
      whereClause.addedByRole = addedByRole;
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
          attributes: ['id', 'name', 'email', 'role', 'affiliateId']
        }
      ],
      order,
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    // Hide commission details from public view for affiliate products
    const sanitizedRows = rows.map(product => {
      const data = product.toJSON();
      if (data.addedByRole === 'affiliate') {
        delete data.commissionRate;
        delete data.adminCommissionShare;
        delete data.totalCommissionEarned;
        delete data.affiliateEmail;
        // Keep affiliateUrl for reference
      }
      return data;
    });

    res.json({
      success: true,
      data: {
        products: sanitizedRows,
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
          attributes: ['id', 'name', 'email', 'role', 'affiliateId']
        }
      ]
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Hide commission details from public view
    const productData = product.toJSON();
    if (productData.addedByRole === 'affiliate') {
      delete productData.commissionRate;
      delete productData.adminCommissionShare;
      delete productData.totalCommissionEarned;
      delete productData.affiliateEmail;
      // Keep affiliateUrl for reference
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

// ============= UPDATE PRODUCT (Admin & Affiliate owners) =============
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
    // Admin can update any product
    // Affiliate can only update their own products
    if (userRole === 'affiliate' && product.addedBy !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only update products you suggested'
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
      commissionRate,
      removeImages,
      serviceId
    } = req.body;

    // Update category
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

    // Handle image updates
    let imageUrls = product.images || [];
    let mainImageUrl = product.mainImage;

    // Remove selected images
    if (removeImages && removeImages.length > 0) {
      imageUrls = imageUrls.filter(url => !removeImages.includes(url));
      
      if (removeImages.includes(mainImageUrl)) {
        mainImageUrl = imageUrls.length > 0 ? imageUrls[0] : null;
      }
    }

    // Upload new images
    if (req.files && req.files.length > 0) {
      const slug = product.slug || name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'product';
      const uploadPromises = req.files.map(file => 
        cloudinaryUtils.uploadImage(file.path, {
          folder: `products/${slug}`,
          public_id: `${slug}-${Date.now()}`
        })
      );
      
      const uploadResults = await Promise.all(uploadPromises);
      const newImages = uploadResults.map(result => result.secure_url);
      imageUrls = [...imageUrls, ...newImages];
      if (!mainImageUrl && imageUrls.length > 0) {
        mainImageUrl = imageUrls[0];
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
    if (brand) updateData.brand = brand;
    if (sku) updateData.sku = sku;
    if (stock !== undefined) updateData.stock = stock;
    if (serviceId !== undefined) updateData.serviceId = serviceId;
    if (tags) updateData.tags = tags;
    if (specifications) updateData.specifications = specifications;
    if (metaTitle) updateData.metaTitle = metaTitle;
    if (metaDescription) updateData.metaDescription = metaDescription;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isFeatured !== undefined) updateData.isFeatured = isFeatured;

    // Update images
    if (imageUrls.length > 0) {
      updateData.images = imageUrls;
      if (mainImageUrl) {
        updateData.mainImage = mainImageUrl;
      }
    }

    // Affiliate-specific updates (only for affiliate products)
    if (product.addedByRole === 'affiliate') {
      // Only admin can update commission rate
      if (userRole === 'admin' && commissionRate) {
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
      
      // Affiliate can update affiliate URL
      if (userRole === 'affiliate' && affiliateUrl) {
        updateData.affiliateUrl = affiliateUrl;
      }
      
      // Admin can update affiliate email if needed
      if (userRole === 'admin' && req.body.affiliateEmail) {
        updateData.affiliateEmail = req.body.affiliateEmail;
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
          attributes: ['id', 'name', 'email', 'role', 'affiliateId']
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
    // Only affiliates can view their products
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

// ============= ADMIN: GET PRODUCTS WITH COMMISSION INFO =============
const getAdminProductsWithCommission = async (req, res) => {
  try {
    // Only admin can access
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin only.'
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
          attributes: ['id', 'name', 'email', 'affiliateId']
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

// ============= DELETE PRODUCT (Admin only) =============
const deleteProduct = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    
    // Only admin can delete any product
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only Admin can delete products.'
      });
    }

    const product = await Product.findByPk(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Delete images from Cloudinary
    if (product.images && product.images.length > 0) {
      const deletePromises = product.images.map(imageUrl => {
        // Extract public_id from Cloudinary URL
        const publicId = imageUrl.split('/').slice(-2).join('/').split('.')[0];
        return cloudinaryUtils.deleteImage(publicId).catch(err => {
          console.error('Failed to delete image:', err);
        });
      });
      await Promise.all(deletePromises);
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

// ============= GET PRODUCTS BY CATEGORY (Public) =============
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
          as: 'category',
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
      error: "Failed to fetch category products: " + err.message
    });
  }
};

// ============= SEARCH PRODUCTS (Public) =============
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
          as: 'category',
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
      error: "Failed to search products: " + err.message
    });
  }
};

// ============= GET FEATURED PRODUCTS (Public) =============
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
          as: 'category',
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
      error: "Failed to fetch featured products: " + err.message
    });
  }
};

// ============= ADMIN ONLY: GET PRODUCT STATISTICS =============
const getProductStats = async (req, res) => {
  try {
    // Only admin can access
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin only.'
      });
    }

    const [total, active, inactive] = await Promise.all([
      Product.count(),
      Product.count({ where: { isActive: true } }),
      Product.count({ where: { isActive: false } })
    ]);
    
    // Get affiliate product stats (products suggested by affiliates)
    const affiliateProducts = await Product.count({ 
      where: { addedByRole: 'affiliate' } 
    });
    
    // Get admin product stats (admin's own products)
    const adminProducts = await Product.count({ 
      where: { addedByRole: 'admin' } 
    });

    // Calculate total revenue
    const revenueResult = await Product.sum('totalRevenue');
    const totalRevenue = revenueResult || 0;

    // Calculate total commission earned by affiliates
    const totalCommissionEarned = await Product.sum('totalCommissionEarned', {
      where: { addedByRole: 'affiliate' }
    });

    // Get category breakdown
    const categoryStats = await Product.findAll({
      attributes: [
        'categoryId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name']
        }
      ],
      group: ['categoryId', 'category.id']
    });

    res.json({
      success: true,
      data: {
        total: total || 0,
        active: active || 0,
        inactive: inactive || 0,
        totalRevenue: totalRevenue || 0,
        totalCommissionEarned: totalCommissionEarned || 0,
        affiliateProducts: affiliateProducts || 0,
        adminProducts: adminProducts || 0,
        categoryBreakdown: categoryStats
      }
    });

  } catch (err) {
    console.error("Get Product Stats Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch product statistics: " + err.message
    });
  }
};

// ============= ADMIN ONLY: BULK PRODUCT UPLOAD =============
const bulkUploadProducts = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    // Only admin can bulk upload
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin only.'
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
          affiliateId,      // If provided, this is an affiliate product
          commissionRate,   // Required if affiliateId is provided
          images,
          mainImage,
          tags,
          specifications,
          serviceId
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

        // Determine if this is an affiliate product
        let isAffiliateProduct = false;
        let affiliateUser = null;
        
        if (affiliateId) {
          affiliateUser = await User.findOne({
            where: { 
              id: affiliateId,
              role: 'affiliate'
            }
          });
          
          if (affiliateUser) {
            isAffiliateProduct = true;
          } else {
            errors.push({
              index,
              product: productData,
              error: 'Invalid affiliate ID. Affiliate not found.'
            });
            continue;
          }
        }

        // Validate commission rate for affiliate products
        let finalCommissionRate = null;
        if (isAffiliateProduct) {
          if (!commissionRate) {
            errors.push({
              index,
              product: productData,
              error: 'Commission rate is required for affiliate products'
            });
            continue;
          }
          
          const rate = parseFloat(commissionRate);
          if (isNaN(rate) || rate < 10 || rate > 25) {
            errors.push({
              index,
              product: productData,
              error: 'Commission rate must be between 10% and 25%'
            });
            continue;
          }
          finalCommissionRate = rate;
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
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36),
          description: description || `${name} - Premium quality product from ${company}`,
          price: parseFloat(price),
          company,
          categoryId: categoryRecord.id,
          brand: brand || company,
          sku: productId,
          stock: stock ? parseInt(stock) : 0,
          serviceId: serviceId || null,
          affiliateUrl: affiliateUrl || null,
          images: images || [],
          mainImage: mainImage || null,
          tags: tags || [],
          specifications: specifications || {},
          addedBy: isAffiliateProduct ? affiliateUser.id : req.user.id,
          addedByRole: isAffiliateProduct ? 'affiliate' : 'admin',
          isActive: true,
          isFeatured: false,
          // Affiliate-specific fields
          commissionRate: finalCommissionRate,
          affiliateEmail: isAffiliateProduct ? affiliateUser.email : null,
          adminCommissionShare: finalCommissionRate
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

// ============= ADMIN ONLY: GET ADMIN PRODUCTS =============
const getAdminProducts = async (req, res) => {
  try {
    // Only admin can access
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin only.'
      });
    }

    const { page = 1, limit = 50, showInactive = false, type } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (!showInactive) {
      whereClause.isActive = true;
    }

    // Filter by product type
    if (type === 'admin') {
      whereClause.addedByRole = 'admin';
    } else if (type === 'affiliate') {
      whereClause.addedByRole = 'affiliate';
    }

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
          attributes: ['id', 'name', 'email', 'role', 'affiliateId']
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
    console.error("Get Admin Products Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch products: " + err.message
    });
  }
};

// ============= ADMIN: Get Product Purchase History =============
const getProductPurchaseHistory = async (req, res) => {
  try {
    // Only admin can access
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin only.'
      });
    }

    const { id } = req.params;
    const Purchase = require('./Purchase');
    
    const product = await Product.findByPk(id, {
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'slug']
        },
        {
          model: User,
          as: 'addedByUser',
          attributes: ['id', 'name', 'email', 'role', 'affiliateId']
        }
      ]
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Get all purchases for this product
    const purchases = await Purchase.findAll({
      where: { productId: id },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'affiliate',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Calculate statistics
    const stats = {
      totalSales: purchases.length,
      totalRevenue: purchases.reduce((sum, p) => sum + parseFloat(p.totalAmount), 0),
      totalCommission: purchases.reduce((sum, p) => sum + parseFloat(p.commissionAmount), 0),
      totalAdminCommission: purchases.reduce((sum, p) => sum + parseFloat(p.adminCommissionAmount), 0),
      verifiedPurchases: purchases.filter(p => p.paymentStatus === 'verified').length,
      pendingPurchases: purchases.filter(p => p.paymentStatus === 'pending').length,
      rejectedPurchases: purchases.filter(p => p.paymentStatus === 'rejected').length
    };

    res.json({
      success: true,
      data: {
        product,
        purchases,
        stats
      }
    });

  } catch (err) {
    console.error('Get Product Purchase History Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product purchase history: ' + err.message
    });
  }
};

// ============= EXPORT ALL FUNCTIONS =============
module.exports = {
  // Admin adds admin's own product
  addAdminProduct,
  // Admin adds affiliate product (suggested by affiliate)
  addAffiliateProduct,
  // Public routes
  getAllProducts,
  getProductById,
  getProductsByCategory,
  searchProducts,
  getFeaturedProducts,
  // Update and Delete
  updateProduct,
  deleteProduct,
  // Affiliate routes
  getAffiliateProducts,
  // Admin routes
  getAdminProducts,
  getAdminProductsWithCommission,
  getProductStats,
  bulkUploadProducts,
  getProductPurchaseHistory
};