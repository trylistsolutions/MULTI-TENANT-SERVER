// Import dependencies
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { startWebSocketServer } = require('./sockets/websocketState');
const { connectGoldchildDB } = require('./goldchild/config/db');
const { connectBinaryDB } = require('./binary/config/db');
const { connectAlchemystDB } = require('./alchemyst/config/db');
const { connectCoffeeDB } = require('./coffee/config/db');
const { connectArobiscaSmsDB } = require('./arobisca-sms/config/db');

// Initialize app
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Connection
const connectDB = async () => {
  try {
    const configuredDbName = process.env.ZOEZI_DB_NAME || 'nairobi_zoezi_school';
    const dbName = configuredDbName.toLowerCase();

    if (configuredDbName !== dbName) {
      console.warn(`Zoezi DB name normalized from "${configuredDbName}" to "${dbName}" to avoid MongoDB case-conflict.`);
    }

    const conn = await mongoose.connect(
      process.env.ZOEZI_MONGODB_URI || 'mongodb://localhost:27017/nairobi_zoezi_school',
      { dbName }
    );
    console.log(`⏱️ Zoezi MongoDB Connected`);
  } catch (error) {
    console.error(`Error connecting to database: ${error.message}`);
    process.exit(1);
  }
};

// Connect to database
connectDB();

let alchemystRouter = null;
let alchemystBootError = null;
let coffeeRouter = null;
let coffeeBootError = null;
let arobiscaSmsRouter = null;
let arobiscaSmsBootError = null;

app.use('/alchemyst', (req, res, next) => {
  if (alchemystRouter) {
    return alchemystRouter(req, res, next);
  }

  const isBootError = Boolean(alchemystBootError);
  return res.status(isBootError ? 500 : 503).json({
    status: 'error',
    tenant: 'alchemyst',
    code: isBootError ? 'ALCHEMYST_BOOT_FAILED' : 'ALCHEMYST_BOOTING',
    message: isBootError
      ? 'Alchemyst tenant failed to initialize. Check server logs for the root cause.'
      : 'Alchemyst tenant is initializing. Retry in a few seconds.',
    details: process.env.NODE_ENV === 'development' ? alchemystBootError : undefined,
    timestamp: new Date().toISOString()
  });
});

app.use('/coffee', (req, res, next) => {
  if (coffeeRouter) {
    return coffeeRouter(req, res, next);
  }

  const isBootError = Boolean(coffeeBootError);
  return res.status(isBootError ? 500 : 503).json({
    status: 'error',
    tenant: 'coffee',
    code: isBootError ? 'COFFEE_BOOT_FAILED' : 'COFFEE_BOOTING',
    message: isBootError
      ? 'Coffee tenant failed to initialize. Check server logs for the root cause.'
      : 'Coffee tenant is initializing. Retry in a few seconds.',
    details: process.env.NODE_ENV === 'development' ? coffeeBootError : undefined,
    timestamp: new Date().toISOString()
  });
});

app.use('/arobisca-sms', (req, res, next) => {
  if (arobiscaSmsRouter) {
    return arobiscaSmsRouter(req, res, next);
  }

  const isBootError = Boolean(arobiscaSmsBootError);
  return res.status(isBootError ? 500 : 503).json({
    status: 'error',
    tenant: 'arobisca-sms',
    code: isBootError ? 'AROBISCA_SMS_BOOT_FAILED' : 'AROBISCA_SMS_BOOTING',
    message: isBootError
      ? 'Arobisca SMS tenant failed to initialize. Check server logs for the root cause.'
      : 'Arobisca SMS tenant is initializing. Retry in a few seconds.',
    details: process.env.NODE_ENV === 'development' ? arobiscaSmsBootError : undefined,
    timestamp: new Date().toISOString()
  });
});

// Connect Goldchild database at startup
connectGoldchildDB().catch((error) => {
  console.error(`Error connecting Goldchild database: ${error.message}`);

  if (process.env.GOLDCHILD_DB_REQUIRED === 'true') {
    process.exit(1);
  }
});

// Connect Binary database at startup
connectBinaryDB().then(() => {
  // console.log('[Binary] Connected. Recurring billing is handled by Pesapal + IPN; local cycle scheduler is disabled.');

  // Initialize monthly invoice reminder scheduler
  const { initializeInvoiceReminderScheduler } = require('./binary/services/scheduler');
  initializeInvoiceReminderScheduler();
}).catch((error) => {
  console.error(`Error connecting Binary database: ${error.message}`);

  if (process.env.BINARY_DB_REQUIRED === 'true') {
    process.exit(1);
  }
});

// Connect Alchemyst database at startup, then mount tenant routes
connectAlchemystDB()
  .then(() => {
    try {
      alchemystRouter = require('./alchemyst');
      console.log('[Alchemyst] Tenant routes mounted');
    } catch (error) {
      alchemystBootError = `Tenant route mount failed: ${error.message}`;
      console.error(`[Alchemyst] Tenant route mount error: ${error.message}`);
      if (process.env.ALCHEMYST_DB_REQUIRED === 'true') {
        process.exit(1);
      }
    }
  })
  .catch((error) => {
    alchemystBootError = error.message;
    console.error(`[Alchemyst] DB connection error: ${error.message}`);
    if (process.env.ALCHEMYST_DB_REQUIRED === 'true') {
      process.exit(1);
    }
  });

// Connect Coffee database at startup, then mount tenant routes
connectCoffeeDB()
  .then(() => {
    try {
      coffeeRouter = require('./coffee');
      console.log('[Coffee] Tenant routes mounted');
    } catch (error) {
      coffeeBootError = `Tenant route mount failed: ${error.message}`;
      console.error(`[Coffee] Tenant route mount error: ${error.message}`);
      if (process.env.COFFEE_DB_REQUIRED === 'true') {
        process.exit(1);
      }
    }
  })
  .catch((error) => {
    coffeeBootError = error.message;
    console.error(`[Coffee] DB connection error: ${error.message}`);
    if (process.env.COFFEE_DB_REQUIRED === 'true') {
      process.exit(1);
    }
  });

// Connect Arobisca SMS database at startup, then mount tenant routes
connectArobiscaSmsDB()
  .then(() => {
    try {
      arobiscaSmsRouter = require('./arobisca-sms');
      console.log('[Arobisca SMS] Tenant routes mounted');
    } catch (error) {
      arobiscaSmsBootError = `Tenant route mount failed: ${error.message}`;
      console.error(`[Arobisca SMS] Tenant route mount error: ${error.message}`);
      if (process.env.AROBISCA_SMS_DB_REQUIRED === 'true') {
        process.exit(1);
      }
    }
  })
  .catch((error) => {
    arobiscaSmsBootError = error.message;
    console.error(`[Arobisca SMS] DB connection error: ${error.message}`);
    if (process.env.AROBISCA_SMS_DB_REQUIRED === 'true') {
      process.exit(1);
    }
  });

// Use routes
app.use('/applications', require('./routes/applicationRoutes'));
app.use('/admissions', require('./routes/admissionsRoutes'));
app.use('/students', require('./routes/studentRoutes'));
app.use('/alumni', require('./routes/alumniRoutes'));
app.use('/mpesa', require('./routes/mpesa'));
app.use('/tutors', require('./routes/tutorRoutes'));
app.use('/courses', require('./routes/courseRoutes'));
app.use('/auth', require('./routes/auth'));
app.use('/users', require('./routes/userRoutes'));
app.use('/groups', require('./routes/groupRoutes'));
app.use('/group-curriculum', require('./routes/groupCurriculumRoutes'));
app.use('/curriculums', require('./routes/curriculumRoutes'));
app.use('/student-curriculum', require('./routes/studentCurriculumRoutes'));
app.use('/certification', require('./routes/certificationRoutes'));
app.use('/admin', require('./routes/adminRoutes'));
app.use('/finance', require('./routes/financeRoutes'));
app.use('/subscription', require('./routes/subscriptionRoutes'));
app.use('/cpd', require('./routes/cpdRoutes'));

// Isolated Goldchild server module (all Goldchild endpoints are namespaced under /goldchild)
app.use('/goldchild', require('./goldchild/routes'));

// Isolated Binary server module (all Binary endpoints are namespaced under /binary)
app.use('/binary', require('./binary/routes'));

// Manual trigger endpoint for cycle payment reminders (testing)
app.get('/api/binary/cycle-payment-reminder/test', async (req, res) => {
  res.status(410).json({
    status: 'disabled',
    message: 'Cycle payment reminder cron is disabled. Binary recurring billing now relies on Pesapal recurring payments and IPN callbacks.',
    timestamp: new Date().toISOString()
  });
});

// Basic health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Admin Authentication Route
app.post('/api/admin/auth', (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Get credentials from environment variables
    const ADMIN_USERS = process.env.ZOEZI_ADMIN_USERS || "";
    const ADMIN_PASSWORDS = process.env.ZOEZI_ADMIN_PASSWORDS || "";
    
    if (!ADMIN_USERS || !ADMIN_PASSWORDS) {
      return res.status(500).json({
        status: 'error',
        message: 'Admin authentication not configured'
      });
    }

    if (!username || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Username and password are required'
      });
    }

    // Parse comma-separated lists from .env
    const validUsers = ADMIN_USERS.split(',').map(u => u.trim());
    const validPasswords = ADMIN_PASSWORDS.split(',').map(p => p.trim());
    
    // Check if username exists and get its index
    const userIndex = validUsers.indexOf(username);
    
    if (userIndex === -1 || password !== validPasswords[userIndex]) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid username or password'
      });
    }

    const expiryTime = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const expiryDate = new Date(Date.now() + expiryTime);

    res.status(200).json({
      status: 'success',
      message: 'Authentication successful',
      data: {
        authenticated: true,
        username: username,
        expiresAt: expiryDate.toISOString()
      }
    });
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Authentication failed'
    });
  }
});

// Admin authentication check endpoint
app.get('/api/admin/check-auth', (req, res) => {
  try {
    // This endpoint just confirms the server is running and admin auth is available
    res.status(200).json({
      status: 'success',
      message: 'Admin auth service available',
      requiresAuth: true
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Auth service unavailable'
    });
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// Start WebSocket server
const { clients } = startWebSocketServer(server);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Nairobi Zoezi School Server running on port ${PORT}`);
});
