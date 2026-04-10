const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { connectGoldchildDB } = require('../config/db');
const { getGoldchildAdminUserModel } = require('../models/GoldchildAdminUser');

const router = express.Router();

const JWT_SECRET = process.env.GOLDCHILD_ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'goldchild-admin-secret';
const JWT_EXPIRES_IN = process.env.GOLDCHILD_ADMIN_JWT_EXPIRES_IN || '12h';

const formatAdminUser = (user) => ({
  id: user._id,
  username: user.username,
  fullName: user.fullName,
  role: user.role,
  isBlocked: user.isBlocked,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const ensureBootstrapAdmins = async () => {
  const connection = await connectGoldchildDB();
  const GoldchildAdminUser = getGoldchildAdminUserModel(connection);
  const existingCount = await GoldchildAdminUser.countDocuments();

  if (existingCount > 0) {
    return;
  }

  const adminUsersRaw = process.env.ADMIN_USERS || 'admin';
  const adminPasswordsRaw = process.env.ADMIN_PASSWORDS || 'admin123';
  const usernames = adminUsersRaw.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const passwords = adminPasswordsRaw.split(',').map((entry) => entry.trim()).filter(Boolean);

  if (usernames.length === 0 || passwords.length === 0) {
    return;
  }

  const records = [];

  for (let index = 0; index < usernames.length; index += 1) {
    const username = usernames[index];
    const password = passwords[index] || passwords[0];
    const passwordHash = await bcrypt.hash(password, 10);

    records.push({
      username,
      fullName: index === 0 ? 'Primary Admin' : `Admin ${index + 1}`,
      passwordHash,
      role: index === 0 ? 'super_admin' : 'admin'
    });
  }

  await GoldchildAdminUser.insertMany(records);
};

const getAuthToken = (req) => {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.replace('Bearer ', '').trim();
};

const requireAuth = async (req, res, next) => {
  try {
    const token = getAuthToken(req);

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const connection = await connectGoldchildDB();
    const GoldchildAdminUser = getGoldchildAdminUserModel(connection);
    const user = await GoldchildAdminUser.findById(decoded.sub);

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid authentication token.'
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        status: 'error',
        message: 'This admin account is blocked.'
      });
    }

    req.adminUser = user;
    return next();
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid or expired authentication token.'
    });
  }
};

const requireSuperAdmin = (req, res, next) => {
  if (!req.adminUser || req.adminUser.role !== 'super_admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Super admin privileges are required for this action.'
    });
  }

  return next();
};

router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Username and password are required.'
      });
    }

    await ensureBootstrapAdmins();

    const connection = await connectGoldchildDB();
    const GoldchildAdminUser = getGoldchildAdminUserModel(connection);
    const user = await GoldchildAdminUser.findOne({ username: username.toLowerCase().trim() });

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid username or password.'
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        status: 'error',
        message: 'This admin account is blocked.'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid username or password.'
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = jwt.sign(
      {
        sub: user._id.toString(),
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      status: 'success',
      message: 'Authentication successful.',
      data: {
        token,
        user: formatAdminUser(user)
      }
    });
  } catch (error) {
    console.error('Goldchild admin login error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to authenticate admin user.'
    });
  }
});

router.get('/auth/me', requireAuth, async (req, res) => {
  return res.status(200).json({
    status: 'success',
    data: {
      user: formatAdminUser(req.adminUser)
    }
  });
});

router.get('/users', requireAuth, async (req, res) => {
  try {
    const connection = await connectGoldchildDB();
    const GoldchildAdminUser = getGoldchildAdminUserModel(connection);
    const users = await GoldchildAdminUser.find().sort({ createdAt: -1 });

    return res.status(200).json({
      status: 'success',
      data: users.map(formatAdminUser)
    });
  } catch (error) {
    console.error('Goldchild admin list error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch admin users.'
    });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { username, fullName, password, role } = req.body;

    if (!username || !fullName || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Username, full name and password are required.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 6 characters long.'
      });
    }

    const normalizedRole = role === 'super_admin' ? 'super_admin' : 'admin';
    const normalizedUsername = username.toLowerCase().trim();

    const connection = await connectGoldchildDB();
    const GoldchildAdminUser = getGoldchildAdminUserModel(connection);
    const existingUser = await GoldchildAdminUser.findOne({ username: normalizedUsername });

    if (existingUser) {
      return res.status(409).json({
        status: 'error',
        message: 'An admin with this username already exists.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const createdUser = await GoldchildAdminUser.create({
      username: normalizedUsername,
      fullName: fullName.trim(),
      passwordHash,
      role: normalizedRole
    });

    return res.status(201).json({
      status: 'success',
      message: 'Admin user created successfully.',
      data: formatAdminUser(createdUser)
    });
  } catch (error) {
    console.error('Goldchild admin create error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to create admin user.'
    });
  }
});

router.patch('/users/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, fullName, role, password } = req.body;

    const connection = await connectGoldchildDB();
    const GoldchildAdminUser = getGoldchildAdminUserModel(connection);
    const user = await GoldchildAdminUser.findById(id);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Admin user not found.'
      });
    }

    if (username) {
      const normalizedUsername = username.toLowerCase().trim();
      const duplicate = await GoldchildAdminUser.findOne({ username: normalizedUsername, _id: { $ne: id } });

      if (duplicate) {
        return res.status(409).json({
          status: 'error',
          message: 'An admin with this username already exists.'
        });
      }

      user.username = normalizedUsername;
    }

    if (fullName) {
      user.fullName = fullName.trim();
    }

    if (role && ['admin', 'super_admin'].includes(role)) {
      user.role = role;
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          status: 'error',
          message: 'Password must be at least 6 characters long.'
        });
      }

      user.passwordHash = await bcrypt.hash(password, 10);
    }

    await user.save();

    return res.status(200).json({
      status: 'success',
      message: 'Admin user updated successfully.',
      data: formatAdminUser(user)
    });
  } catch (error) {
    console.error('Goldchild admin update error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update admin user.'
    });
  }
});

router.patch('/users/:id/block', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (req.adminUser._id.toString() === id) {
      return res.status(400).json({
        status: 'error',
        message: 'You cannot block your own account.'
      });
    }

    const connection = await connectGoldchildDB();
    const GoldchildAdminUser = getGoldchildAdminUserModel(connection);
    const user = await GoldchildAdminUser.findById(id);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Admin user not found.'
      });
    }

    user.isBlocked = true;
    await user.save();

    return res.status(200).json({
      status: 'success',
      message: 'Admin user blocked successfully.',
      data: formatAdminUser(user)
    });
  } catch (error) {
    console.error('Goldchild admin block error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to block admin user.'
    });
  }
});

router.patch('/users/:id/unblock', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const connection = await connectGoldchildDB();
    const GoldchildAdminUser = getGoldchildAdminUserModel(connection);
    const user = await GoldchildAdminUser.findById(id);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Admin user not found.'
      });
    }

    user.isBlocked = false;
    await user.save();

    return res.status(200).json({
      status: 'success',
      message: 'Admin user unblocked successfully.',
      data: formatAdminUser(user)
    });
  } catch (error) {
    console.error('Goldchild admin unblock error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to unblock admin user.'
    });
  }
});

router.delete('/users/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (req.adminUser._id.toString() === id) {
      return res.status(400).json({
        status: 'error',
        message: 'You cannot delete your own account.'
      });
    }

    const connection = await connectGoldchildDB();
    const GoldchildAdminUser = getGoldchildAdminUserModel(connection);
    const deletedUser = await GoldchildAdminUser.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({
        status: 'error',
        message: 'Admin user not found.'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Admin user deleted successfully.'
    });
  } catch (error) {
    console.error('Goldchild admin delete error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to delete admin user.'
    });
  }
});

module.exports = router;
