const { connectGoldchildDB } = require('../config/db');
const { getGoldchildCourseModel } = require('../models/GoldchildCourse');

const formatCourse = (course) => ({
  id: course._id,
  name: course.name,
  description: course.description,
  duration: course.duration,
  durationType: course.durationType,
  courseFee: course.courseFee,
  status: course.status,
  createdAt: course.createdAt,
  updatedAt: course.updatedAt
});

const getAllGoldchildCourses = async () => {
  const connection = await connectGoldchildDB();
  const GoldchildCourse = getGoldchildCourseModel(connection);
  const courses = await GoldchildCourse.find().lean();
  return courses.map(formatCourse);
};

const createGoldchildCourse = async (payload) => {
  const connection = await connectGoldchildDB();
  const GoldchildCourse = getGoldchildCourseModel(connection);
  const course = await GoldchildCourse.create(payload);
  return formatCourse(course);
};

const updateGoldchildCourse = async (courseId, payload) => {
  const connection = await connectGoldchildDB();
  const GoldchildCourse = getGoldchildCourseModel(connection);
  const updated = await GoldchildCourse.findByIdAndUpdate(courseId, { $set: payload }, { new: true });
  return updated ? formatCourse(updated) : null;
};

const deleteGoldchildCourse = async (courseId) => {
  const connection = await connectGoldchildDB();
  const GoldchildCourse = getGoldchildCourseModel(connection);
  const deleted = await GoldchildCourse.findByIdAndDelete(courseId);
  return deleted;
};

module.exports = {
  getAllGoldchildCourses,
  createGoldchildCourse,
  updateGoldchildCourse,
  deleteGoldchildCourse,
  formatCourse
};
