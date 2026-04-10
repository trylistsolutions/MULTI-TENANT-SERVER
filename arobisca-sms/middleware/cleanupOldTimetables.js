const Timetable = require("../models/timetables");

const cleanupOldTimetables = async (req, res, next) => {
  try {
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;

    const result = await Timetable.deleteMany({
      createdAt: {
        $gte: new Date(`${lastYear}-01-01T00:00:00.000Z`),
        $lt: new Date(`${currentYear}-01-01T00:00:00.000Z`)
      }
    });

    if (result.deletedCount > 0) {
      console.log(`✅ Deleted ${result.deletedCount} timetables from ${lastYear}`);
    }

    next();
  } catch (error) {
    console.error("❌ Cleanup Error:", error);
    next();
  }
};

module.exports = cleanupOldTimetables;
