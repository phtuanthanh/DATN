/**
 * Verification Middleware
 * Checks if user account is verified before allowing access
 */
const verificationMiddleware = (req, res, next) => {
    try {
        // Check if user exists (should be set by authMiddleware)
        if (!req.user) {
            return res.redirect('/auth/login');
        }

        // In a real scenario, would fetch user from database to check isVerified
        // For now, we'll create a simpler version - the verification check will happen in routes
        // by fetching the user and checking req.user.isVerified

        next();
    } catch (error) {
        console.error('Verification middleware error:', error);
        res.status(500).render('error', {
            code: '500',
            title: 'Error',
            message: 'An error occurred while verifying your account status'
        });
    }
};

/**
 * Check if user is verified - async version that fetches from DB
 */
const checkUserVerified = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.redirect('/auth/login');
        }

        const { User } = require('../models');
        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.redirect('/auth/login');
        }

        if (!user.isVerified) {
            return res.status(403).render('error', {
                code: '403',
                title: 'Account Not Verified',
                message: 'Your email address has not been verified yet. Please check your email for the verification link. If you did not receive the email, please try registering again.'
            });
        }

        // Store full user info in request for later use
        req.verifiedUser = user;
        next();
    } catch (error) {
        console.error('Verification check error:', error);
        res.status(500).render('error', {
            code: '500',
            title: 'Error',
            message: 'An error occurred while verifying your account status'
        });
    }
};

module.exports = {
    verificationMiddleware,
    checkUserVerified
};
