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
    const totalAmount = parseFloat(product.price) * quantity;

    // Determine commission structure based on who added the product
    let affiliateId = null;
let commissionRate = 0;
let affiliateCommissionAmount = 0;
let adminCommissionAmount = 0;

if (product.addedByRole === 'affiliate') {
  // ✅ Product added by affiliate - commission split
  affiliateId = product.addedBy;
  commissionRate = parseFloat(product.commissionRate) || 0;
  
  // 🔄 SWAPPED: Affiliate gets commissionRate% (e.g., 10%), Admin gets (100 - commissionRate)% (e.g., 90%)
  affiliateCommissionAmount = parseFloat((totalAmount * (commissionRate / 100)).toFixed(2));
  adminCommissionAmount = parseFloat((totalAmount * ((100 - commissionRate) / 100)).toFixed(2));
} else {
  // ✅ Product added by admin - 100% goes to admin
  affiliateId = null;
  commissionRate = 0;
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
      serviceId: product.serviceId || null,
      productPrice: product.price,
      quantity,
      totalAmount,
      commissionAmount: affiliateCommissionAmount,  // Affiliate's commission
      commissionRate: commissionRate,               // Affiliate's rate
      adminCommissionAmount: adminCommissionAmount, // Admin's commission
      adminCommissionRate: 100 - commissionRate,    // Admin's rate (swapped) // Admin's rate is the commission rate
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

    // Prepare payment instructions
    const paymentInstructions = {
      upiId: 'affiliatesarthi@pay',
      bankDetails: {
        bankName: 'AffiliateSarthi Bank',
        accountNumber: '1234567890',
        ifscCode: 'ASB0001234',
        accountHolder: 'AffiliateSarthi Pvt Ltd'
      },
      amount: totalAmount,
      orderId: orderId,
      serviceId: product.serviceId || null
    };

    // If product is from affiliate, show commission info
    if (product.addedByRole === 'affiliate') {
      paymentInstructions.commissionInfo = {
        commissionRate: commissionRate,
        adminCommission: adminCommissionAmount,
        affiliateCommission: affiliateCommissionAmount,
        affiliateName: product.addedByUser?.name || 'Affiliate',
        message: `Admin gets ${commissionRate}% (₹${adminCommissionAmount}), Affiliate gets ${100 - commissionRate}% (₹${affiliateCommissionAmount})`
      };
    } else {
      paymentInstructions.commissionInfo = {
        type: 'admin_product',
        message: 'This is an admin product. Admin gets 100% (₹' + totalAmount + ')'
      };
    }

    res.status(201).json({
      success: true,
      data: {
        purchase,
        orderId,
        totalAmount,
        serviceId: product.serviceId || null,
        commissionInfo: {
          type: product.addedByRole === 'affiliate' ? 'affiliate_product' : 'admin_product',
          commissionRate: commissionRate,
          adminCommissionAmount: adminCommissionAmount,
          affiliateCommissionAmount: affiliateCommissionAmount,
          adminGets: product.addedByRole === 'affiliate' ? `${commissionRate}%` : '100%',
          affiliateGets: product.addedByRole === 'affiliate' ? `${100 - commissionRate}%` : '0%'
        },
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
      totalAffiliateCommission: await Purchase.sum('commissionAmount'),
      totalAdminCommission: await Purchase.sum('adminCommissionAmount')
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

    const purchase = await Purchase.findOne({
      where: { orderId },
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'addedBy', 'addedByRole', 'price', 'commissionRate']
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
      
      if (purchase.product && purchase.product.addedByRole === 'affiliate') {
        // ✅ AFFILIATE PRODUCT: Admin gets commissionRate%, Affiliate gets (100 - commissionRate)%
        const commissionRate = parseFloat(purchase.commissionRate) || 0;
        
        // Admin gets commissionRate% of total
        const adminCommission = parseFloat((totalAmount * (commissionRate / 100)).toFixed(2));
        // Affiliate gets (100 - commissionRate)% of total
        const affiliateCommission = parseFloat((totalAmount * ((100 - commissionRate) / 100)).toFixed(2));

        // Create commission record for affiliate
        await Commission.create({
          affiliateId: purchase.affiliateId,
          adminId: purchase.product.addedBy,
          productId: purchase.productId,
          purchaseId: purchase.id,
          orderId: purchase.orderId,
          affiliateCommissionAmount: affiliateCommission,
          affiliateCommissionRate: 100 - commissionRate, // Affiliate gets remaining percentage
          adminCommissionAmount: adminCommission,
          adminCommissionRate: commissionRate, // Admin gets commission rate percentage
          totalAmount: totalAmount,
          status: 'approved',
          paymentDate: new Date(),
          notes: `Commission split: Admin gets ${commissionRate}% (₹${adminCommission}), Affiliate gets ${100 - commissionRate}% (₹${affiliateCommission})`
        }, { transaction });

        // Update affiliate's earnings (affiliate gets 100 - commissionRate%)
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

        // Update admin's earnings (admin gets commissionRate%)
        await User.increment('totalEarnings', {
          by: adminCommission,
          where: { id: purchase.product.addedBy },
          transaction
        });

        await User.increment('availableBalance', {
          by: adminCommission,
          where: { id: purchase.product.addedBy },
          transaction
        });

        console.log(`✅ Commission Distributed (Affiliate Product):
          - Admin (${purchase.product.addedBy}): ${commissionRate}% = ₹${adminCommission}
          - Affiliate (${purchase.affiliateId}): ${100 - commissionRate}% = ₹${affiliateCommission}
          - Total: ₹${totalAmount}
        `);
      } else if (purchase.product) {
        // ✅ ADMIN PRODUCT: Admin gets 100%
        const adminCommission = totalAmount;

        // Create commission record for admin
        await Commission.create({
          affiliateId: null,
          adminId: purchase.product.addedBy,
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
          notes: `Full commission to admin (product owner) - ₹${adminCommission} (100%)`
        }, { transaction });

        // Update admin's earnings
        await User.increment('totalEarnings', {
          by: adminCommission,
          where: { id: purchase.product.addedBy },
          transaction
        });

        await User.increment('availableBalance', {
          by: adminCommission,
          where: { id: purchase.product.addedBy },
          transaction
        });

        console.log(`✅ Commission Distributed (Admin Product):
          - Admin (${purchase.product.addedBy}): 100% = ₹${adminCommission}
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
          type: purchase.product?.addedByRole === 'affiliate' ? 'affiliate_product' : 'admin_product',
          adminRate: purchase.product?.addedByRole === 'affiliate' ? purchase.commissionRate : 100,
          affiliateRate: purchase.product?.addedByRole === 'affiliate' ? 100 - purchase.commissionRate : 0,
          adminAmount: purchase.adminCommissionAmount,
          affiliateAmount: purchase.commissionAmount
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
          as: 'product',
          attributes: ['id', 'name', 'mainImage', 'company']
        },
        {
          model: Purchase,
          as: 'purchase',
          attributes: ['orderId', 'buyerName', 'buyerEmail']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    // Summary statistics for affiliate
    const summary = {
      totalCommission: await Commission.sum('affiliateCommissionAmount', { 
        where: { affiliateId: req.user.id } 
      }) || 0,
      approved: await Commission.sum('affiliateCommissionAmount', { 
        where: { affiliateId: req.user.id, status: 'approved' } 
      }) || 0,
      paid: await Commission.sum('affiliateCommissionAmount', { 
        where: { affiliateId: req.user.id, status: 'paid' } 
      }) || 0,
      pending: await Commission.sum('affiliateCommissionAmount', { 
        where: { affiliateId: req.user.id, status: 'pending' } 
      }) || 0,
      totalOrders: count
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
// ============= AFFILIATE: Get Affiliate Purchases =============
const getAffiliatePurchases = async (req, res) => {
  try {
    const affiliateId = req.user.id;
    const { page = 1, limit = 20, paymentStatus, status, search } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = { affiliateId: affiliateId };
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
          as: 'product',
          attributes: ['id', 'name', 'mainImage', 'company', 'price']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'phone']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    // Summary for affiliate
    const summary = {
      total: await Purchase.count({ where: { affiliateId } }),
      totalRevenue: await Purchase.sum('totalAmount', { where: { affiliateId } }) || 0,
      totalCommission: await Purchase.sum('commissionAmount', { where: { affiliateId } }) || 0,
      pending: await Purchase.count({ where: { affiliateId, paymentStatus: 'pending' } }),
      verified: await Purchase.count({ where: { affiliateId, paymentStatus: 'verified' } }),
      completed: await Purchase.count({ where: { affiliateId, status: 'completed' } }),
      rejected: await Purchase.count({ where: { affiliateId, paymentStatus: 'rejected' } })
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
    console.error('Get Affiliate Purchases Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch affiliate purchases: ' + err.message
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
  getAffiliatePurchases
};