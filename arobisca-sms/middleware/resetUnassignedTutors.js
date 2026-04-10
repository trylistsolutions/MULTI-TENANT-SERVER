const Tutor = require("../models/tutors");

const resetUnassignedTutors = async (req, res, next) => {
  try {
    // Find all tutors with zero studentCount but still assigned to a cohort
    const affectedTutors = await Tutor.updateMany(
      { studentCount: 0, currentCohort: { $ne: "" } },
      { $set: { currentCohort: "", status: "Available" } }
    );


    if(affectedTutors.modifiedCount > 0){
      console.log(`✅ Reset ${affectedTutors.modifiedCount} unassigned tutors`);
    }

    next();
  } catch (error) {
    console.error("Error resetting unassigned tutors:", error);
    res.status(500).json({ success: false, message: "Failed to reset unassigned tutors" });
  }
};

module.exports = resetUnassignedTutors;
