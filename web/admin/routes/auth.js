const express = require('express');
const router = express.Router();

/**
 * GET /auth/login - Display login page
 */
router.get('/login', (req, res) => {
    res.render('auth/login', { errorMessage: null, layout: false });
});

/**
 * POST /auth/login - Handle login
 * Hardcoded credentials: admin / 123456
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validate input
        if (!username || !password) {
            return res.render('auth/login', { errorMessage: 'Username and password are required', layout: false });
        }

        // Hardcoded credentials for demo
        const ADMIN_USERNAME = 'admin';
        const ADMIN_PASSWORD = '123456';
        const ADMIN_ID = 'admin-001';

        // Check credentials
        if (username.trim() === ADMIN_USERNAME && password.trim() === ADMIN_PASSWORD) {
            // Set session
            req.session.adminId = ADMIN_ID;
            req.session.role = 'admin';
            req.session.username = ADMIN_USERNAME;

            console.log(`✓ Admin login successful for user: ${ADMIN_USERNAME}`);
            return res.redirect('/admin');
        }

        console.warn(`✗ Failed login attempt with username: ${username}`);
        res.render('auth/login', { errorMessage: 'Invalid username or password', layout: false });
    } catch (error) {
        console.error('Login error:', error);
        res.render('auth/login', { errorMessage: 'An error occurred during login', layout: false });
    }
});

/**
 * GET /auth/logout - Handle logout
 */
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', error);
        }
        res.redirect('/auth/login');
    });
});

module.exports = router;
