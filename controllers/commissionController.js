// controllers/commissionController.js
const Commission = require('../models/CommissionModel');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const User = require('../models/User');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');

// ============= ADMIN: Get All Commissions =============
const getAllCommissions = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status,
      affiliateId,
      adminId,
      startDate,
      endDate
    } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status) whereClause.status = status;
    if (affiliateId) whereClause.affiliateId = affiliateId;
    if (adminId) whereClause.adminId = adminId;
    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const { count, rows } = await Commission.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'commissionAffiliate',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'commissionAdmin', 
          attributes: ['id', 'name', 'email']
        },
        {
          model: Product,
          as: 'commissionProduct',
          attributes: ['id', 'name', 'mainImage']
        },
        {
          model: Purchase,
          as: 'commissionPurchase',
          attributes: ['orderId', 'buyerName', 'buyerEmail']
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
        commissions: rows,
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

    if (!['pending', 'approved', 'paid', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }

    const commission = await Commission.findByPk(id);

    if (!commission) {
      return res.status(404).json({
        success: false,
        error: 'Commission not found'
      });
    }

    await commission.update({
      status,
      notes: notes || commission.notes,
      paymentDate: status === 'paid' ? new Date() : commission.paymentDate
    }, { transaction });

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
      error: 'Failed to update commission status: ' + err.message
    });
  }
};

// ============= ADMIN: Get Commission Summary =============
const getAdminCommissionSummary = async (req, res) => {
  try {
    const { period = 'all' } = req.query;
    
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

    const commissions = await Commission.findAll({
      where: dateFilter,
      include: [
        {
          model: User,
          as: 'commissionAffiliate',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'commissionAdmin',
          attributes: ['id', 'name', 'email']
        },
        {
          model: Product,
          as: 'commissionProduct',
          attributes: ['id', 'name']
        },
        {
          model: Purchase,
          as: 'commissionPurchase', 
          attributes: ['orderId', 'buyerName', 'buyerEmail']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const summary = {
      totalCommissions: await Commission.sum('totalAmount', { where: dateFilter }) || 0,
      totalAffiliateCommission: await Commission.sum('affiliateCommissionAmount', { where: dateFilter }) || 0,
      totalAdminCommission: await Commission.sum('adminCommissionAmount', { where: dateFilter }) || 0,
      totalCommissionsCount: commissions.length,
      pending: await Commission.count({ where: { ...dateFilter, status: 'pending' } }),
      approved: await Commission.count({ where: { ...dateFilter, status: 'approved' } }),
      paid: await Commission.count({ where: { ...dateFilter, status: 'paid' } }),
      rejected: await Commission.count({ where: { ...dateFilter, status: 'rejected' } })
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
    console.error('Get Admin Commission Summary Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch commission summary: ' + err.message
    });
  }
};

// ============= AFFILIATE: Get Commission Summary =============
const getCommissionSummary = async (req, res) => {
  try {
    const affiliateId = req.user.id;

    const commissions = await Commission.findAll({
      where: { affiliateId },
      include: [
        {
          model: Product,
          attributes: ['id', 'name', 'mainImage']
        },
        {
          model: Purchase,
          attributes: ['orderId', 'buyerName', 'buyerEmail', 'createdAt']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const summary = {
      totalEarnings: await Commission.sum('affiliateCommissionAmount', { where: { affiliateId } }) || 0,
      approved: await Commission.sum('affiliateCommissionAmount', { where: { affiliateId, status: 'approved' } }) || 0,
      paid: await Commission.sum('affiliateCommissionAmount', { where: { affiliateId, status: 'paid' } }) || 0,
      pending: await Commission.sum('affiliateCommissionAmount', { where: { affiliateId, status: 'pending' } }) || 0,
      totalOrders: commissions.length
    };

    res.json({
      success: true,
      data: {
        commissions,
        summary
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

// ============= ADMIN: Get Commission Statistics for Charts =============
const getCommissionStatistics = async (req, res) => {
  try {
    const { months = 6 } = req.query;

    // Get monthly data
    const monthlyData = [];
    const now = new Date();
    
    for (let i = 0; i < months; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      const monthCommissions = await Commission.findAll({
        where: {
          createdAt: {
            [Op.between]: [monthStart, monthEnd]
          },
          status: 'approved'
        }
      });

      monthlyData.push({
        month: monthStart.toLocaleString('default', { month: 'short', year: 'numeric' }),
        affiliateCommission: monthCommissions.reduce((sum, c) => sum + parseFloat(c.affiliateCommissionAmount), 0),
        adminCommission: monthCommissions.reduce((sum, c) => sum + parseFloat(c.adminCommissionAmount), 0),
        total: monthCommissions.reduce((sum, c) => sum + parseFloat(c.totalAmount), 0),
        count: monthCommissions.length
      });
    }

    // Get top affiliates by commission
    const topAffiliates = await Commission.findAll({
      attributes: [
        'affiliateId',
        [sequelize.fn('SUM', sequelize.col('affiliateCommissionAmount')), 'totalCommission']
      ],
      where: { status: 'approved' },
      include: [
        {
          model: User,
          as: 'affiliate',
          attributes: ['id', 'name', 'email']
        }
      ],
      group: ['affiliateId', 'affiliate.id'],
      order: [[sequelize.literal('totalCommission'), 'DESC']],
      limit: 10
    });

    // Get top admin earners
    const topAdmins = await Commission.findAll({
      attributes: [
        'adminId',
        [sequelize.fn('SUM', sequelize.col('adminCommissionAmount')), 'totalCommission']
      ],
      where: { status: 'approved' },
      include: [
        {
          model: User,
          as: 'admin',
          attributes: ['id', 'name', 'email']
        }
      ],
      group: ['adminId', 'admin.id'],
      order: [[sequelize.literal('totalCommission'), 'DESC']],
      limit: 10
    });

    res.json({
      success: true,
      data: {
        monthlyData: monthlyData.reverse(),
        topAffiliates,
        topAdmins
      }
    });

  } catch (err) {
    console.error('Get Commission Statistics Error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch commission statistics: ' + err.message
    });
  }
};

// ============= ADMIN: Export Commission Report =============
const exportCommissionReport = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;

    const whereClause = {};
    if (status) whereClause.status = status;
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

    // Create CSV data
    const csvData = commissions.map(c => ({
      'Order ID': c.orderId,
      'Product': c.Product?.name || 'N/A',
      'Affiliate': c.affiliate?.name || 'N/A',
      'Admin': c.admin?.name || 'N/A',
      'Total Amount': c.totalAmount,
      'Affiliate Commission': c.affiliateCommissionAmount,
      'Admin Commission': c.adminCommissionAmount,
      'Commission Rate': `${c.affiliateCommissionRate}% / ${c.adminCommissionRate}%`,
      'Status': c.status,
      'Date': c.createdAt.toISOString().split('T')[0]
    }));

    res.json({
      success: true,
      data: {
        commissions: csvData,
        total: csvData.length,
        summary: {
          totalAmount: commissions.reduce((sum, c) => sum + parseFloat(c.totalAmount), 0),
          totalAffiliateCommission: commissions.reduce((sum, c) => sum + parseFloat(c.affiliateCommissionAmount), 0),
          totalAdminCommission: commissions.reduce((sum, c) => sum + parseFloat(c.adminCommissionAmount), 0)
        }
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
  getAdminCommissionSummary,
  getCommissionSummary,
  getCommissionStatistics,
  exportCommissionReport
};