const express = require('express');
const multer = require('multer');
const path = require('path');
const userController = require('../controller/userController');

const router = express.Router();

/**
 * Multer configuration for registration - use memory storage to avoid disk I/O delays
 */
const storage = multer.memoryStorage();

// File filter for early validation
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

router.get('/login', userController.GetLogin);
router.post('/login', userController.PostLogin);
router.get('/register', userController.GetResgiter);
router.post('/register', upload.single('avatar'), userController.PostResgiter);

router.get('/logout', userController.Logout);

module.exports = router;
