const { getGoldchildStudentModel } = require('../models/GoldchildStudent');
const { getGoldchildAlumniModel } = require('../models/GoldchildAlumni');
const { getGoldchildStudentApplicationModel } = require('../models/GoldchildStudentApplication');
const { getGoldchildCourseModel } = require('../models/GoldchildCourse');

// Get comprehensive dashboard statistics
const getDashboardStats = async (connection) => {
  try {
    const GoldchildStudent = getGoldchildStudentModel(connection);
    const GoldchildAlumni = getGoldchildAlumniModel(connection);
    const GoldchildStudentApplication = getGoldchildStudentApplicationModel(connection);
    const GoldchildCourse = getGoldchildCourseModel(connection);

    // Student Statistics
    const totalStudents = await GoldchildStudent.countDocuments();
    const activeStudents = await GoldchildStudent.countDocuments({ status: 'active' });
    const inactiveStudents = await GoldchildStudent.countDocuments({ status: 'inactive' });
    const suspendedStudents = await GoldchildStudent.countDocuments({ status: 'suspended' });
    const completedStudents = await GoldchildStudent.countDocuments({ status: 'completed' });

    // Alumni Statistics
    const totalAlumni = await GoldchildAlumni.countDocuments();
    const alumniThisYear = await GoldchildAlumni.countDocuments({
      graduationDate: {
        $gte: new Date(new Date().getFullYear(), 0, 1),
        $lt: new Date(new Date().getFullYear() + 1, 0, 1)
      }
    });

    // Application Statistics
    const totalApplications = await GoldchildStudentApplication.countDocuments();
    const pendingApplications = await GoldchildStudentApplication.countDocuments({
      $or: [{ status: 'pending' }, { status: null }, { status: { $exists: false } }]
    });
    const admittedApplications = await GoldchildStudentApplication.countDocuments({ status: 'admitted' });
    const rejectedApplications = await GoldchildStudentApplication.countDocuments({ status: 'rejected' });

    // Course Statistics
    const totalCourses = await GoldchildCourse.countDocuments();
    const activeCourses = await GoldchildCourse.countDocuments({ status: 'active' });

    // Financial Statistics
    const students = await GoldchildStudent.find({}, { courseFee: 1, upfrontFee: 1 }).lean();
    const totalExpectedFees = students.reduce((sum, s) => sum + (s.courseFee || 0), 0);
    const totalCollectedFees = students.reduce((sum, s) => sum + (s.upfrontFee || 0), 0);
    const totalPendingFees = totalExpectedFees - totalCollectedFees;

    // Enrollment by Course
    const enrollmentByCourse = await GoldchildStudent.aggregate([
      {
        $group: {
          _id: '$courseName',
          courseId: { $first: '$courseId' },
          count: { $sum: 1 },
          totalFee: { $sum: '$courseFee' },
          totalCollected: { $sum: '$upfrontFee' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Top Courses by Enrollment
    const topCourses = enrollmentByCourse.slice(0, 5);

    // Recent Admissions (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentAdmissions = await GoldchildStudent.find(
      { createdAt: { $gte: thirtyDaysAgo } },
      { personalInformation: 1, admissionNumber: 1, courseName: 1, createdAt: 1 }
    )
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // Application Conversion Rate
    const conversionRate = totalApplications > 0 ? ((admittedApplications / totalApplications) * 100).toFixed(1) : 0;

    // Average Fee Paid Rate
    const avgPaymentRate = totalExpectedFees > 0 ? ((totalCollectedFees / totalExpectedFees) * 100).toFixed(1) : 0;

    // Collection Efficiency (fees paid vs expected as percentage)
    const feesPaidPercentage = totalExpectedFees > 0 ? ((totalCollectedFees / totalExpectedFees) * 100).toFixed(1) : 0;

    // Payment Status Distribution
    const paymentStatus = {
      fullyPaid: students.filter(s => s.upfrontFee >= s.courseFee).length,
      partiallPaid: students.filter(s => s.upfrontFee > 0 && s.upfrontFee < s.courseFee).length,
      notPaid: students.filter(s => s.upfrontFee === 0 || !s.upfrontFee).length
    };

    return {
      // Student Overview
      students: {
        total: totalStudents,
        active: activeStudents,
        inactive: inactiveStudents,
        suspended: suspendedStudents,
        completed: completedStudents
      },

      // Alumni Overview
      alumni: {
        total: totalAlumni,
        thisYear: alumniThisYear
      },

      // Application Overview
      applications: {
        total: totalApplications,
        pending: pendingApplications,
        admitted: admittedApplications,
        rejected: rejectedApplications,
        conversionRate: parseFloat(conversionRate)
      },

      // Course Overview
      courses: {
        total: totalCourses,
        active: activeCourses
      },

      // Financial Overview
      finance: {
        totalExpectedFees,
        totalCollectedFees,
        totalPendingFees,
        collectionRate: parseFloat(feesPaidPercentage),
        paymentStatus
      },

      // Analytics
      enrollmentByTopCourses: topCourses,
      recentAdmissions: recentAdmissions.map(admission => ({
        name: `${admission.personalInformation?.firstName} ${admission.personalInformation?.lastName}`,
        admissionNumber: admission.admissionNumber,
        course: admission.courseName,
        admittedDate: admission.createdAt
      })),

      // Timestamp
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Dashboard stats error:', error);
    throw error;
  }
};

module.exports = {
  getDashboardStats
};
