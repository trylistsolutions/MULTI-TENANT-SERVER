const express = require('express');
const router = express.Router();
const Product = require('../model/product');
const multer = require('multer');
const asyncHandler = require('express-async-handler');
const cloudinary = require('cloudinary').v2;

// Configure multer storage (temporary memory storage)
const storage = multer.memoryStorage();
const uploadProduct = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit per image
  }
});

// Cloudinary Config (same as categories)
cloudinary.config({
    cloud_name: process.env.COFFEE_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.COFFEE_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.COFFEE_CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Upload to Cloudinary function
const uploadToCloudinary = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: "products",
      resource_type: "image",
      quality: "auto:good",
      fetch_format: "auto",
      ...options
    };

    cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          reject({ message: "Image upload failed", error });
        } else {
          resolve(result);
        }
      }
    ).end(fileBuffer);
  });
};

// Delete from Cloudinary function
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error("Cloudinary delete error:", error);
    throw error;
  }
};

// Get all products
router.get('/', asyncHandler(async (req, res) => {
    try {
        const products = await Product.find()
        .populate('proCategoryId', 'id name')
        res.json({ success: true, message: "Products retrieved successfully.", data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Get a product by ID
router.get('/:id', asyncHandler(async (req, res) => {
    try {
        const productID = req.params.id;
        const product = await Product.findById(productID)
            .populate('proCategoryId', 'id name')
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }
        res.json({ success: true, message: "Product retrieved successfully.", data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Create new product with Cloudinary image upload
router.post('/', uploadProduct.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 },
    { name: 'image4', maxCount: 1 },
    { name: 'image5', maxCount: 1 }
]), asyncHandler(async (req, res) => {
    try {
        // Extract product data from the request body
        console.log(req.body);
        const { name, description, quantity, price, offerPrice, vat, proCategoryId } = req.body;

        // Check if any required fields are missing
        if (!name || !quantity || !price || !proCategoryId) {
            return res.status(400).json({ success: false, message: "Required fields are missing." });
        }

        // Initialize an array to store image data
        const imageDataArray = [];

        // Upload images to Cloudinary
        const fields = ['image1', 'image2', 'image3', 'image4', 'image5'];
        
        for (const [index, field] of fields.entries()) {
            if (req.files[field] && req.files[field].length > 0) {
                try {
                    const file = req.files[field][0];
                    const uploadResult = await uploadToCloudinary(file.buffer, {
                        folder: "products"
                    });

                    const imageData = {
                        image: index + 1,
                        url: uploadResult.secure_url,
                        publicId: uploadResult.public_id,
                        width: uploadResult.width,
                        height: uploadResult.height,
                        format: uploadResult.format,
                        bytes: uploadResult.bytes
                    };
                    
                    imageDataArray.push(imageData);
                } catch (uploadError) {
                    console.error(`Error uploading ${field} to Cloudinary:`, uploadError);
                    
                    // Cleanup: Delete any already uploaded images if one fails
                    for (const uploadedImage of imageDataArray) {
                        try {
                            await deleteFromCloudinary(uploadedImage.publicId);
                        } catch (deleteError) {
                            console.error("Error cleaning up uploaded images:", deleteError);
                        }
                    }
                    
                    return res.status(500).json({ 
                        success: false, 
                        message: `Failed to upload ${field} to cloud storage` 
                    });
                }
            }
        }

        // Create a new product object with data
        const newProduct = new Product({ 
            name, 
            description, 
            quantity, 
            price, 
            offerPrice,
            vat, 
            proCategoryId, 
            images: imageDataArray 
        });

        // Save the new product to the database
        await newProduct.save();

        // Send a success response back to the client
        res.json({ success: true, message: "Product created successfully.", data: null });

    } catch (error) {
        // Handle any errors that occur during the process
        console.error("Error creating product:", error);
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Update a product with Cloudinary image management
router.put('/:id', uploadProduct.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 },
    { name: 'image4', maxCount: 1 },
    { name: 'image5', maxCount: 1 }
]), asyncHandler(async (req, res) => {
    const productId = req.params.id;
    try {
        const { name, description, quantity, price, offerPrice, vat, proCategoryId } = req.body;

        // Find the product by ID
        const productToUpdate = await Product.findById(productId);
        if (!productToUpdate) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        // Update product properties if provided
        productToUpdate.name = name || productToUpdate.name;
        productToUpdate.description = description || productToUpdate.description;
        productToUpdate.quantity = quantity || productToUpdate.quantity;
        productToUpdate.price = price || productToUpdate.price;
        productToUpdate.offerPrice = offerPrice || productToUpdate.offerPrice;
        productToUpdate.vat = vat || productToUpdate.vat;
        productToUpdate.proCategoryId = proCategoryId || productToUpdate.proCategoryId;

        // Handle image updates
        const fields = ['image1', 'image2', 'image3', 'image4', 'image5'];
        
        for (const [index, field] of fields.entries()) {
            if (req.files[field] && req.files[field].length > 0) {
                try {
                    const file = req.files[field][0];
                    
                    // Upload new image to Cloudinary
                    const uploadResult = await uploadToCloudinary(file.buffer, {
                        folder: "products"
                    });

                    const newImageData = {
                        image: index + 1,
                        url: uploadResult.secure_url,
                        publicId: uploadResult.public_id,
                        width: uploadResult.width,
                        height: uploadResult.height,
                        format: uploadResult.format,
                        bytes: uploadResult.bytes
                    };

                    // Find existing image for this position
                    const existingImageIndex = productToUpdate.images.findIndex(img => img.image === (index + 1));
                    
                    // Delete old image from Cloudinary if it exists
                    if (existingImageIndex !== -1 && productToUpdate.images[existingImageIndex].publicId) {
                        try {
                            await deleteFromCloudinary(productToUpdate.images[existingImageIndex].publicId);
                        } catch (deleteError) {
                            console.error("Error deleting old image from Cloudinary:", deleteError);
                            // Continue with update even if deletion fails
                        }
                    }

                    // Update or add the image data
                    if (existingImageIndex !== -1) {
                        productToUpdate.images[existingImageIndex] = newImageData;
                    } else {
                        productToUpdate.images.push(newImageData);
                    }

                } catch (uploadError) {
                    console.error(`Error uploading ${field} to Cloudinary:`, uploadError);
                    return res.status(500).json({ 
                        success: false, 
                        message: `Failed to upload ${field} to cloud storage` 
                    });
                }
            }
        }

        // Save the updated product
        await productToUpdate.save();
        res.json({ success: true, message: "Product updated successfully." });

    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Delete a product and its images from Cloudinary
router.delete('/:id', asyncHandler(async (req, res) => {
    const productID = req.params.id;
    try {
        // Find product first to get image data
        const product = await Product.findById(productID);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        // Delete all product images from Cloudinary
        if (product.images && product.images.length > 0) {
            for (const image of product.images) {
                if (image.publicId) {
                    try {
                        await deleteFromCloudinary(image.publicId);
                    } catch (deleteError) {
                        console.error("Error deleting image from Cloudinary:", deleteError);
                        // Continue with product deletion even if image deletion fails
                    }
                }
            }
        }

        // Delete the product from database
        await Product.findByIdAndDelete(productID);
        
        res.json({ success: true, message: "Product deleted successfully." });
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({ success: false, message: error.message });
    }
}));

module.exports = router;