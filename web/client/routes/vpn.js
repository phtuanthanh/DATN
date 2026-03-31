const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const vpnController = require('../controller/vpnController');

const router = express.Router();

/**
 * VPN Routes
 * All routes require authentication
 */

// Get VPN page - view all team's VPN configs
router.get('/', authMiddleware, vpnController.getVpnPage);

// Download VPN config file - with authorization check
router.get('/download/:vpnId/:type', authMiddleware, vpnController.downloadVpnConfig);

module.exports = router;
