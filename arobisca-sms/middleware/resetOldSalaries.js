const Tutor = require("../models/tutors");

const resetOldSalaries = async (req, res, next) => {
  try {
    const currentYear = new Date().getFullYear();

    await Tutor.updateMany(
      { "salaryPayments.year": { $lt: currentYear } },
      { $set: { "salaryPayments.$[].status": "pending" } }
    );

    next();
  } catch (error) {
    console.error("Salary reset error:", error);
    res.status(500).json({ success: false, message: "Failed to reset old salaries" });
  }
};

module.exports = resetOldSalaries;
