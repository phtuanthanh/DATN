const express = require('express');
const multer = require('multer');
const { authMiddleware } = require('../middleware/authMiddleware');
const teamController = require('../controller/teamController');
const router = express.Router();

/**
 * Multer configuration for team image upload - use memory storage to avoid disk I/O delays
 */
const storage = multer.memoryStorage();

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

/**
 * Multer upload configuration
 */
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

/**
 * Pre-validation middleware - check Content-Length BEFORE Multer processes
 * Rejects oversized requests immediately without buffering
 */
const validateContentLength = (req, res, next) => {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const contentLength = parseInt(req.headers['content-length']) || 0;
    console.log(contentLength);
    if (contentLength > maxSize) {
        return res.status(400).render('error', {
            code: '400',
            title: 'File Upload Error',
            message: `File too large: ${(contentLength / 1024 / 1024).toFixed(2)}MB. Maximum 5MB allowed`
        });
    }
    next();
};

// Routes
router.get('/', authMiddleware, teamController.getTeamPage);

router.post('/create', validateContentLength, authMiddleware, (req, res, next) => {
    upload.single('teamImage')(req, res, (err) => {
        // Catch Multer errors immediately and return error page
        if (err) {
            const errorMessage = err.message || 'File upload error';
            return res.status(400).render('error', {
                code: '400',
                title: 'File Upload Error',
                message: errorMessage
            });
        }
        // File passed validation, proceed to controller
        next();
    });
}, teamController.createTeam);

router.post('/join', authMiddleware, teamController.joinTeam);
router.get('/leave', authMiddleware, teamController.leaveTeam);

router.post('/update', authMiddleware, validateContentLength, (req, res, next) => {
    upload.single('teamImage')(req, res, (err) => {
        // Catch Multer errors immediately and return error page
        if (err) {
            const errorMessage = err.message || 'File upload error';
            return res.status(400).render('error', {
                code: '400',
                title: 'File Upload Error',
                message: errorMessage
            });
        }
        // File passed validation, proceed to controller
        next();
    });
}, teamController.updateTeam);

module.exports = router;
