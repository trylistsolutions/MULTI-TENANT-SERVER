// routes/subscriptionRoutes.js
const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const Alumni = require('../models/Alumni')

const JWT_SECRET = process.env.ZOEZI_JWT_SECRET || 'zoezi_secret'

// Authentication middleware
function verifyToken(req, res, next) {
  const auth = req.headers.authorization || req.headers.Authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Missing token' })
  }
  const token = auth.split(' ')[1]
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = payload.id
    req.userType = payload.type
    next()
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid token' })
  }
}

// Helper function to get user model based on type
const getUserModel = (userType) => {
  return userType === 'alumni' ? Alumni : User
}

// Calculate expiry date based on years purchased
const calculateExpiryDate = (years) => {
  const expiryDate = new Date()
  expiryDate.setFullYear(expiryDate.getFullYear() + years)
  return expiryDate
}

// Calculate amount with discounts for multiple years
const calculateAmount = (years) => {
  const basePrice = 1000 // Ksh 1000 per year
  
  // Discount tiers
  if (years >= 10) {
    return 7000 // 30% discount
  } else if (years >= 5) {
    return 4000 // 20% discount
  } else if (years >= 3) {
    return 2700 // 10% discount
  } else if (years >= 2) {
    return 1900 // 5% discount
  } else {
    return basePrice * years
  }
}

// GET /subscription/:userId - Get user subscription status
router.get('/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params
    const { userType } = req.query
    
    if (!userType) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'userType query parameter is required' 
      })
    }
    
    // Check if user is accessing their own data
    if (req.userId !== userId && req.userType !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    const Model = getUserModel(userType)
    const user = await Model.findById(userId)
      .select('subscription subscriptionPayments firstName lastName email phone profilePicture')
    
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' })
    }
    
    // Calculate days remaining if subscription is active
    let daysRemaining = 0
    let isExpired = false
    
    if (user.subscription?.active && user.subscription.expiryDate) {
      const expiryDate = new Date(user.subscription.expiryDate)
      const today = new Date()
      const diffTime = expiryDate - today
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      isExpired = daysRemaining <= 0
      
      // Auto-expire if subscription has passed
      if (isExpired) {
        user.subscription.active = false
        await user.save()
      }
    }
    
    // Get year options with calculated prices
    const yearOptions = [
      { years: 1, amount: calculateAmount(1), label: '1 Year', description: 'Basic subscription' },
      { years: 2, amount: calculateAmount(2), label: '2 Years', description: 'Save Ksh 100', discount: '5% OFF' },
      { years: 3, amount: calculateAmount(3), label: '3 Years', description: 'Save Ksh 300', discount: '10% OFF' },
      { years: 5, amount: calculateAmount(5), label: '5 Years', description: 'Save Ksh 1000', discount: '20% OFF' },
      { years: 10, amount: calculateAmount(10), label: '10 Years', description: 'Save Ksh 3000', discount: '30% OFF' }
    ]
    
    return res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          phone: user.phone,
          profilePicture: user.profilePicture
        },
        subscription: {
          ...user.subscription.toObject(),
          daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
          isExpired: isExpired || !user.subscription?.active
        },
        history: user.subscriptionPayments || [],
        yearOptions,
        benefits: [
          'Public profile on NZI Alumni Portal',
          'Instant verification by employers',
          'Personal portfolio landing page',
          'Search engine optimization (Google/Bing)',
          'Digital marketing promotion',
          'Career opportunity notifications'
        ]
      }
    })
    
  } catch (err) {
    console.error('Get subscription error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to fetch subscription data' })
  }
})

// POST /subscription/purchase - Purchase a subscription
router.post('/purchase', verifyToken, async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  
  try {
    const { userId, userType, years, amount, paymentData } = req.body
    
    if (!userId || !userType || !years || !amount || !paymentData) {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({ 
        status: 'error', 
        message: 'Missing required fields' 
      })
    }
    
    // Verify user is purchasing for themselves
    if (req.userId !== userId && req.userType !== 'admin') {
      await session.abortTransaction()
      session.endSession()
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    const Model = getUserModel(userType)
    const user = await Model.findById(userId).session(session)
    
    if (!user) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ status: 'error', message: 'User not found' })
    }
    
    // Calculate expected amount to prevent tampering
    // const expectedAmount = calculateAmount(years)
    // if (amount !== expectedAmount) {
    //   await session.abortTransaction()
    //   session.endSession()
    //   return res.status(400).json({ 
    //     status: 'error', 
    //     message: 'Invalid amount for selected years' 
    //   })
    // }
    
    // Calculate expiry date
    const paymentDate = new Date(paymentData.timeOfPayment || Date.now())
    const expiryDate = calculateExpiryDate(years)
    
    // Check if user has existing subscription
    let newExpiryDate = expiryDate
    if (user.subscription?.active && user.subscription.expiryDate) {
      const currentExpiry = new Date(user.subscription.expiryDate)
      if (currentExpiry > paymentDate) {
        // Extend from current expiry date
        newExpiryDate = new Date(currentExpiry)
        newExpiryDate.setFullYear(newExpiryDate.getFullYear() + years)
      }
    }
    
    // Create payment record
    const paymentRecord = {
      years,
      amount,
      paymentDate,
      expiryDate: newExpiryDate,
      paymentMethod: 'mpesa',
      transactionId: paymentData.transactionId,
      phone: paymentData.phone,
      status: 'paid'
    }
    
    // Add to payment history
    user.subscriptionPayments = user.subscriptionPayments || []
    user.subscriptionPayments.push(paymentRecord)
    
    // Update subscription status
    user.subscription = user.subscription || {}
    user.subscription.active = true
    user.subscription.expiryDate = newExpiryDate
    user.subscription.yearsSubscribed = years
    user.subscription.lastPaymentDate = paymentDate
    user.subscription.autoRenew = false // Default to manual renewal
    
    await user.save({ session })
    
    await session.commitTransaction()
    session.endSession()
    
    // Update Mpesa transaction purpose
    try {
      if (paymentData.transactionId) {
        const MpesaTransaction = require('../models/Mpesa')
        await MpesaTransaction.findOneAndUpdate(
          { transactionId: String(paymentData.transactionId) },
          {
            purpose: 'subscription_payment',
            purposeMeta: { 
              userId: String(userId), 
              userType: userType,
              years: years,
              amount: amount
            },
            used: true
          },
          { new: true }
        )
      }
    } catch (txErr) {
      console.warn('Could not mark Mpesa transaction purpose:', txErr)
      // Don't fail the request if this fails
    }
    
    return res.status(200).json({
      status: 'success',
      data: {
        message: `Successfully subscribed for ${years} year${years > 1 ? 's' : ''}`,
        subscription: user.subscription,
        payment: paymentRecord,
        expiryDate: newExpiryDate
      }
    })
    
  } catch (err) {
    await session.abortTransaction()
    session.endSession()
    console.error('Purchase subscription error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to process subscription' })
  }
})

// POST /subscription/cancel - Cancel auto-renewal
router.post('/cancel', verifyToken, async (req, res) => {
  try {
    const { userId, userType } = req.body
    
    if (!userId || !userType) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Missing required fields' 
      })
    }
    
    // Verify user is cancelling their own subscription
    if (req.userId !== userId && req.userType !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Forbidden' })
    }
    
    const Model = getUserModel(userType)
    const user = await Model.findById(userId)
    
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' })
    }
    
    if (!user.subscription) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'No active subscription found' 
      })
    }
    
    // Only cancel auto-renewal, not the subscription itself
    user.subscription.autoRenew = false
    await user.save()
    
    return res.status(200).json({
      status: 'success',
      message: 'Auto-renewal cancelled successfully',
      data: {
        subscription: user.subscription
      }
    })
    
  } catch (err) {
    console.error('Cancel subscription error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to cancel subscription' })
  }
})

// GET /subscription/check-expiry - Check and update expired subscriptions (cron job endpoint)
router.get('/check-expiry', async (req, res) => {
  try {
    // This endpoint would be called by a cron job to check for expired subscriptions
    const today = new Date()
    
    // Check expired alumni subscriptions
    const expiredAlumni = await Alumni.updateMany(
      {
        'subscription.active': true,
        'subscription.expiryDate': { $lt: today }
      },
      {
        $set: { 'subscription.active': false }
      }
    )
    
    // Check expired student subscriptions
    const expiredStudents = await User.updateMany(
      {
        'subscription.active': true,
        'subscription.expiryDate': { $lt: today }
      },
      {
        $set: { 'subscription.active': false }
      }
    )
    
    return res.status(200).json({
      status: 'success',
      message: 'Subscription expiry check completed',
      data: {
        expiredAlumni: expiredAlumni.modifiedCount,
        expiredStudents: expiredStudents.modifiedCount
      }
    })
    
  } catch (err) {
    console.error('Check expiry error:', err)
    return res.status(500).json({ status: 'error', message: 'Failed to check subscription expiry' })
  }
})

module.exports = router