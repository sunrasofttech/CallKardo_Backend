const { verifyAccessToken } = require('../utils/token');
const { User, Admin } = require('../models');
const ResponseBuilder = require('../utils/response');

/**
 * Authentication check middleware.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ResponseBuilder.error(res, 'Authentication token missing or invalid format', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);
    
    if (!decoded) {
      return ResponseBuilder.error(res, 'Invalid or expired authentication token', 401);
    }

    let userObj = null;

    if (decoded.role === 'super_admin' || decoded.role === 'admin') {
      userObj = await Admin.findByPk(decoded.id);
      if (!userObj) {
        userObj = await User.findByPk(decoded.id);
      }
    } else {
      userObj = await User.findByPk(decoded.id, {
        include: ['category'],
      });
      if (!userObj) {
        userObj = await Admin.findByPk(decoded.id);
      }
    }

    if (!userObj) {
      return ResponseBuilder.error(res, 'User profile not found', 401);
    }

    // Attach to request
    req.user = userObj;
    req.userRole = userObj.role || decoded.role;
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return ResponseBuilder.error(res, 'Internal authentication error', 500);
  }
};

/**
 * Optional Authentication check middleware.
 */
const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyAccessToken(token);
      
      if (decoded) {
        let userObj = null;

        if (decoded.role === 'super_admin' || decoded.role === 'admin') {
          userObj = await Admin.findByPk(decoded.id);
          if (!userObj) userObj = await User.findByPk(decoded.id);
        } else {
          userObj = await User.findByPk(decoded.id, {
            include: ['category'],
          });
          if (!userObj) userObj = await Admin.findByPk(decoded.id);
        }

        if (userObj) {
          req.user = userObj;
          req.userRole = userObj.role || decoded.role;
        }
      }
    }
  } catch (error) {
    // Ignore error for optional auth
  }
  next();
};

/**
 * Admin check (super_admin or admin)
 */
const isAdmin = (req, res, next) => {
  const role = req.userRole || req.user?.role;
  if (role !== 'super_admin' && role !== 'admin') {
    return ResponseBuilder.error(res, 'Forbidden: Admin access only', 403);
  }
  next();
};

/**
 * Merchant check
 */
const isMerchant = (req, res, next) => {
  const role = req.userRole || req.user?.role;
  if (role !== 'merchant') {
    return ResponseBuilder.error(res, 'Forbidden: Merchant access only', 403);
  }
  next();
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  isAdmin,
  isMerchant,
};
