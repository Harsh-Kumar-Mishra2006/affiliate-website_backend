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
      search
    } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status) whereClause.status = status;
    if (affiliateId) whereClause.userId = affiliateId;
    if (search) {
      whereClause[Op.or] = [
        { orderId: { [Op.like]: `%${search}%` } },
        { '$product.name$': { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Commission.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'affiliate',
          attributes: ['id', 'name', 'email', 'affiliateId']
        },
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

    // Summary statistics
    const summary = {
      total: await Commission.sum('amount'),
      pending: await Commission.sum('amount', { where: { status: 'pending' } }),
      approved: await Commission.sum('amount', { where: { status: 'approved' } }),
      paid: await Commission.sum('amount', { where: { status: 'paid' } }),
      cancelled: await Commission.sum('amount', { where: { status: 'cancelled' } }),
      count: await Commission.count()
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

    if (!status || !['approved', 'paid', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be "approved", "paid", or "cancelled"'
      });
    }

    const commission = await Commission.findByPk(id);
    if (!commission) {
      return res.status(404).json({
        success: false,
        error: 'Commission not found'
      });
    }

    const updateData = { status };
    if (status === 'paid') {
      updateData.paidDate = new Date();
    }
    if (notes) {
      updateData.notes = notes;
    }

    await commission.update(updateData, { transaction });

    // If commission is cancelled, update affiliate balance
    if (status === 'cancelled' && commission.status !== 'cancelled') {
      await User.decrement('availableBalance', {
        by: commission.amount,
        where: { id: commission.userId },
        transaction
      });
    }

    // If commission is approved, ensure affiliate balance is updated
    if (status === 'approved' && commission.status === 'pending') {
      await User.increment('availableBalance', {
        by: commission.amount,
        where: { id: commission.userId },
        transaction
      });
    }

    await transaction.commit();

    res.json({
      success: true,
      data: commission,
      message: `Commission ${status} successfully`
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

    const summary = {
      totalEarnings: await Commission.sum('amount', { where: { userId } }),
      pending: await Commission.sum('amount', { where: { userId, status: 'pending' } }),
      approved: await Commission.sum('amount', { where: { userId, status: 'approved' } }),
      paid: await Commission.sum('amount', { where: { userId, status: 'paid' } }),
      cancelled: await Commission.sum('amount', { where: { userId, status: 'cancelled' } }),
      totalCommissionCount: await Commission.count({ where: { userId } }),
      pendingCount: await Commission.count({ where: { userId, status: 'pending' } }),
      approvedCount: await Commission.count({ where: { userId, status: 'approved' } }),
      paidCount: await Commission.count({ where: { userId, status: 'paid' } })
    };

    // Get top products for this affiliate
    const topProducts = await Commission.findAll({
      where: { userId },
      attributes: [
        'productId',
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
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
      where: { userId },
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m'), 'month'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'total']
      ],
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m')],
      order: [[sequelize.literal('month'), 'DESC']],
      limit: 6
    });

    res.json({
      success: true,
      data: {
        summary,
        topProducts,
        monthlyTrend
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

module.exports = {
  getAllCommissions,
  updateCommissionStatus,
  getCommissionSummary
};