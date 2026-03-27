const crypto = require('crypto');

/**
 * Generate a secure random verification token
 * @returns {string} 32-byte hex token
 */
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Calculate token expiry time (10 minutes from now)
 * @returns {Date} Expiry time
 */
function getTokenExpiry() {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 10); // 10 minutes expiry
    return now;
}

/**
 * Check if a token has expired
 * @param {Date} expiresAt - Token expiry timestamp
 * @returns {boolean} true if expired, false if still valid
 */
function isTokenExpired(expiresAt) {
    if (!expiresAt) return true;
    return new Date() > new Date(expiresAt);
}

module.exports = {
    generateToken,
    getTokenExpiry,
    isTokenExpired
};
