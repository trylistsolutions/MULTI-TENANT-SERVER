const express = require('express');

const router = express.Router();
let mountedRouteCount = 0;
const routeMountErrors = [];

const mountRoute = (routePath, modulePath) => {
  try {
    router.use(routePath, require(modulePath));
    mountedRouteCount += 1;
  } catch (error) {
    const mountError = {
      routePath,
      modulePath,
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message
    };
    routeMountErrors.push(mountError);
    console.error(`[arobisca-sms] Failed to load ${modulePath} on ${routePath}: [${mountError.code}] ${mountError.message}`);
  }
};

mountRoute('/students', './routes/student');
mountRoute('/courses', './routes/courses');
mountRoute('/tutors', './routes/tutors');
mountRoute('/staff', './routes/staff');
mountRoute('/classes', './routes/classes');
mountRoute('/auth', './routes/auth');
mountRoute('/timetables', './routes/timetables');
mountRoute('/inventory', './routes/inventory');
mountRoute('/finance', './routes/finance');
mountRoute('/admin', './routes/admin');
mountRoute('/alumni', './routes/alumni');
mountRoute('/feedback', './routes/feedback');
mountRoute('/quizzes', './routes/quiz');
mountRoute('/exams', './routes/exams');
mountRoute('/api/forums', './routes/forums');
mountRoute('/applications', './routes/applications');
mountRoute('/inquiries', './routes/inquiries');
mountRoute('/groups', './routes/groupExams');
mountRoute('/newsletter', './routes/newsletter');

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Arobisca - SMS - Server Running',
    tenant: 'arobisca-sms',
    mountedRoutes: mountedRouteCount
  });
});

router.get('/api/health', (req, res) => {
  const hasMountErrors = routeMountErrors.length > 0;

  res.status(hasMountErrors ? 500 : 200).json({
    status: hasMountErrors ? 'error' : 'success',
    tenant: 'arobisca-sms',
    mountedRoutes: mountedRouteCount,
    failedRouteMounts: routeMountErrors.length,
    routeMountErrors,
    message: mountedRouteCount > 0
      ? 'Arobisca SMS tenant routes are mounted'
      : 'Arobisca SMS tenant shell is mounted. Copy the server files into this folder to enable the full API.',
    timestamp: new Date().toISOString()
  });
});

router.use((req, res) => {
  res.status(404).json({
    status: 'error',
    tenant: 'arobisca-sms',
    message: 'Arobisca SMS route not found',
    path: req.originalUrl,
    mountedRoutes: mountedRouteCount,
    failedRouteMounts: routeMountErrors.length,
    routeMountErrors
  });
});

module.exports = router;