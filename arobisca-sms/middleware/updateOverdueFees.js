const Student = require("../models/student");

const updateOverdueFees = async (req, res, next) => {
  try {
    // Get current date
    const today = new Date();

    // Find students with borrowed books
    const students = await Student.find({ borrowedBooks: { $ne: [] } });

    for (const student of students) {
      let updated = false;

      for (const borrowedBook of student.borrowedBooks) {
        if (!borrowedBook.returnDate) {
          // Calculate due date
          const dueDate = new Date(borrowedBook.dateBorrowed);
          dueDate.setDate(dueDate.getDate() + borrowedBook.allowedDays);

          // If overdue, calculate the fee
          if (today > dueDate) {
            const overdueDays = Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24));
            borrowedBook.accruedFee = overdueDays * 50;
            updated = true;
          }
        }
      }

      // Save only if updates were made
      if (updated) {
        await student.save();
      }
    }

    next(); // Continue to the next middleware/route handler
  } catch (error) {
    console.error("Error updating overdue fees:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = updateOverdueFees;
