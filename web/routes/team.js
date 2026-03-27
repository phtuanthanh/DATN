const express = require('express');
const multer = require('multer');
const os = require('os');
const { authMiddleware } = require('../middleware/authMiddleware');
const teamController = require('../controller/teamController');
const router = express.Router();

// Multer configuration for team image upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, os.tmpdir());
    },
    filename: (req, file, cb) => {
        // Keep temporary filename for validation purposes
        // Will be replaced with random UUID after verification in services
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        cb(null, `team-image-${timestamp}-${random}`);
    }
});

/**
 * Multer upload configuration
 * Only checks file size - detailed validation happens in services/handleTeamImageUpload()
 */
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Routes
router.get('/', authMiddleware, teamController.getTeamPage);
router.post('/create', authMiddleware, upload.single('teamImage'), teamController.createTeam);
router.post('/join', authMiddleware, teamController.joinTeam);
router.get('/leave', authMiddleware, teamController.leaveTeam);
router.post('/update', authMiddleware, upload.single('teamImage'), teamController.updateTeam);

module.exports = router;
