// routes/dashboard.js
const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const Order = require('../model/order');
const User = require('../model/user');
const Product = require('../model/product');
const Category = require('../model/category'); // If you have categories model

// Get comprehensive dashboard statistics
router.get('/stats/overview', asyncHandler(async (req, res) => {
  try {
    // Current date calculations
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(now.setDate(now.getDate() - 7));
    const startOfMonth = new Date(now.setMonth(now.getMonth() - 1));

    // User Statistics
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ isEmailVerified: true });
    const newUsersToday = await User.countDocuments({ 
      createdAt: { $gte: startOfToday } 
    });
    const newUsersThisWeek = await User.countDocuments({ 
      createdAt: { $gte: startOfWeek } 
    });
    const newUsersThisMonth = await User.countDocuments({ 
      createdAt: { $gte: startOfMonth } 
    });

    // Order Statistics
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ orderStatus: 'pending' });
    const confirmedOrders = await Order.countDocuments({ orderStatus: 'confirmed' });
    const processingOrders = await Order.countDocuments({ orderStatus: 'processing' });
    const shippedOrders = await Order.countDocuments({ orderStatus: 'shipped' });
    const deliveredOrders = await Order.countDocuments({ orderStatus: 'delivered' });
    const cancelledOrders = await Order.countDocuments({ orderStatus: 'cancelled' });

    // Today's orders
    const ordersToday = await Order.countDocuments({ 
      orderDate: { $gte: startOfToday } 
    });

    // Revenue Statistics
    const revenueStats = await Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { 
        $group: { 
          _id: null, 
          totalRevenue: { $sum: '$subtotal' },
          totalShipping: { $sum: '$shipping' },
          totalOrders: { $sum: 1 }
        } 
      }
    ]);

    const todayRevenue = await Order.aggregate([
      { 
        $match: { 
          paymentStatus: 'paid',
          orderDate: { $gte: startOfToday }
        } 
      },
      { 
        $group: { 
          _id: null, 
          revenue: { $sum: '$subtotal' },
          orders: { $sum: 1 }
        } 
      }
    ]);

    // Payment Method Statistics
    const mpesaOrders = await Order.countDocuments({ paymentMethod: 'mpesa' });
    const codOrders = await Order.countDocuments({ paymentMethod: 'cod' });
    const paidOrders = await Order.countDocuments({ paymentStatus: 'paid' });
    const pendingPaymentOrders = await Order.countDocuments({ paymentStatus: 'pending' });

    // Product Statistics
    const totalProducts = await Product.countDocuments();
    const lowStockProducts = await Product.countDocuments({ quantity: { $lte: 10 } });
    const outOfStockProducts = await Product.countDocuments({ quantity: { $lte: 0 } });

    // Top selling products (last 30 days)
    const topSellingProducts = await Order.aggregate([
      { 
        $match: { 
          orderDate: { $gte: startOfMonth } 
        } 
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          productName: { $first: '$items.name' },
          totalSold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.offerPrice'] } }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 5 }
    ]);

    // Recent activity (last 5 orders)
    const recentOrders = await Order.find()
      .populate('user', 'username email')
      .sort({ orderDate: -1 })
      .limit(5)
      .select('orderNumber orderStatus total orderDate user');

    // User growth data (last 7 days)
    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfWeek }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    const revenueData = revenueStats.length > 0 ? revenueStats[0] : { 
      totalRevenue: 0, 
      totalShipping: 0, 
      totalOrders: 0 
    };
    
    const todayRevenueData = todayRevenue.length > 0 ? todayRevenue[0] : { 
      revenue: 0, 
      orders: 0 
    };

    res.json({
      success: true,
      data: {
        // User Stats
        users: {
          total: totalUsers,
          verified: verifiedUsers,
          newToday: newUsersToday,
          newThisWeek: newUsersThisWeek,
          newThisMonth: newUsersThisMonth,
          growth: userGrowth
        },
        
        // Order Stats
        orders: {
          total: totalOrders,
          today: ordersToday,
          pending: pendingOrders,
          confirmed: confirmedOrders,
          processing: processingOrders,
          shipped: shippedOrders,
          delivered: deliveredOrders,
          cancelled: cancelledOrders,
          statusBreakdown: {
            pending: pendingOrders,
            confirmed: confirmedOrders,
            processing: processingOrders,
            shipped: shippedOrders,
            delivered: deliveredOrders,
            cancelled: cancelledOrders
          }
        },
        
        // Revenue Stats
        revenue: {
          total: revenueData.totalRevenue,
          today: todayRevenueData.revenue,
          shipping: revenueData.totalShipping,
          averageOrderValue: revenueData.totalOrders > 0 ? 
            revenueData.totalRevenue / revenueData.totalOrders : 0
        },
        
        // Payment Stats
        payments: {
          mpesa: mpesaOrders,
          cod: codOrders,
          paid: paidOrders,
          pending: pendingPaymentOrders
        },
        
        // Product Stats
        products: {
          total: totalProducts,
          lowStock: lowStockProducts,
          outOfStock: outOfStockProducts,
          topSelling: topSellingProducts
        },
        
        // Recent Activity
        recentActivity: {
          orders: recentOrders,
          // You can add other recent activities here
        },
        
        // Timestamps
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}));

module.exports = router;