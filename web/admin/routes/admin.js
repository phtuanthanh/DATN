const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/authMiddleware');
const adminController = require('../controller/adminController');

// Dashboard
router.get('/', isAuthenticated, adminController.getDashboard);

// API endpoints
router.get('/api/competition', isAuthenticated, adminController.getCompetition);
router.get('/api/stats', isAuthenticated, adminController.getDashboardStats);

module.exports = router;
