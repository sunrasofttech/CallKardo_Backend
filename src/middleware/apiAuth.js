const { User } = require('../models');

/**
 * Middleware to authenticate public API requests using x-api-key header or Bearer token
 */
const apiAuth = async (req, res, next) => {
  try {
    let apiKey = req.headers['x-api-key'];
    
    // Also accept Bearer token format if preferred
    if (!apiKey && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      apiKey = req.headers.authorization.split(' ')[1];
    }

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API Key is missing. Please provide it in the x-api-key header.',
      });
    }

    const user = await User.findOne({ where: { apiKey, role: 'merchant' } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API Key',
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('[API Auth Middleware] Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

module.exports = { apiAuth };
