// controllers/purchaseController.js
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const User = require('../models/User');
const Commission = require('../models/CommissionModel');
const { sequelize } = require('../config/db');
const { Op } = require('sequelize');
const { cloudinaryUtils } = require('../config/Cloudinary');

// Generate unique order ID
const generateOrderId = () => {
  const prefix = 'ORD';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

// ============= USER: Initiate Purchase =============
const initiatePurchase = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const {
      productId,
      quantity = 1,
      buyerName,
      buyerEmail,
      buyerPhone,
      shippingAddress,
      notes
    } = req.body;

    if (!productId || !buyerName || !buyerEmail || !buyerPhone) {
      return res.status(400).json({
        success: false,
        error: 'Product ID, buyer name, email, and phone are required'
      });
    }

    // Get product with affiliate info
    const product = await Product.findByPk(productId, {
      include: [
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

    if (!product.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Product is not available'
      });
    }

    // Check stock
    if (product.stock < quantity) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient stock'
      });
    }

    // Calculate total amount
    const price = product.discountedPrice || product.price;
    const totalAmount = price * quantity;

    // Determine commission structure based on who added the product
    let affiliateId = null;
    let commissionRate = 0;
    let adminCommissionRate = 0;
    let affiliateCommissionAmount = 0;
    let adminCommissionAmount = 0;

    if (product.addedByRole === 'affiliate') {
      // Product added by affiliate - split commission
      affiliateId = product.addedBy;
      commissionRate = parseFloat(product.commissionRate) || 10.00; // Affiliate's commission rate
      adminCommissionRate = parseFloat(100 - commissionRate); // Admin gets the rest
      
      affiliateCommissionAmount = parseFloat((totalAmount * (commissionRate / 100)).toFixed(2));
      adminCommissionAmount = parseFloat((totalAmount * (adminCommissionRate / 100)).toFixed(2));
    } else {
      // Product added by admin - all commission goes to admin
      affiliateId = null;
      commissionRate = 0;
      adminCommissionRate = 100;
      affiliateCommissionAmount = 0;
      adminCommissionAmount = parseFloat(totalAmount);
    }

    // Generate order ID
    const orderId = generateOrderId();

    // Create purchase record
    const purchase = await Purchase.create({
      userId: req.user.id,
      productId: product.id,
      affiliateId: affiliateId,
      orderId,
      productName: product.name,
      productPrice: price,
      quantity,
      totalAmount,
      commissionAmount: affiliateCommissionAmount,
      commissionRate: commissionRate,
      adminCommissionAmount: adminCommissionAmount,
      adminCommissionRate: adminCommissionRate,
      status: 'pending',
      paymentStatus: 'pending',
      buyerName,
      buyerEmail,
      buyerPhone,
      shippingAddress,
      notes,
      paymentScreenshot: null
    }, { transaction });

    // Update product stock
    await product.update({
      stock: product.stock - quantity
    }, { transaction });

    await transaction.commit();

    // Prepare payment instructions based on product owner
    const paymentInstructions = {
      upiId: 'affiliatesarthi@pay',
      bankDetails: {
        bankName: 'AffiliateSarthi Bank',
        accountNumber: '1234567890',
        ifscCode: 'ASB0001234',
        accountHolder: 'AffiliateSarthi Pvt Ltd'
      },
      amount: totalAmount,
      orderId: orderId
    };

    // If product is from affiliate, show affiliate info
    if (product.addedByRole === 'affiliate') {
      paymentInstructions.affiliateInfo = {
        name: product.addedByUser?.name || 'Affiliate',
        email: product.addedByUser?.email || '',
        commissionRate: commissionRate,
        commissionAmount: affiliateCommissionAmount
      };
    }

    res.status(201).json({
      success: true,
      data: {
        purchase,
        orderId,
        totalAmount,
        commissionRate,
        commissionAmount: affiliateCommissionAmount,
        adminCommissionAmount: adminCommissionAmount,
        productOwner: product.addedByRole,
        paymentInstructions
      },
      message: 'Purchase initiated. Please complete payment.'
    });

  } catch (err) {
    await transaction.rollback();
    console.error('Initiate Purchase Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate purchase: ' + err.message
    });
  }
};

// ============= USER: Upload Payment Screenshot to Cloudinary =============
const uploadPaymentScreenshot = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { orderId, paymentNotes } = req.body;
    const file = req.file;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'Payment screenshot is required'
      });
    }

    // Find purchase
    const purchase = await Purchase.findOne({
      where: { 
        orderId,
        userId: req.user.id
      }
    });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        error: 'Purchase not found'
      });
    }

    if (purchase.paymentStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Payment already ${purchase.paymentStatus}`
      });
    }

    // Upload to Cloudinary
    const uploadResult = await cloudinaryUtils.uploadPaymentScreenshot(file.path, {
      public_id: `payment_${orderId}`,
      folder: 'payments'
    });

    // Store screenshot data with Cloudinary info
    const screenshotData = {
      public_id: uploadResult.public_id,
      url: uploadResult.secure_url,
      originalName: file.originalname,
      size: file.size,
      format: uploadResult.format,
      width: uploadResult.width,
      height: uploadResult.height,
      uploadedAt: new Date().toISOString()
    };

    // Update purchase with payment screenshot
    await purchase.update({
      paymentScreenshot: screenshotData,
      paymentNotes: paymentNotes || purchase.paymentNotes,
      paymentStatus: 'pending',
      status: 'pending'
    }, { transaction });

    await transaction.commit();

    res.json({
      success: true,
      data: {
        purchase,
        screenshot: screenshotData
      },
      message: 'Payment screenshot uploaded successfully. Awaiting verification.'
    });

  } catch (err) {
    await transaction.rollback();
    console.error('Upload Payment Screenshot Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to upload payment screenshot: ' + err.message
    });
  }
};

// ============= USER: Get My Purchases =============
const getMyPurchases = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = { userId: req.user.id };
    if (status) {
      whereClause.paymentStatus = status;
    }

    const { count, rows } = await Purchase.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'mainImage', 'company']
        },
        {
          model: User,
          as: 'affiliate',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    const summary = {
      total: await Purchase.count({ where: { userId: req.user.id } }),
      pending: await Purchase.count({ where: { userId: req.user.id, paymentStatus: 'pending' } }),
      verified: await Purchase.count({ where: { userId: req.user.id, paymentStatus: 'verified' } }),
      completed: await Purchase.count({ where: { userId: req.user.id, status: 'completed' } })
    };

    res.json({
      success: true,
      data: {
        purchases: rows,
        summary,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (err) {
    console.error('Get My Purchases Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch purchases: ' + err.message
    });
  }
};

// ============= USER: Get Purchase Details =============
const getPurchaseDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    const purchase = await Purchase.findOne({
      where: { 
        orderId,
        userId: req.user.id
      },
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'mainImage', 'company', 'description']
        },
        {
          model: User,
          as: 'affiliate',
          attributes: ['id', 'name', 'email', 'affiliateId']
        }
      ]
    });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        error: 'Purchase not found'
      });
    }

    res.json({
      success: true,
      data: purchase
    });

  } catch (err) {
    console.error('Get Purchase Details Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch purchase details: ' + err.message
    });
  }
};

// ============= ADMIN: Get All Purchases =============
const getAllPurchases = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      paymentStatus,
      status,
      search,
      productOwner // 'admin' or 'affiliate'
    } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (paymentStatus) whereClause.paymentStatus = paymentStatus;
    if (status) whereClause.status = status;
    if (search) {
      whereClause[Op.or] = [
        { orderId: { [Op.like]: `%${search}%` } },
        { buyerName: { [Op.like]: `%${search}%` } },
        { buyerEmail: { [Op.like]: `%${search}%` } },
        { productName: { [Op.like]: `%${search}%` } }
      ];
    }

    // Filter by product owner type
    const productInclude = {
      model: Product,
      as: 'product',
      attributes: ['id', 'name', 'mainImage', 'company', 'addedBy', 'addedByRole']
    };
    
    if (productOwner) {
      productInclude.where = { addedByRole: productOwner };
    }

    const { count, rows } = await Purchase.findAndCountAll({
      where: whereClause,
      include: [
        productInclude,
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'phone']
        },
        {
          model: User,
          as: 'affiliate',
          attributes: ['id', 'name', 'email', 'affiliateId']
        },
        {
          model: User,
          as: 'paymentVerifiedByUser',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    // Summary statistics
    const summary = {
      total: await Purchase.count(),
      pending: await Purchase.count({ where: { paymentStatus: 'pending' } }),
      verified: await Purchase.count({ where: { paymentStatus: 'verified' } }),
      rejected: await Purchase.count({ where: { paymentStatus: 'rejected' } }),
      completed: await Purchase.count({ where: { status: 'completed' } }),
      totalRevenue: await Purchase.sum('totalAmount'),
      totalCommission: await Purchase.sum('commissionAmount'),
      totalAdminCommission: await Purchase.sum('adminCommissionAmount')
    };

    // Get commission breakdown by product owner
    const commissionBreakdown = {
      affiliateProducts: await Purchase.sum('commissionAmount', { 
        where: { 
          affiliateId: { [Op.ne]: null } 
        } 
      }),
      adminProducts: await Purchase.sum('adminCommissionAmount', { 
        where: { 
          affiliateId: null 
        } 
      })
    };

    res.json({
      success: true,
      data: {
        purchases: rows,
        summary,
        commissionBreakdown,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (err) {
    console.error('Get All Purchases Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch purchases: ' + err.message
    });
  }
};

// ============= ADMIN: Verify Payment =============
const verifyPayment = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { orderId } = req.params;
    const { status, verificationNotes } = req.body;

    if (!status || !['verified', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be "verified" or "rejected"'
      });
    }

    // Find purchase with all details
    const purchase = await Purchase.findOne({
      where: { orderId },
      include: [
        {
          model: Product,
          attributes: ['id', 'name', 'addedBy', 'addedByRole', 'price', 'discountedPrice', 'commissionRate']
        },
        {
          model: User,
          as: 'affiliate',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        error: 'Purchase not found'
      });
    }

    if (purchase.paymentStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Payment already ${purchase.paymentStatus}`
      });
    }

    // Update purchase
    await purchase.update({
      paymentStatus: status,
      paymentVerifiedBy: req.user.id,
      paymentVerifiedAt: new Date(),
      status: status === 'verified' ? 'completed' : 'cancelled',
      paymentNotes: verificationNotes || purchase.paymentNotes
    }, { transaction });

    // If verified, process commission
    if (status === 'verified') {
      // Update product purchase count and revenue
      await Product.increment('purchaseCount', {
        by: purchase.quantity,
        where: { id: purchase.productId },
        transaction
      });

      await Product.increment('totalRevenue', {
        by: purchase.totalAmount,
        where: { id: purchase.productId },
        transaction
      });

      // === COMMISSION DISTRIBUTION LOGIC ===
      const totalAmount = parseFloat(purchase.totalAmount);
      
      // Check if product was added by affiliate or admin
      if (purchase.Product.addedByRole === 'affiliate') {
        // Product added by affiliate - split commission
        const affiliateRate = parseFloat(purchase.commissionRate) || 10.00;
        const adminRate = parseFloat(100 - affiliateRate);
        
        const affiliateCommission = parseFloat((totalAmount * (affiliateRate / 100)).toFixed(2));
        const adminCommission = parseFloat((totalAmount * (adminRate / 100)).toFixed(2));

        // Create commission record for affiliate
        const commission = await Commission.create({
          affiliateId: purchase.affiliateId,
          adminId: purchase.Product.addedBy,
          productId: purchase.productId,
          purchaseId: purchase.id,
          orderId: purchase.orderId,
          affiliateCommissionAmount: affiliateCommission,
          affiliateCommissionRate: affiliateRate,
          adminCommissionAmount: adminCommission,
          adminCommissionRate: adminRate,
          totalAmount: totalAmount,
          status: 'approved',
          paymentDate: new Date(),
          notes: `Commission split: ${affiliateRate}% (₹${affiliateCommission}) to affiliate, ${adminRate}% (₹${adminCommission}) to admin`
        }, { transaction });

        // Update affiliate's earnings
        if (purchase.affiliateId) {
          await User.increment('totalEarnings', {
            by: affiliateCommission,
            where: { id: purchase.affiliateId },
            transaction
          });

          await User.increment('availableBalance', {
            by: affiliateCommission,
            where: { id: purchase.affiliateId },
            transaction
          });
        }

        // Update admin's earnings (product owner)
        await User.increment('totalEarnings', {
          by: adminCommission,
          where: { id: purchase.Product.addedBy },
          transaction
        });

        await User.increment('availableBalance', {
          by: adminCommission,
          where: { id: purchase.Product.addedBy },
          transaction
        });

        console.log(`✅ Commission Distributed (Affiliate Product):
          - Affiliate (${purchase.affiliateId}): ${affiliateRate}% = ₹${affiliateCommission}
          - Admin (${purchase.Product.addedBy}): ${adminRate}% = ₹${adminCommission}
          - Total: ₹${totalAmount}
        `);
      } else {
        // Product added by admin - full amount goes to admin
        const adminCommission = totalAmount;

        // Create commission record for admin
        const commission = await Commission.create({
          affiliateId: null,
          adminId: purchase.Product.addedBy,
          productId: purchase.productId,
          purchaseId: purchase.id,
          orderId: purchase.orderId,
          affiliateCommissionAmount: 0,
          affiliateCommissionRate: 0,
          adminCommissionAmount: adminCommission,
          adminCommissionRate: 100,
          totalAmount: totalAmount,
          status: 'approved',
          paymentDate: new Date(),
          notes: `Full commission to admin (product owner) - ₹${adminCommission}`
        }, { transaction });

        // Update admin's earnings
        await User.increment('totalEarnings', {
          by: adminCommission,
          where: { id: purchase.Product.addedBy },
          transaction
        });

        await User.increment('availableBalance', {
          by: adminCommission,
          where: { id: purchase.Product.addedBy },
          transaction
        });

        console.log(`✅ Commission Distributed (Admin Product):
          - Admin (${purchase.Product.addedBy}): 100% = ₹${adminCommission}
          - Total: ₹${totalAmount}
        `);
      }
    }

    await transaction.commit();

    res.json({
      success: true,
      data: {
        purchase,
        commission: {
          affiliateRate: purchase.commissionRate,
          affiliateAmount: purchase.commissionAmount,
          adminRate: purchase.adminCommissionRate,
          adminAmount: purchase.adminCommissionAmount
        }
      },
      message: `Payment ${status} successfully and commission distributed`
    });

  } catch (err) {
    await transaction.rollback();
    console.error('Verify Payment Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to verify payment: ' + err.message
    });
  }
};

// ============= ADMIN: Get Purchase by ID =============
const getPurchaseById = async (req, res) => {
  try {
    const { id } = req.params;

    const purchase = await Purchase.findByPk(id, {
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'mainImage', 'company', 'price', 'addedByRole']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'phone']
        },
        {
          model: User,
          as: 'affiliate',
          attributes: ['id', 'name', 'email', 'affiliateId']
        },
        {
          model: User,
          as: 'paymentVerifiedByUser',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        error: 'Purchase not found'
      });
    }

    res.json({
      success: true,
      data: purchase
    });

  } catch (err) {
    console.error('Get Purchase Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch purchase: ' + err.message
    });
  }
};

// ============= AFFILIATE: Get My Commissions =============
const getMyCommissions = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = { affiliateId: req.user.id };
    if (status) whereClause.status = status;

    const { count, rows } = await Commission.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Product,
          attributes: ['id', 'name', 'mainImage', 'company']
        },
        {
          model: Purchase,
          attributes: ['orderId', 'buyerName', 'buyerEmail']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    const summary = {
      total: await Commission.sum('affiliateCommissionAmount', { 
        where: { affiliateId: req.user.id } 
      }),
      approved: await Commission.sum('affiliateCommissionAmount', { 
        where: { affiliateId: req.user.id, status: 'approved' } 
      }),
      paid: await Commission.sum('affiliateCommissionAmount', { 
        where: { affiliateId: req.user.id, status: 'paid' } 
      }),
      pending: await Commission.sum('affiliateCommissionAmount', { 
        where: { affiliateId: req.user.id, status: 'pending' } 
      })
    };

    res.json({
      success: true,
      data: {
        commissions: rows,
        summary,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (err) {
    console.error('Get My Commissions Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch commissions: ' + err.message
    });
  }
};

module.exports = {
  initiatePurchase,
  uploadPaymentScreenshot,
  getMyPurchases,
  getPurchaseDetails,
  getAllPurchases,
  verifyPayment,
  getPurchaseById,
  getMyCommissions
};