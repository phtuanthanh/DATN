const express = require('express');
const router = express.Router();
const VPNStatusService = require('../services/vpnStatusService');
const { VPNTeam, Team } = require('../models');

// Initialize service instance
const vpnService = new VPNStatusService({
    interval: parseInt(process.env.VPN_CHECK_INTERVAL || '60000'),
    timeout: parseInt(process.env.VPN_PING_TIMEOUT || '5000')
});

/**
 * GET /api/vpn/status - Get VPN monitoring service status
 */
router.get('/status', async (req, res) => {
    try {
        const serviceStatus = vpnService.getStatus();
        const vpnStatuses = await vpnService.getAllStatus();

        const stats = {
            online: vpnStatuses.filter(v => v.statusVpn === 'online').length,
            offline: vpnStatuses.filter(v => v.statusVpn === 'offline').length,
            total: vpnStatuses.length
        };

        res.json({
            success: true,
            service: serviceStatus,
            vpnStats: stats,
            vpns: vpnStatuses
        });
    } catch (error) {
        console.error('Error getting VPN status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/vpn/check - Manually trigger VPN status check
 */
router.get('/check', async (req, res) => {
    try {
        console.log('Manual VPN status check requested');
        const results = await vpnService.checkAllVPNs();

        res.json({
            success: true,
            results
        });
    } catch (error) {
        console.error('Error during manual VPN check:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/vpn/start - Start the VPN monitoring service
 */
router.post('/start', async (req, res) => {
    try {
        if (vpnService.getStatus().isRunning) {
            return res.status(400).json({
                success: false,
                error: 'VPN Status Service is already running'
            });
        }

        await vpnService.start();

        res.json({
            success: true,
            message: 'VPN Status Service started successfully',
            status: vpnService.getStatus()
        });
    } catch (error) {
        console.error('Error starting VPN service:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/vpn/stop - Stop the VPN monitoring service
 */
router.post('/stop', (req, res) => {
    try {
        if (!vpnService.getStatus().isRunning) {
            return res.status(400).json({
                success: false,
                error: 'VPN Status Service is not running'
            });
        }

        vpnService.stop();

        res.json({
            success: true,
            message: 'VPN Status Service stopped',
            status: vpnService.getStatus()
        });
    } catch (error) {
        console.error('Error stopping VPN service:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/vpn/list - List all VPN teams with their status
 */
router.get('/list', async (req, res) => {
    try {
        const vpnTeams = await VPNTeam.findAll({
            attributes: ['id', 'nameVpn', 'ipVpn', 'statusVpn', 'createdAt', 'updatedAt'],
            include: [{
                model: Team,
                as: 'team',
                attributes: ['id', 'name']
            }],
            order: [['nameVpn', 'ASC']]
        });

        res.json({
            success: true,
            count: vpnTeams.length,
            data: vpnTeams
        });
    } catch (error) {
        console.error('Error listing VPN teams:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/vpn/stats - Get VPN statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const vpnTeams = await VPNTeam.findAll({
            attributes: ['statusVpn']
        });

        const stats = {
            total: vpnTeams.length,
            online: vpnTeams.filter(v => v.statusVpn === 'online').length,
            offline: vpnTeams.filter(v => v.statusVpn === 'offline').length,
            unknown: vpnTeams.filter(v => !v.statusVpn || v.statusVpn === 'unknown').length
        };

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Error getting VPN stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = {
    router,
    vpnService
};
