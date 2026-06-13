const jwt = require('jsonwebtoken');
const defaults = require('../config/defaults');

const JWT_SECRET = defaults.jwt.secret;
const JWT_REFRESH_SECRET = defaults.jwt.refreshSecret;

const ACCESS_EXPIRATION = defaults.jwt.accessExpiration;
const REFRESH_EXPIRATION = defaults.jwt.refreshExpiration;

/**
 * Sign access token
 */
const generateAccessToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRATION });
};

/**
 * Sign refresh token
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRATION });
};

/**
 * Verify access token
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
