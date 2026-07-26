// controllers/commissionController.js
const Commission = require('../models/CommissionModel');
const User = require('../models/User');
const Product = require('../models/Product');
const Purchase = require('../models/Purchase');
const { sequelize } = require('../config/db');
const { Op } = require('sequelize');

// ============= ADMIN: Get All Commissions =============
const getAllCommissions = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status,
      affiliateId,
      adminId,
      productId,
      startDate,
      endDate,
      search
    } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status) whereClause.status = status;
    if (affiliateId) whereClause.affiliateId = affiliateId;
    if (adminId) whereClause.adminId = adminId;
    if (productId) whereClause.productId = productId;
    
    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    } else if (startDate) {
      whereClause.createdAt = {
        [Op.gte]: new Date(startDate)
      };
    } else if (endDate) {
      whereClause.createdAt = {
        [Op.lte]: new Date(endDate)
      };
    }

    if (search) {
      whereClause[Op.or] = [
        { '$Purchase.orderId$': { [Op.like]: `%${search}%` } },
        { '$Purchase.buyerName$': { [Op.like]: `%${search}%` } },
        { '$Product.name$': { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Commission.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'affiliate',
          attributes: ['id', 'name', 'email', 'affiliateId', 'phone']
        },
        {
          model: User,
          as: 'admin',
          attributes: ['id', 'name', 'email', 'phone']
        },
        {
          model: Product,
          attributes: ['id', 'name', 'mainImage', 'company', 'price']
        },
        {
          model: Purchase,
          attributes: ['id', 'orderId', 'buyerName', 'buyerEmail', 'buyerPhone', 'createdAt']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    // Summary statistics with enhanced fields
    const summary = {
      totalCommissions: await Commission.sum('totalAmount', { where: whereClause }) || 0,
      totalAffiliateCommission: await Commission.sum('affiliateCommissionAmount', { where: whereClause }) || 0,
      totalAdminCommission: await Commission.sum('adminCommissionAmount', { where: whereClause }) || 0,
      averageAffiliateRate: await Commission.findAll({
        where: whereClause,
        attributes: [
          [sequelize.fn('AVG', sequelize.col('affiliateCommissionRate')), 'avgRate']
        ],
        raw: true
      }).then(result => parseFloat(result[0]?.avgRate || 0).toFixed(2)),
      pendingCount: await Commission.count({ where: { ...whereClause, status: 'pending' } }),
      approvedCount: await Commission.count({ where: { ...whereClause, status: 'approved' } }),
      paidCount: await Commission.count({ where: { ...whereClause, status: 'paid' } }),
      rejectedCount: await Commission.count({ where: { ...whereClause, status: 'rejected' } }),
      totalCount: count
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
    console.error('Get All Commissions Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch commissions: ' + err.message
    });
  }
};

// ============= ADMIN: Update Commission Status =============
const updateCommissionStatus = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status || !['pending', 'approved', 'paid', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be: pending, approved, paid, or rejected'
      });
    }

    const commission = await Commission.findByPk(id);
    if (!commission) {
      return res.status(404).json({
        success: false,
        error: 'Commission not found'
      });
    }

    const updateData = { 
      status,
      notes: notes || commission.notes
    };

    // If marking as paid, set payment date
    if (status === 'paid') {
      updateData.paymentDate = new Date();
    }

    await commission.update(updateData, { transaction });

    // Update user balances based on status change
    if (status === 'paid' && commission.status !== 'paid') {
      // Add to affiliate's available balance
      if (commission.affiliateId && commission.affiliateCommissionAmount > 0) {
        await User.increment('availableBalance', {
          by: commission.affiliateCommissionAmount,
          where: { id: commission.affiliateId },
          transaction
        });
      }

      // Add to admin's available balance
      if (commission.adminId && commission.adminCommissionAmount > 0) {
        await User.increment('availableBalance', {
          by: commission.adminCommissionAmount,
          where: { id: commission.adminId },
          transaction
        });
      }
    }

    // If rejecting, deduct from pending balance
    if (status === 'rejected' && commission.status === 'pending') {
      // Remove from pending earnings (they were already added to totalEarnings on approval)
      // We handle this in the approve flow
    }

    await transaction.commit();

    res.json({
      success: true,
      data: commission,
      message: `Commission status updated to ${status}`
    });

  } catch (err) {
    await transaction.rollback();
    console.error('Update Commission Status Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update commission: ' + err.message
    });
  }
};

// ============= AFFILIATE: Get Commission Summary =============
const getCommissionSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = 'all' } = req.query;

    let dateFilter = {};
    const now = new Date();
    
    if (period === 'today') {
      const startOfDay = new Date(now.setHours(0, 0, 0, 0));
      dateFilter = {
        createdAt: {
          [Op.gte]: startOfDay
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

    const whereClause = { 
      affiliateId: userId,
      ...dateFilter
    };

    // Get all commissions for this affiliate
    const commissions = await Commission.findAll({
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
          attributes: ['orderId', 'buyerName', 'buyerEmail', 'createdAt']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Enhanced summary
    const summary = {
      // Totals
      totalEarnings: await Commission.sum('affiliateCommissionAmount', { where: whereClause }) || 0,
      totalOrders: await Commission.count({ where: whereClause }),
      
      // Status breakdown
      pending: await Commission.sum('affiliateCommissionAmount', { 
        where: { ...whereClause, status: 'pending' } 
      }) || 0,
      approved: await Commission.sum('affiliateCommissionAmount', { 
        where: { ...whereClause, status: 'approved' } 
      }) || 0,
      paid: await Commission.sum('affiliateCommissionAmount', { 
        where: { ...whereClause, status: 'paid' } 
      }) || 0,
      rejected: await Commission.sum('affiliateCommissionAmount', { 
        where: { ...whereClause, status: 'rejected' } 
      }) || 0,
      
      // Status counts
      pendingCount: await Commission.count({ where: { ...whereClause, status: 'pending' } }),
      approvedCount: await Commission.count({ where: { ...whereClause, status: 'approved' } }),
      paidCount: await Commission.count({ where: { ...whereClause, status: 'paid' } }),
      rejectedCount: await Commission.count({ where: { ...whereClause, status: 'rejected' } }),
      
      // Average commission rate
      averageCommissionRate: await Commission.findAll({
        where: whereClause,
        attributes: [
          [sequelize.fn('AVG', sequelize.col('affiliateCommissionRate')), 'avgRate']
        ],
        raw: true
      }).then(result => parseFloat(result[0]?.avgRate || 0).toFixed(2))
    };

    // Get top products for this affiliate
    const topProducts = await Commission.findAll({
      where: whereClause,
      attributes: [
        'productId',
        [sequelize.fn('SUM', sequelize.col('affiliateCommissionAmount')), 'totalAmount'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      include: [
        {
          model: Product,
          attributes: ['id', 'name', 'mainImage', 'company']
        }
      ],
      group: ['productId', 'Product.id'],
      order: [[sequelize.literal('totalAmount'), 'DESC']],
      limit: 5
    });

    // Monthly earning trend (last 6 months)
    const monthlyTrend = await Commission.findAll({
      where: whereClause,
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m'), 'month'],
        [sequelize.fn('SUM', sequelize.col('affiliateCommissionAmount')), 'total']
      ],
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m')],
      order: [[sequelize.literal('month'), 'DESC']],
      limit: 6
    });

    res.json({
      success: true,
      data: {
        commissions: commissions.slice(0, 10), // Recent 10
        summary,
        topProducts,
        monthlyTrend,
        totalRecords: commissions.length,
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

// ============= ADMIN: Get Detailed Commission Summary =============
const getAdminCommissionSummary = async (req, res) => {
  try {
    const { period = 'all' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    if (period === 'today') {
      const startOfDay = new Date(now.setHours(0, 0, 0, 0));
      dateFilter = {
        createdAt: {
          [Op.gte]: startOfDay
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

    // Overall summary
    const summary = {
      totalCommissions: await Commission.sum('totalAmount', { where: dateFilter }) || 0,
      totalAffiliateCommission: await Commission.sum('affiliateCommissionAmount', { where: dateFilter }) || 0,
      totalAdminCommission: await Commission.sum('adminCommissionAmount', { where: dateFilter }) || 0,
      
      statusBreakdown: {
        pending: await Commission.count({ where: { ...dateFilter, status: 'pending' } }),
        approved: await Commission.count({ where: { ...dateFilter, status: 'approved' } }),
        paid: await Commission.count({ where: { ...dateFilter, status: 'paid' } }),
        rejected: await Commission.count({ where: { ...dateFilter, status: 'rejected' } })
      },
      
      // Average commission rate
      averageCommissionRate: await Commission.findAll({
        where: dateFilter,
        attributes: [
          [sequelize.fn('AVG', sequelize.col('affiliateCommissionRate')), 'avgRate']
        ],
        raw: true
      }).then(result => parseFloat(result[0]?.avgRate || 0).toFixed(2))
    };

    // Top affiliates
    const topAffiliates = await Commission.findAll({
      where: dateFilter,
      attributes: [
        'affiliateId',
        [sequelize.fn('SUM', sequelize.col('affiliateCommissionAmount')), 'totalCommission'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'orderCount']
      ],
      group: ['affiliateId'],
      order: [[sequelize.literal('totalCommission'), 'DESC']],
      limit: 10,
      include: [
        {
          model: User,
          as: 'affiliate',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    // Top admins (product owners)
    const topAdmins = await Commission.findAll({
      where: dateFilter,
      attributes: [
        'adminId',
        [sequelize.fn('SUM', sequelize.col('adminCommissionAmount')), 'totalCommission'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'orderCount']
      ],
      group: ['adminId'],
      order: [[sequelize.literal('totalCommission'), 'DESC']],
      limit: 10,
      include: [
        {
          model: User,
          as: 'admin',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    // Monthly trends
    const monthlyTrends = await Commission.findAll({
      where: dateFilter,
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m'), 'month'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalRevenue'],
        [sequelize.fn('SUM', sequelize.col('affiliateCommissionAmount')), 'affiliateCommission'],
        [sequelize.fn('SUM', sequelize.col('adminCommissionAmount')), 'adminCommission']
      ],
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m')],
      order: [[sequelize.literal('month'), 'DESC']],
      limit: 12
    });

    res.json({
      success: true,
      data: {
        summary,
        topAffiliates,
        topAdmins,
        monthlyTrends,
        period
      }
    });

  } catch (err) {
    console.error('Get Admin Commission Summary Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch admin commission summary: ' + err.message
    });
  }
};

// ============= GET Commission Statistics =============
const getCommissionStatistics = async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    if (period === 'month') {
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      dateFilter = {
        createdAt: {
          [Op.gte]: monthAgo
        }
      };
    } else if (period === 'quarter') {
      const quarterAgo = new Date(now);
      quarterAgo.setMonth(quarterAgo.getMonth() - 3);
      dateFilter = {
        createdAt: {
          [Op.gte]: quarterAgo
        }
      };
    } else if (period === 'year') {
      const yearAgo = new Date(now);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      dateFilter = {
        createdAt: {
          [Op.gte]: yearAgo
        }
      };
    }

    // Get statistics for charts
    const stats = {
      // Status distribution
      statusDistribution: await Commission.findAll({
        where: dateFilter,
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalAmount']
        ],
        group: ['status'],
        raw: true
      }),
      
      // Commission rate distribution
      rateDistribution: await Commission.findAll({
        where: dateFilter,
        attributes: [
          [sequelize.fn('FLOOR', sequelize.col('affiliateCommissionRate')), 'rateRange'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: [sequelize.fn('FLOOR', sequelize.col('affiliateCommissionRate'))],
        order: [[sequelize.literal('rateRange'), 'ASC']],
        raw: true
      }),
      
      // Daily earnings (last 30 days)
      dailyEarnings: await Commission.findAll({
        where: dateFilter,
        attributes: [
          [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
          [sequelize.fn('SUM', sequelize.col('affiliateCommissionAmount')), 'affiliateCommission'],
          [sequelize.fn('SUM', sequelize.col('adminCommissionAmount')), 'adminCommission']
        ],
        group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
        order: [[sequelize.literal('date'), 'DESC']],
        limit: 30,
        raw: true
      })
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (err) {
    console.error('Get Commission Statistics Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch commission statistics: ' + err.message
    });
  }
};

// ============= EXPORT Commission Report =============
const exportCommissionReport = async (req, res) => {
  try {
    const { startDate, endDate, format = 'json' } = req.query;
    
    const whereClause = {};
    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const commissions = await Commission.findAll({
      where: whereClause,
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
          attributes: ['orderId', 'buyerName', 'buyerEmail']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Format data for export
    const exportData = commissions.map(c => ({
      'Order ID': c.orderId,
      'Product': c.Product?.name || 'N/A',
      'Affiliate': c.affiliate?.name || 'N/A',
      'Affiliate Commission': parseFloat(c.affiliateCommissionAmount).toFixed(2),
      'Affiliate Rate': `${parseFloat(c.affiliateCommissionRate).toFixed(2)}%`,
      'Admin': c.admin?.name || 'N/A',
      'Admin Commission': parseFloat(c.adminCommissionAmount).toFixed(2),
      'Admin Rate': `${parseFloat(c.adminCommissionRate).toFixed(2)}%`,
      'Total Amount': parseFloat(c.totalAmount).toFixed(2),
      'Status': c.status,
      'Date': new Date(c.createdAt).toLocaleDateString(),
      'Notes': c.notes || ''
    }));

    res.json({
      success: true,
      data: {
        commissions: exportData,
        total: exportData.length,
        summary: {
          totalAmount: commissions.reduce((sum, c) => sum + parseFloat(c.totalAmount), 0),
          totalAffiliateCommission: commissions.reduce((sum, c) => sum + parseFloat(c.affiliateCommissionAmount), 0),
          totalAdminCommission: commissions.reduce((sum, c) => sum + parseFloat(c.adminCommissionAmount), 0)
        },
        exportedAt: new Date(),
        format
      }
    });

  } catch (err) {
    console.error('Export Commission Report Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to export commission report: ' + err.message
    });
  }
};

module.exports = {
  getAllCommissions,
  updateCommissionStatus,
  getCommissionSummary,
  getAdminCommissionSummary,
  getCommissionStatistics,
  exportCommissionReport
};