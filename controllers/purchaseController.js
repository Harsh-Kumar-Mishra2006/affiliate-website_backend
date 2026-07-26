const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const User = require('../models/User');
const Commission = require('../models/CommissionModel');
const { sequelize } = require('../config/db');
const { Op } = require('sequelize');

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

    // Get product
    const product = await Product.findByPk(productId);
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

    // Find affiliate for this product (the one who added it)
    const affiliate = await User.findByPk(product.addedBy);
    
    // Generate random commission rate between 10-25%
    const commissionRate = parseFloat((10 + Math.random() * 15).toFixed(2));
    const commissionAmount = parseFloat((totalAmount * (commissionRate / 100)).toFixed(2));

    // Generate order ID
    const orderId = generateOrderId();

    // Create purchase record
    const purchase = await Purchase.create({
      userId: req.user.id,
      productId: product.id,
      affiliateId: product.addedBy,
      orderId,
      productName: product.name,
      productPrice: price,
      quantity,
      totalAmount,
      commissionAmount,
      commissionRate,
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

    res.status(201).json({
      success: true,
      data: {
        purchase,
        orderId,
        totalAmount,
        commissionRate,
        commissionAmount,
        paymentInstructions: {
          upiId: 'affiliatesarthi@pay',
          bankDetails: {
            bankName: 'AffiliateSarthi Bank',
            accountNumber: '1234567890',
            ifscCode: 'ASB0001234',
            accountHolder: 'AffiliateSarthi Pvt Ltd'
          },
          amount: totalAmount
        }
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

// ============= USER: Upload Payment Screenshot =============
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

    // In a real implementation, you would upload to Cloudinary
    // For now, we'll store the file info
    const screenshotData = {
      public_id: `payment_${orderId}`,
      url: file.path || `/uploads/${file.filename}`,
      originalName: file.originalname,
      size: file.size
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
      data: purchase,
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
      // include: [
      //   {
      //     model: Product,
      //     attributes: ['id', 'name', 'mainImage', 'company']
      //   },
      //   {
      //     model: User,
      //     as: 'affiliate',
      //     attributes: ['id', 'name', 'email']
      //   }
      // ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    // Get summary
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
      search
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

    const { count, rows } = await Purchase.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Product,
          attributes: ['id', 'name', 'mainImage', 'company']
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
          as: 'paymentVerifiedBy',
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
      totalCommission: await Purchase.sum('commissionAmount')
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
          attributes: ['id', 'name', 'addedBy', 'price', 'discountedPrice']
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
      const affiliateRate = parseFloat(purchase.commissionRate); // Already set (10-25%)
      
      // Calculate commissions
      const affiliateCommission = parseFloat((totalAmount * (affiliateRate / 100)).toFixed(2));
      
      // Admin gets the remaining amount (75-90%)
      const adminRate = parseFloat((100 - affiliateRate).toFixed(2));
      const adminCommission = parseFloat((totalAmount * (adminRate / 100)).toFixed(2));

      // Find the admin who added the product
      const adminUser = await User.findByPk(purchase.Product.addedBy);
      
      if (adminUser) {
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

        console.log(`✅ Commission Distributed:
          - Affiliate (${purchase.affiliateId}): ${affiliateRate}% = ₹${affiliateCommission}
          - Admin (${purchase.Product.addedBy}): ${adminRate}% = ₹${adminCommission}
          - Total: ₹${totalAmount}
        `);
      } else {
        // Fallback: If no admin found, give all to affiliate
        await Commission.create({
          affiliateId: purchase.affiliateId,
          adminId: null,
          productId: purchase.productId,
          purchaseId: purchase.id,
          orderId: purchase.orderId,
          affiliateCommissionAmount: totalAmount,
          affiliateCommissionRate: 100,
          adminCommissionAmount: 0,
          adminCommissionRate: 0,
          totalAmount: totalAmount,
          status: 'approved',
          paymentDate: new Date(),
          notes: 'Admin not found - full commission to affiliate'
        }, { transaction });

        if (purchase.affiliateId) {
          await User.increment('totalEarnings', {
            by: totalAmount,
            where: { id: purchase.affiliateId },
            transaction
          });

          await User.increment('availableBalance', {
            by: totalAmount,
            where: { id: purchase.affiliateId },
            transaction
          });
        }
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
          adminRate: 100 - parseFloat(purchase.commissionRate),
          adminAmount: parseFloat(purchase.totalAmount) - parseFloat(purchase.commissionAmount)
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
          attributes: ['id', 'name', 'mainImage', 'company', 'price']
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
          as: 'paymentVerifiedBy',
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

    const whereClause = { userId: req.user.id };
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

    // Summary
    const summary = {
      total: await Commission.sum('amount', { where: { userId: req.user.id } }),
      approved: await Commission.sum('amount', { where: { userId: req.user.id, status: 'approved' } }),
      paid: await Commission.sum('amount', { where: { userId: req.user.id, status: 'paid' } }),
      pending: await Commission.sum('amount', { where: { userId: req.user.id, status: 'pending' } })
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

// Add this to purchaseController.js

// ============= ADMIN: Get Commission Summary =============
const getCommissionSummary = async (req, res) => {
  try {
    const { period = 'all' } = req.query; // 'today', 'week', 'month', 'all'
    
    let dateFilter = {};
    const now = new Date();
    
    if (period === 'today') {
      dateFilter = {
        createdAt: {
          [Op.gte]: new Date(now.setHours(0, 0, 0, 0))
        }
      };
    } else if (period === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      dateFilter = {
        createdAt: {
          [Op.gte]: weekAgo
        }
      };
    } else if (period === 'month') {
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      dateFilter = {
        createdAt: {
          [Op.gte]: monthAgo
        }
      };
    }

    // Get all commissions with details
    const commissions = await Commission.findAll({
      where: dateFilter,
      include: [
        {
          model: User,
          as: 'affiliate',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'admin',
          attributes: ['id', 'name', 'email']
        },
        {
          model: Product,
          attributes: ['id', 'name']
        },
        {
          model: Purchase,
          attributes: ['id', 'buyerName', 'buyerEmail']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Calculate summary
    const summary = {
      totalCommissions: await Commission.sum('totalAmount', { 
        where: dateFilter 
      }),
      totalAffiliateCommission: await Commission.sum('affiliateCommissionAmount', {
        where: dateFilter
      }),
      totalAdminCommission: await Commission.sum('adminCommissionAmount', {
        where: dateFilter
      }),
      totalCommissionsCount: commissions.length,
      pendingApproval: await Commission.count({
        where: { 
          ...dateFilter,
          status: 'pending'
        }
      }),
      paid: await Commission.count({
        where: { 
          ...dateFilter,
          status: 'paid'
        }
      }),
      byAdmin: await Commission.findAll({
        where: dateFilter,
        attributes: [
          'adminId',
          [sequelize.fn('SUM', sequelize.col('adminCommissionAmount')), 'totalAdminCommission']
        ],
        group: ['adminId'],
        include: [
          {
            model: User,
            as: 'admin',
            attributes: ['id', 'name', 'email']
          }
        ]
      }),
      byAffiliate: await Commission.findAll({
        where: dateFilter,
        attributes: [
          'affiliateId',
          [sequelize.fn('SUM', sequelize.col('affiliateCommissionAmount')), 'totalAffiliateCommission']
        ],
        group: ['affiliateId'],
        include: [
          {
            model: User,
            as: 'affiliate',
            attributes: ['id', 'name', 'email']
          }
        ]
      })
    };

    res.json({
      success: true,
      data: {
        commissions,
        summary,
        period
      }
    });

  } catch (err) {
    console.error('Get Commission Summary Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch commission summary: ' + err.message
    });
  }
};

// ============= AFFILIATE: Get Affiliate Commission Summary =============
const getAffiliateCommissionSummary = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;
    const affiliateId = req.user.id;

    const whereClause = { affiliateId };
    if (status) {
      whereClause.status = status;
    }

    const { count, rows } = await Commission.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Product,
          attributes: ['id', 'name', 'mainImage', 'company']
        },
        {
          model: User,
          as: 'admin',
          attributes: ['id', 'name', 'email']
        },
        {
          model: Purchase,
          attributes: ['id', 'orderId', 'buyerName', 'buyerEmail', 'createdAt']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    // Enhanced summary for affiliate
    const summary = {
      totalCommission: await Commission.sum('affiliateCommissionAmount', { 
        where: { affiliateId } 
      }),
      approvedCommission: await Commission.sum('affiliateCommissionAmount', {
        where: { affiliateId, status: 'approved' }
      }),
      paidCommission: await Commission.sum('affiliateCommissionAmount', {
        where: { affiliateId, status: 'paid' }
      }),
      pendingCommission: await Commission.sum('affiliateCommissionAmount', {
        where: { affiliateId, status: 'pending' }
      }),
      totalOrders: await Commission.count({
        where: { affiliateId }
      }),
      averageCommissionRate: await Commission.findAll({
        where: { affiliateId },
        attributes: [
          [sequelize.fn('AVG', sequelize.col('affiliateCommissionRate')), 'avgRate']
        ],
        raw: true
      }).then(result => result[0]?.avgRate || 0)
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
    console.error('Get Affiliate Commission Summary Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch affiliate commission summary: ' + err.message
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
  getMyCommissions,
  getCommissionSummary,
  getAffiliateCommissionSummary
};