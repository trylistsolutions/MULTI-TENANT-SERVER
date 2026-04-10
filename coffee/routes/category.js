const express = require('express');
const Category = require('../model/category');
const Product = require('../model/product');
const asyncHandler = require('express-async-handler');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

const router = express.Router();

// Configure multer storage (temporary memory storage)
const storage = multer.memoryStorage();
const uploadCategory = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Cloudinary Config (make sure these env variables are set)
cloudinary.config({
  cloud_name: process.env.COFFEE_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.COFFEE_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.COFFEE_CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Upload to Cloudinary function (same as your other app)
const uploadToCloudinary = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: "categories",
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

// Get all categories
router.get('/', asyncHandler(async (req, res) => {
    try {
        const categories = await Category.find();
        res.json({ success: true, message: "Categories retrieved successfully.", data: categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Get a category by ID
router.get('/:id', asyncHandler(async (req, res) => {
    try {
        const categoryID = req.params.id;
        const category = await Category.findById(categoryID);
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found." });
        }
        res.json({ success: true, message: "Category retrieved successfully.", data: category });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}));

// Create a new category with image upload to Cloudinary
router.post('/', uploadCategory.single('img'), asyncHandler(async (req, res) => {
  try {
    const { name } = req.body;
    let imageData = null;

    if (!name) {
      return res.status(400).json({ success: false, message: "Name is required." });
    }

    // Upload image to Cloudinary if provided
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, {
          folder: "categories"
        });

        imageData = {
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          width: uploadResult.width,
          height: uploadResult.height,
          format: uploadResult.format,
          bytes: uploadResult.bytes
        };
      } catch (uploadError) {
        console.error("Error uploading to Cloudinary:", uploadError);
        return res.status(500).json({ 
          success: false, 
          message: "Failed to upload image to cloud storage" 
        });
      }
    }

    // Create category with Cloudinary image data
    try {
      const newCategory = new Category({
        name: name,
        image: imageData ? imageData.url : 'no_url',
        imageData: imageData // Store full image data including publicId for future deletion
      });
      
      await newCategory.save();
      res.json({ 
        success: true, 
        message: "Category created successfully.", 
        data: null 
      });
    } catch (error) {
      console.error("Error creating category:", error);
      
      // If category creation fails but image was uploaded, delete the image from Cloudinary
      if (imageData && imageData.publicId) {
        try {
          await deleteFromCloudinary(imageData.publicId);
        } catch (deleteError) {
          console.error("Error cleaning up uploaded image:", deleteError);
        }
      }
      
      res.status(500).json({ success: false, message: error.message });
    }
  } catch (err) {
    console.log(`Error creating category: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
}));

// Update a category with Cloudinary image management
router.put('/:id', uploadCategory.single('img'), asyncHandler(async (req, res) => {
  try {
    const categoryID = req.params.id;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: "Name is required." });
    }

    // Find existing category to get current image data
    const existingCategory = await Category.findById(categoryID);
    if (!existingCategory) {
      return res.status(404).json({ success: false, message: "Category not found." });
    }

    let imageUrl = existingCategory.image;
    let imageData = existingCategory.imageData;

    // If new image is provided, upload to Cloudinary and delete old one
    if (req.file) {
      try {
        // Upload new image to Cloudinary
        const uploadResult = await uploadToCloudinary(req.file.buffer, {
          folder: "categories"
        });

        const newImageData = {
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          width: uploadResult.width,
          height: uploadResult.height,
          format: uploadResult.format,
          bytes: uploadResult.bytes
        };

        // Delete old image from Cloudinary if it exists and has publicId
        if (existingCategory.imageData && existingCategory.imageData.publicId) {
          try {
            await deleteFromCloudinary(existingCategory.imageData.publicId);
          } catch (deleteError) {
            console.error("Error deleting old image from Cloudinary:", deleteError);
            // Continue with update even if deletion fails
          }
        }

        imageUrl = newImageData.url;
        imageData = newImageData;

      } catch (uploadError) {
        console.error("Error uploading to Cloudinary:", uploadError);
        return res.status(500).json({ 
          success: false, 
          message: "Failed to upload image to cloud storage" 
        });
      }
    }

    // Update category
    try {
      const updatedCategory = await Category.findByIdAndUpdate(
        categoryID, 
        { 
          name: name, 
          image: imageUrl,
          imageData: imageData
        }, 
        { new: true }
      );
      
      res.json({ 
        success: true, 
        message: "Category updated successfully.", 
        data: null 
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }

  } catch (err) {
    console.log(`Error updating category: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
}));

// Delete a category and its image from Cloudinary
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const categoryID = req.params.id;

    // Check if any products reference this category
    const products = await Product.find({ proCategoryId: categoryID });
    if (products.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Cannot delete category. Products are referencing it." 
      });
    }

    // Find category to get image data before deletion
    const category = await Category.findById(categoryID);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found." });
    }

    // Delete image from Cloudinary if it exists and has publicId
    if (category.imageData && category.imageData.publicId) {
      try {
        await deleteFromCloudinary(category.imageData.publicId);
      } catch (deleteError) {
        console.error("Error deleting image from Cloudinary:", deleteError);
        // Continue with category deletion even if image deletion fails
      }
    }

    // Delete the category
    await Category.findByIdAndDelete(categoryID);
    
    res.json({ 
      success: true, 
      message: "Category deleted successfully." 
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}));


module.exports = router;
