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
    console.error(`[alchemyst] Failed to load ${modulePath} on ${routePath}: [${mountError.code}] ${mountError.message}`);
  }
};

mountRoute('/user', './routes/user');
mountRoute('/auth', './routes/auth');
mountRoute('/mpesa', './routes/mpesa');
mountRoute('/profiles', './routes/profiles');
mountRoute('/analytics', './routes/analytics');

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Alchemyst',
    tenant: 'alchemyst',
    mountedRoutes: mountedRouteCount
  });
});

router.get('/api/health', (req, res) => {
  const hasMountErrors = routeMountErrors.length > 0;

  res.status(hasMountErrors ? 500 : 200).json({
    status: hasMountErrors ? 'error' : 'success',
    tenant: 'alchemyst',
    mountedRoutes: mountedRouteCount,
    failedRouteMounts: routeMountErrors.length,
    routeMountErrors,
    message: mountedRouteCount > 0
      ? 'Alchemyst tenant routes are mounted'
      : 'Alchemyst tenant shell is mounted. Copy the server files into this folder to enable the full API.',
    timestamp: new Date().toISOString()
  });
});

router.use((req, res) => {
  res.status(404).json({
    status: 'error',
    tenant: 'alchemyst',
    message: 'Alchemyst route not found',
    path: req.originalUrl,
    mountedRoutes: mountedRouteCount,
    failedRouteMounts: routeMountErrors.length,
    routeMountErrors
  });
});

module.exports = router;