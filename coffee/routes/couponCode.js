const express = require('express');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const router = express.Router();
const Coupon = require('../model/couponCode'); 
const Product = require('../model/product');

// Helper function to handle empty ObjectId fields
const sanitizeObjectIdFields = (data) => {
  const sanitized = { ...data };
  
  // Convert empty strings to null for ObjectId fields
  if (sanitized.applicableCategory === '') {
    sanitized.applicableCategory = null;
  }
  if (sanitized.applicableProduct === '') {
    sanitized.applicableProduct = null;
  }
  
  return sanitized;
};

// Get all coupons
router.get('/', asyncHandler(async (req, res) => {
    try {
        const coupons = await Coupon.find()
            .populate('applicableCategory', 'name')
            .populate('applicableProduct', 'name');
        res.json({ success: true, message: "Coupons retrieved successfully.", data: coupons });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Get a coupon by ID
router.get('/:id', asyncHandler(async (req, res) => {
    try {
        const couponID = req.params.id;
        
        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(couponID)) {
            return res.status(400).json({ success: false, message: "Invalid coupon ID format." });
        }

        const coupon = await Coupon.findById(couponID)
            .populate('applicableCategory', 'name')
            .populate('applicableProduct', 'name');
            
        if (!coupon) {
            return res.status(404).json({ success: false, message: "Coupon not found." });
        }
        res.json({ success: true, message: "Coupon retrieved successfully.", data: coupon });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Create a new coupon
router.post('/', asyncHandler(async (req, res) => {
    const { couponCode, discountType, discountAmount, minimumPurchaseAmount, endDate, status, applicableCategory, applicableProduct } = req.body;
    
    if (!couponCode || !discountType || !discountAmount || !endDate || !status) {
        return res.status(400).json({ success: false, message: "Code, discountType, discountAmount, endDate, and status are required." });
    }

    try {
        // Sanitize the data
        const sanitizedData = sanitizeObjectIdFields({
            couponCode,
            discountType,
            discountAmount,
            minimumPurchaseAmount: minimumPurchaseAmount || 0,
            endDate,
            status,
            applicableCategory,
            applicableProduct
        });

        // Validate ObjectId fields if they are provided
        if (sanitizedData.applicableCategory && !mongoose.Types.ObjectId.isValid(sanitizedData.applicableCategory)) {
            return res.status(400).json({ success: false, message: "Invalid category ID format." });
        }
        if (sanitizedData.applicableProduct && !mongoose.Types.ObjectId.isValid(sanitizedData.applicableProduct)) {
            return res.status(400).json({ success: false, message: "Invalid product ID format." });
        }

        const coupon = new Coupon(sanitizedData);
        const newCoupon = await coupon.save();
        
        // Populate the saved coupon for response
        const populatedCoupon = await Coupon.findById(newCoupon._id)
            .populate('applicableCategory', 'name')
            .populate('applicableProduct', 'name');

        res.json({ 
            success: true, 
            message: "Coupon created successfully.", 
            data: populatedCoupon 
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Coupon code already exists." });
        }
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Update a coupon
router.put('/:id', asyncHandler(async (req, res) => {
    try {
        const couponID = req.params.id;
        
        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(couponID)) {
            return res.status(400).json({ success: false, message: "Invalid coupon ID format." });
        }

        const { couponCode, discountType, discountAmount, minimumPurchaseAmount, endDate, status, applicableCategory, applicableProduct } = req.body;
        
        if (!couponCode || !discountType || !discountAmount || !endDate || !status) {
            return res.status(400).json({ success: false, message: "CouponCode, discountType, discountAmount, endDate, and status are required." });
        }

        // Sanitize the data
        const sanitizedData = sanitizeObjectIdFields({
            couponCode,
            discountType,
            discountAmount,
            minimumPurchaseAmount: minimumPurchaseAmount || 0,
            endDate,
            status,
            applicableCategory,
            applicableProduct
        });

        // Validate ObjectId fields if they are provided
        if (sanitizedData.applicableCategory && !mongoose.Types.ObjectId.isValid(sanitizedData.applicableCategory)) {
            return res.status(400).json({ success: false, message: "Invalid category ID format." });
        }
        if (sanitizedData.applicableProduct && !mongoose.Types.ObjectId.isValid(sanitizedData.applicableProduct)) {
            return res.status(400).json({ success: false, message: "Invalid product ID format." });
        }

        const updatedCoupon = await Coupon.findByIdAndUpdate(
            couponID,
            sanitizedData,
            { new: true, runValidators: true }
        ).populate('applicableCategory', 'name')
         .populate('applicableProduct', 'name');

        if (!updatedCoupon) {
            return res.status(404).json({ success: false, message: "Coupon not found." });
        }

        res.json({ 
            success: true, 
            message: "Coupon updated successfully.", 
            data: updatedCoupon 
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Coupon code already exists." });
        }
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Delete a coupon
router.delete('/:id', asyncHandler(async (req, res) => {
    try {
        const couponID = req.params.id;
        
        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(couponID)) {
            return res.status(400).json({ success: false, message: "Invalid coupon ID format." });
        }

        const deletedCoupon = await Coupon.findByIdAndDelete(couponID);
        if (!deletedCoupon) {
            return res.status(404).json({ success: false, message: "Coupon not found." });
        }
        res.json({ success: true, message: "Coupon deleted successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Check coupon validity
router.post('/check-coupon', asyncHandler(async (req, res) => {
    const { couponCode, productIds, purchaseAmount } = req.body;

    try {
        // Find the coupon with the provided coupon code
        const coupon = await Coupon.findOne({ couponCode })
            .populate('applicableCategory', 'name')
            .populate('applicableProduct', 'name');

        // If coupon is not found, return false
        if (!coupon) {
            return res.json({ success: false, message: "Coupon not found." });
        }

        // Check if the coupon is expired
        const currentDate = new Date();
        if (coupon.endDate < currentDate) {
            return res.json({ success: false, message: "Sorry this Coupon is expired." });
        }

        // Check if the coupon is active
        if (coupon.status !== 'active') {
            return res.json({ success: false, message: "Coupon is inactive. Contact Admin" });
        }

        // Check if the purchase amount is greater than the minimum purchase amount specified in the coupon
        if (coupon.minimumPurchaseAmount && purchaseAmount < coupon.minimumPurchaseAmount) {
            return res.json({ success: false, message: `Minimum purchase of ${coupon.minimumPurchaseAmount} amount not met.` });
        }

        // Check if the coupon is applicable for all orders
        if (!coupon.applicableCategory && !coupon.applicableProduct) {
            return res.json({ success: true, message: "Coupon is applicable for all orders.", data: coupon });
        }

        // If specific products are provided, check applicability
        if (productIds && productIds.length > 0) {
            // Fetch the products from the database using the provided product IDs
            const products = await Product.find({ _id: { $in: productIds } });

            // Check if any product in the list is not applicable for the coupon
            const isValid = products.every(product => {
                if (coupon.applicableCategory && coupon.applicableCategory._id.toString() !== product.proCategoryId.toString()) {
                    return false;
                }
                if (coupon.applicableProduct && coupon.applicableProduct._id.toString() !== product._id.toString()) {
                    return false;
                }
                return true;
            });

            if (isValid) {
                return res.json({ success: true, message: "Coupon is applicable for the provided products.", data: coupon });
            } else {
                return res.json({ success: false, message: "Coupon is not applicable for the provided products." });
            }
        }

        // If no specific products but coupon has restrictions
        return res.json({ success: false, message: "Coupon has restrictions but no products were specified." });

    } catch (error) {
        console.error('Error checking coupon code:', error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
}));

module.exports = router;