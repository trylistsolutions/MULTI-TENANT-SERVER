const { connectGoldchildDB } = require('../config/db');
const { getGoldchildStudentApplicationModel } = require('../models/GoldchildStudentApplication');

const createGoldchildStudentApplication = async (payload) => {
  const connection = await connectGoldchildDB();
  const GoldchildStudentApplication = getGoldchildStudentApplicationModel(connection);

  const application = new GoldchildStudentApplication(payload);
  const savedApplication = await application.save();

  return savedApplication;
};

const sortApplications = (applications) => {
  return applications.sort((first, second) => {
    const firstRejected = first.status === 'rejected';
    const secondRejected = second.status === 'rejected';

    if (firstRejected !== secondRejected) {
      return firstRejected ? 1 : -1;
    }

    const firstDate = new Date(first.submittedAt || first.createdAt || 0).getTime();
    const secondDate = new Date(second.submittedAt || second.createdAt || 0).getTime();

    return secondDate - firstDate;
  });
};

const getAllGoldchildStudentApplications = async () => {
  const connection = await connectGoldchildDB();
  const GoldchildStudentApplication = getGoldchildStudentApplicationModel(connection);
  const applications = await GoldchildStudentApplication.find().lean();

  return sortApplications(applications);
};

const rejectGoldchildStudentApplication = async (applicationId, rejectionReason) => {
  const connection = await connectGoldchildDB();
  const GoldchildStudentApplication = getGoldchildStudentApplicationModel(connection);

  const updated = await GoldchildStudentApplication.findByIdAndUpdate(
    applicationId,
    {
      $set: {
        status: 'rejected',
        rejectionReason: rejectionReason || null,
        rejectedAt: new Date()
      }
    },
    { new: true }
  );

  return updated;
};

const deleteGoldchildStudentApplication = async (applicationId) => {
  const connection = await connectGoldchildDB();
  const GoldchildStudentApplication = getGoldchildStudentApplicationModel(connection);

  const deleted = await GoldchildStudentApplication.findByIdAndDelete(applicationId);
  return deleted;
};

module.exports = {
  createGoldchildStudentApplication,
  getAllGoldchildStudentApplications,
  rejectGoldchildStudentApplication,
  deleteGoldchildStudentApplication
};
