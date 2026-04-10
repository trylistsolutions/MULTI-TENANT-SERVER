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
    console.error(`[coffee] Failed to load ${modulePath} on ${routePath}: [${mountError.code}] ${mountError.message}`);
  }
};

mountRoute('/categories', './routes/category');
mountRoute('/products', './routes/product');
mountRoute('/couponCodes', './routes/couponCode');
mountRoute('/posters', './routes/poster');
mountRoute('/users', './routes/user');
mountRoute('/orders', './routes/order');
mountRoute('/payment', './routes/payment');
mountRoute('/notification', './routes/notification');
mountRoute('/mpesa', './routes/mpesa');
mountRoute('/password', './routes/password');
mountRoute('/shipping-fees', './routes/shippingFees');
mountRoute('/dashboard', './routes/dashboard');

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API working successfully',
    tenant: 'coffee',
    mountedRoutes: mountedRouteCount
  });
});

router.get('/api/health', (req, res) => {
  const hasMountErrors = routeMountErrors.length > 0;

  res.status(hasMountErrors ? 500 : 200).json({
    status: hasMountErrors ? 'error' : 'success',
    tenant: 'coffee',
    mountedRoutes: mountedRouteCount,
    failedRouteMounts: routeMountErrors.length,
    routeMountErrors,
    message: mountedRouteCount > 0
      ? 'Coffee tenant routes are mounted'
      : 'Coffee tenant shell is mounted. Copy the server files into this folder to enable the full API.',
    timestamp: new Date().toISOString()
  });
});

router.use((req, res) => {
  res.status(404).json({
    status: 'error',
    tenant: 'coffee',
    message: 'Coffee route not found',
    path: req.originalUrl,
    mountedRoutes: mountedRouteCount,
    failedRouteMounts: routeMountErrors.length,
    routeMountErrors
  });
});

module.exports = router;