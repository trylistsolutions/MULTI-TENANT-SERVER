// utils/updateQuizStatuses.js
const Quiz = require('../models/quiz');

async function updateQuizStatuses() {
  const now = new Date();

  // Draft: start date in future
  await Quiz.updateMany(
    { startDate: { $gt: now } },
    { $set: { status: 'draft' } }
  );

  // Active: start <= now <= end
  await Quiz.updateMany(
    { startDate: { $lte: now }, endDate: { $gte: now } },
    { $set: { status: 'active' } }
  );

  // Expired: end < now
  await Quiz.updateMany(
    { endDate: { $lt: now } },
    { $set: { status: 'expired' } }
  );
}

module.exports = updateQuizStatuses;
