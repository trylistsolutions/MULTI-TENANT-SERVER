const { getGoldchildStudentModel } = require('../models/GoldchildStudent');
const { getGoldchildAlumniModel } = require('../models/GoldchildAlumni');

// Get all students with pagination, search, and filter
const getAllGoldchildStudents = async (connection, query = {}) => {
  const GoldchildStudent = getGoldchildStudentModel(connection);

  const {
    page = 1,
    limit = 10,
    search = '',
    status = 'all',
    sortBy = 'createdAt',
    sortOrder = -1
  } = query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, Math.min(100, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  // Build filter
  const filter = {};

  // Search by name, email, admission number, phone
  if (search) {
    const searchRegex = new RegExp(search, 'i');
    filter.$or = [
      { 'personalInformation.firstName': searchRegex },
      { 'personalInformation.lastName': searchRegex },
      { 'personalInformation.email': searchRegex },
      { 'personalInformation.phoneNumber': searchRegex },
      { admissionNumber: searchRegex },
      { courseName: searchRegex }
    ];
  }

  // Filter by status
  if (status && status !== 'all') {
    filter.status = status;
  }

  // Execute query
  const students = await GoldchildStudent.find(filter)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limitNum)
    .lean();

  // Get total count for pagination
  const total = await GoldchildStudent.countDocuments(filter);

  return {
    students,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  };
};

// Get single student by ID
const getGoldchildStudent = async (connection, studentId) => {
  const GoldchildStudent = getGoldchildStudentModel(connection);
  return await GoldchildStudent.findById(studentId);
};

// Update student
const updateGoldchildStudent = async (connection, studentId, updateData) => {
  const GoldchildStudent = getGoldchildStudentModel(connection);
  return await GoldchildStudent.findByIdAndUpdate(
    studentId,
    updateData,
    { new: true, runValidators: true }
  );
};

// Get student stats
const getStudentStats = async (connection) => {
  const GoldchildStudent = getGoldchildStudentModel(connection);

  const total = await GoldchildStudent.countDocuments();
  const active = await GoldchildStudent.countDocuments({ status: 'active' });
  const inactive = await GoldchildStudent.countDocuments({ status: 'inactive' });
  const suspended = await GoldchildStudent.countDocuments({ status: 'suspended' });
  const completed = await GoldchildStudent.countDocuments({ status: 'completed' });

  return {
    total,
    active,
    inactive,
    suspended,
    completed
  };
};

// Get alumni stats
const getAlumniStats = async (connection) => {
  const GoldchildAlumni = getGoldchildAlumniModel(connection);

  const total = await GoldchildAlumni.countDocuments();
  const thisYear = await GoldchildAlumni.countDocuments({
    graduationDate: {
      $gte: new Date(new Date().getFullYear(), 0, 1),
      $lt: new Date(new Date().getFullYear() + 1, 0, 1)
    }
  });

  return {
    total,
    graduatedThisYear: thisYear
  };
};

// Graduate student - move to alumni, delete from students
const graduateGoldchildStudent = async (connection, studentId, graduationNotes = '') => {
  const GoldchildStudent = getGoldchildStudentModel(connection);
  const GoldchildAlumni = getGoldchildAlumniModel(connection);

  // Get student
  const student = await GoldchildStudent.findById(studentId);
  if (!student) {
    throw new Error('Student not found');
  }

  // Check if fees completed (courseFee <= upfrontFee)
  if (student.courseFee > student.upfrontFee) {
    throw new Error('Student has not completed school fees. Cannot graduate.');
  }

  // Normalize academicInformation - convert course object to string if needed
  let normalizedAcademicInfo = { ...student.academicInformation || {} };
  if (normalizedAcademicInfo.course && typeof normalizedAcademicInfo.course === 'object') {
    // If course is an object, extract the title or name
    normalizedAcademicInfo.course = normalizedAcademicInfo.course.title || normalizedAcademicInfo.course.name || JSON.stringify(normalizedAcademicInfo.course);
  }

  // Create alumni record
  const alumniData = {
    studentId: student._id,
    admissionNumber: student.admissionNumber,
    graduationDate: new Date(),
    graduationNotes,
    personalInformation: student.personalInformation,
    academicInformation: normalizedAcademicInfo,
    financialInformation: student.financialInformation,
    nextOfKin: student.nextOfKin,
    discoveryChannels: student.discoveryChannels,
    startDate: student.startDate,
    courseId: student.courseId,
    courseName: student.courseName,
    duration: student.duration,
    durationType: student.durationType,
    courseFee: student.courseFee,
    upfrontFee: student.upfrontFee,
    adminNotes: student.adminNotes,
    applicationRef: student.applicationRef
  };

  const alumni = new GoldchildAlumni(alumniData);
  await alumni.save();

  // Delete student record
  await GoldchildStudent.deleteOne({ _id: studentId });

  return alumni;
};

// Get all alumni with pagination, search, and filter
const getAllGoldchildAlumni = async (connection, query = {}) => {
  const GoldchildAlumni = getGoldchildAlumniModel(connection);

  const {
    page = 1,
    limit = 10,
    search = '',
    sortBy = 'graduationDate',
    sortOrder = -1
  } = query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, Math.min(100, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  // Build filter
  const filter = {};

  // Search by name, email, admission number, phone
  if (search) {
    const searchRegex = new RegExp(search, 'i');
    filter.$or = [
      { 'personalInformation.firstName': searchRegex },
      { 'personalInformation.lastName': searchRegex },
      { 'personalInformation.email': searchRegex },
      { 'personalInformation.phoneNumber': searchRegex },
      { admissionNumber: searchRegex },
      { courseName: searchRegex }
    ];
  }

  // Execute query
  const alumni = await GoldchildAlumni.find(filter)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limitNum)
    .lean();

  // Get total count for pagination
  const total = await GoldchildAlumni.countDocuments(filter);

  return {
    alumni,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  };
};

module.exports = {
  getAllGoldchildStudents,
  getGoldchildStudent,
  updateGoldchildStudent,
  getStudentStats,
  getAlumniStats,
  graduateGoldchildStudent,
  getAllGoldchildAlumni
};
