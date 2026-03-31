const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/authMiddleware');
const adminController = require('../controller/adminController');
const servicesController = require('../controller/servicesController');

// Dashboard
router.get('/', isAuthenticated, adminController.getDashboard);

// Page routes
router.get('/competition', isAuthenticated, adminController.getCompetitionPage);
router.get('/services', isAuthenticated, servicesController.getServicesPage);
router.get('/vpn', isAuthenticated, adminController.getVpnPage);
router.get('/team', isAuthenticated, adminController.getTeamPage);
router.get('/user', isAuthenticated, adminController.getUserPage);
router.get('/test', isAuthenticated, adminController.getTestPage);

// Competition Data endpoints
router.get('/competition-data', isAuthenticated, adminController.getCompetition);
router.post('/competition-data', isAuthenticated, adminController.updateCompetition);
router.get('/stats-data', isAuthenticated, adminController.getDashboardStats);
router.get('/scoreboard-data', isAuthenticated, adminController.getScoreboard);

// VPN Generation endpoints
router.post('/vpn/generate-teams-vulnbox', isAuthenticated, adminController.generateVpnTeamsVulnbox);
router.post('/vpn/generate-teams-testbox', isAuthenticated, adminController.generateVpnTeamsTestbox);
router.post('/vpn/generate-users', isAuthenticated, adminController.generateVpnUsers);
router.get('/vpn/test-environment', isAuthenticated, adminController.testVpnEnvironment);

// VPN Download endpoint
router.get('/download-vpn/:vpnId/:type', isAuthenticated, adminController.downloadVpnConfig);

// Team net generation
router.post('/team/generate-net/:teamId', isAuthenticated, adminController.generateTeamNet);
router.post('/team/generate-all-nets', isAuthenticated, adminController.generateAllTeamNets);

// Services Data endpoints
router.get('/services-data', isAuthenticated, servicesController.getServices);
router.post('/services-data', isAuthenticated, servicesController.createService);
router.put('/services-data/:id', isAuthenticated, servicesController.updateService);
router.delete('/services-data/:id', isAuthenticated, servicesController.deleteService);

module.exports = router;
