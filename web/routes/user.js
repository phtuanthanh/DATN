const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/authMiddleware');
const userController = require('../controller/userController');
const router = express.Router();

/**
 * Multer configuration for profile updates - use memory storage to avoid disk I/O delays
 */
const storage = multer.memoryStorage();

// File filter for early validation - REJECT IMMEDIATELY with error
const fileFilter = (req, file, cb) => {
    const ALLOWED_MIMES = {
        'image/jpeg': true,
        'image/png': true,
        'image/gif': true,
        'image/webp': true
    };

    // Check MIME type first
    if (!ALLOWED_MIMES[file.mimetype]) {
        return cb(new Error(`Invalid file type: ${file.mimetype}. Only JPG, PNG, GIF, WebP allowed`));
    }

    cb(null, true); // Accept file
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit - Multer will enforce this
    }
});

/**
 * Pre-validation middleware - check Content-Length BEFORE Multer processes
 * Rejects oversized requests immediately without buffering
 */
const validateContentLength = (req, res, next) => {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const contentLength = parseInt(req.headers['content-length']) || 0;

    if (contentLength > maxSize) {
        return res.status(400).render('error', {
            code: '400',
            title: 'File Upload Error',
            message: `File too large: ${(contentLength / 1024 / 1024).toFixed(2)}MB. Maximum 5MB allowed`
        });
    }
    next();
};

/**
 * POST /profile/update - Update user profile
 */
router.post('/profile/update', authMiddleware, validateContentLength, (req, res, next) => {
    upload.single('avatar')(req, res, (err) => {
        // Catch Multer errors immediately and return error page
        if (err) {
            const errorMessage = err.message || 'File upload error';
            return res.status(400).render('error', {
                code: '400',
                title: 'File Upload Error',
                message: errorMessage
            });
        }
        next();
    });
}, userController.updateProfile);

/**
 * GET /dashboard - Redirect to home (unified landing page)
 */
router.get('/dashboard', (req, res) => {
    res.redirect('/');
});

/**
 * GET /profile - Display user profile
 */
router.get('/profile', authMiddleware, userController.getProfile);

/**
 * GET /scoreboard - Display scoreboard
 */
router.get('/scoreboard', authMiddleware, userController.getScoreboard);

/**
 * GET /vpn - Display VPN status
 */
router.get('/vpn', authMiddleware, userController.getVpn);

/**
 * GET /services - Display services
 */
router.get('/services', authMiddleware, userController.getServices);

module.exports = router;
