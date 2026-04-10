const express = require("express");
const asyncHandler = require("express-async-handler");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const Inventory = require("../models/inventory");
const Student = require("../models/student")
const updateOverdueFees = require("../middleware/updateOverdueFees");
const router = express.Router();

// Apply the middleware to all inventory routes
router.use(updateOverdueFees);

// Get all Inventory
router.get('/', asyncHandler(async (req, res) => {
  try {
    const users = await Inventory.find();
    res.json({ success: true, message: "Inventory retrieved successfully.", data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

// Configure multer storage (temporary memory storage)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.AROBISCA_SMS_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.AROBISCA_SMS_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.AROBISCA_SMS_CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Upload to Cloudinary
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: "inventory_items",
        resource_type: "image",
        quality: "auto:good",
        fetch_format: "auto",
        width: 500,
        height: 500,
        crop: "fill",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(fileBuffer);
  });
};

// Create Inventory Item
router.post("/", upload.single("image"), asyncHandler(async (req, res) => {
  try {
    let imageUrl = null;
    let imagePublicId = null;

    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer);
      imageUrl = uploadResult.secure_url;
      imagePublicId = uploadResult.public_id;
    }

    const newItem = new Inventory({
      ...req.body,
      imageUrl,
      imagePublicId,
    });
    await newItem.save();

    res.status(201).json({ success: true, message: "Item created successfully", data: newItem });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create item", error });
  }
})
);

// Update Inventory Item
router.put("/:id", upload.single("image"), asyncHandler(async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: "Item not found" });

    if (req.file) {
      // Delete old image if a new one is uploaded
      if (item.imagePublicId) await cloudinary.uploader.destroy(item.imagePublicId);

      const uploadResult = await uploadToCloudinary(req.file.buffer);
      req.body.imageUrl = uploadResult.secure_url;
      req.body.imagePublicId = uploadResult.public_id;
    }

    const updatedItem = await Inventory.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, message: "Item updated successfully", data: updatedItem });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update item", error });
  }
})
);

router.post('/borrow', asyncHandler(async (req, res) => {
  const { studentId, inventoryId, allowedDays } = req.body;

  try {
    const student = await Student.findById(studentId);
    const inventoryItem = await Inventory.findById(inventoryId);

    // Check if the book is available
    if (inventoryItem.status !== "Available") {
      return res.status(400).json({ success: false, message: "This Book is not available for borrowing." });
    }

    if (!student || !inventoryItem) {
      return res.status(404).json({ success: false, message: "Student or Inventory item not found." });
    }

    // Check if the student has any unreturned books
    const hasUnreturnedBook = student.borrowedBooks.some(book => book.returnDate === null);
    if (hasUnreturnedBook) {
      return res.status(400).json({ success: false, message: "You must return the previous book before borrowing another." });
    }

    // Check if student already borrowed this book but hasn't returned it
    const alreadyBorrowedThisBook = student.borrowedBooks.some(book => book.itemId.toString() === inventoryId && book.returnDate === null);
    if (alreadyBorrowedThisBook) {
      return res.status(400).json({ success: false, message: "You have already borrowed this book. Return it first before borrowing again." });
    }

    // Check if student has any outstanding accrued fees
    const hasOutstandingFees = student.borrowedBooks.some(book => book.accruedFee > 0);
    if (hasOutstandingFees) {
      return res.status(400).json({ success: false, message: "You have outstanding accrued fees. Please clear them before borrowing another book." });
    }


    if (inventoryItem.quantity === 0 || inventoryItem.status === "Borrowed") {
      return res.status(400).json({ success: false, message: "This book is not available for borrowing." });
    }

    const borrowDate = new Date();

    // Ensure borrowedBy is initialized
    if (!inventoryItem.borrowedBy) {
      inventoryItem.borrowedBy = [];
    }

    // Update Inventory record
    inventoryItem.borrowedBy.push({
      itemId: student._id,
      dateBorrowed: borrowDate,
      studentAdm: student.admissionNumber,
      returnDate: null,
      allowedDays,
    });

    // Decrease inventory quantity
    inventoryItem.quantity -= 1;
    if (inventoryItem.quantity === 0) {
      inventoryItem.status = "Borrowed";
    }

    // Update Student record
    student.borrowedBooks.push({
      itemId: inventoryItem._id,
      bookName: inventoryItem.name,
      bookImage: inventoryItem.imageUrl,
      dateBorrowed: borrowDate,
      returnDate: null,
      allowedDays,
      accruedFee: 0,
    });

    await student.save();
    await inventoryItem.save();

    res.json({ success: true, message: "Book borrowed successfully." });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));

//--------- get student by id
router.get('/student/:admissionNumber', asyncHandler(async (req, res) => {
  try {
    const admissionNumber = req.params.admissionNumber;
    const student = await Student.findOne({ admissionNumber })
      .populate("borrowedBooks.itemId", "name imageUrl");

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found." });
    }

    res.json({ success: true, data: student });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));



router.post('/return', asyncHandler(async (req, res) => {
  const { studentId, inventoryId, studentBookId } = req.body;

  try {
    const student = await Student.findById(studentId);
    const inventoryItem = await Inventory.findById(inventoryId);

    if (!student || !inventoryItem) {
      return res.status(404).json({ success: false, message: "Student or Inventory item not found." });
    }

    // Find the borrowed book in the student's record
    const borrowedBook = student.borrowedBooks.find(b => b._id.toString() === studentBookId);
    if (!borrowedBook) {
      return res.status(400).json({ success: false, message: "Book was not borrowed by this student." });
    }

    // Set return date for the student's record
    const returnDate = new Date();
    borrowedBook.returnDate = returnDate;

    // Calculate overdue fee if applicable
    const dueDate = new Date(borrowedBook.dateBorrowed);
    dueDate.setDate(dueDate.getDate() + borrowedBook.allowedDays);

    if (returnDate > dueDate) {
      const overdueDays = Math.ceil((returnDate - dueDate) / (1000 * 60 * 60 * 24));
      borrowedBook.accruedFee = overdueDays * 50;
    } else {
      borrowedBook.accruedFee = 0;
    }

    // Remove the student from inventory's `borrowedBy` array
    inventoryItem.borrowedBy = inventoryItem.borrowedBy.filter(b => b.itemId.toString() !== studentId);

    // Restore inventory quantity
    inventoryItem.quantity += 1;
    if (inventoryItem.status === "Borrowed" && inventoryItem.quantity > 0) {
      inventoryItem.status = "Available";
    }

    await student.save();
    await inventoryItem.save();

    res.json({ success: true, message: "Book returned successfully." });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));


router.post('/bookfee', asyncHandler(async (req, res) => {
  const { studentId, inventoryId, studentBookId, amount } = req.body;

  // Validate the request
  if (!studentId || !inventoryId || !studentBookId || !amount) {
    return res.status(400).json({ 
      success: false, 
      message: "Missing required fields: studentId, inventoryId, studentBookId, and amount are required." 
    });
  }

  // Validate amount is a positive number
  const paymentAmount = parseFloat(amount);
  if (isNaN(paymentAmount) || paymentAmount <= 0) {
    return res.status(400).json({ 
      success: false, 
      message: "Amount must be a positive number." 
    });
  }

  try {
    // Find student and inventory item
    const student = await Student.findById(studentId);
    const inventoryItem = await Inventory.findById(inventoryId);

    if (!student || !inventoryItem) {
      return res.status(404).json({ 
        success: false, 
        message: "Student or Inventory item not found." 
      });
    }

    // Find the borrowed book in the student's record
    const borrowedBookIndex = student.borrowedBooks.findIndex(b => b._id.toString() === studentBookId);
    if (borrowedBookIndex === -1) {
      return res.status(400).json({ 
        success: false, 
        message: "Book record not found for this student." 
      });
    }

    // Get the borrowed book record
    const borrowedBook = student.borrowedBooks[borrowedBookIndex];
    
    // Check if there's any fee to pay
    if (borrowedBook.accruedFee <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No accrued fee to pay for this book." 
      });
    }

    // Calculate the new accrued fee (don't go below zero)
    const newAccruedFee = Math.max(0, borrowedBook.accruedFee - paymentAmount);
    const actualPayment = borrowedBook.accruedFee - newAccruedFee;

    // Update the student's borrowed book record
    student.borrowedBooks[borrowedBookIndex].accruedFee = newAccruedFee;
    student.borrowedBooks[borrowedBookIndex].accruedFee = newAccruedFee;

    // Update the inventory item to track earnings
    // Initialize feesCollected if it doesn't exist
    if (!inventoryItem.feesCollected) {
      inventoryItem.feesCollected = 0;
    }
    inventoryItem.feesCollected += actualPayment;

    // Save both documents
    await student.save();
    await inventoryItem.save();

    res.json({ 
      success: true, 
      message: `Payment of Ksh. ${actualPayment.toFixed(2)} processed successfully.`,
      remainingFee: newAccruedFee
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));




// Delete Inventory Item
router.delete("/:id", asyncHandler(async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: "Item not found" });

    if (item.imagePublicId) await cloudinary.uploader.destroy(item.imagePublicId);
    await Inventory.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: "Item deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete item", error });
  }
})
);

module.exports = router;
