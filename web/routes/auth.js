const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const userController = require('../controller/userController');

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, os.tmpdir());
    },
    filename: (req, file, cb) => {
        // Keep temporary filename for validation purposes
        // Will be replaced with random UUID after verification in services
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        cb(null, `avatar-${timestamp}-${random}`);
    }
});

/**
 * Basic multer upload configuration
 * Only checks file size - detailed validation happens in services/handleAvatarUpload()
 */
const upload = multer({
    storage: storage,
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
