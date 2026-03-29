const jwt = require('jsonwebtoken');

/**
 * Middleware to check if user is authenticated
 */
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.adminId) {
        return next();
    }
    return res.redirect('/admin/login');
};

/**
 * Middleware to check JWT token
 */
const verifyToken = (req, res, next) => {
    const token = (req.headers.authorization && req.headers.authorization.split(' ')[1]) || (req.cookies && req.cookies.token);

    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'admin_jwt_secret');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid token' });
    }
};

/**
 * Middleware to check if user is admin
 */
const isAdmin = (req, res, next) => {
    if (req.session && req.session.adminId && req.session.role === 'admin') {
        return next();
    }
    return res.status(403).json({ message: 'Admin access required' });
};

module.exports = {
    isAuthenticated,
    verifyToken,
    isAdmin
};
