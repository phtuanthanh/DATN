const fs = require('fs');
const path = require('path');
const { User, Team, VPNTeam, VPNUser } = require('../models');

/**
 * Get VPN Page - Display VPN configs for user's team only
 * @route GET /vpn
 */
exports.getVpnPage = async (req, res) => {
    try {
        // Get current user's team
        const userId = req.user.id;
        const user = await User.findByPk(userId, {
            include: [
                {
                    model: Team,
                    as: 'team',
                    attributes: ['id', 'name']
                }
            ]
        });

        if (!user || !user.team) {
            return res.render('vpn', {
                title: 'VPN - AD Challenge',
                user: user ? user.dataValues : null,
                vpnTeams: [],
                vpnUsers: [],
                teamId: null,
                error: 'You must be part of a team to view VPN configurations'
            });
        }

        const teamId = user.team.id;

        // Fetch VPN configs for user's team only
        const [vpnTeams, vpnUsers, teamMembers] = await Promise.all([
            VPNTeam.findAll({
                where: { idTeam: teamId },
                include: [
                    { model: Team, as: 'team', attributes: ['id', 'name'] },
                    { model: User, as: 'creator', attributes: ['id', 'username'] }
                ],
                order: [['typeVpn', 'DESC'], ['id', 'ASC']]
            }).catch(() => []),
            VPNUser.findAll({
                where: { idTeam: teamId },
                include: [
                    { model: User, as: 'user', attributes: ['id', 'username', 'email'] },
                    { model: Team, as: 'userTeam', attributes: ['id', 'name'] }
                ],
                order: [['id', 'ASC']]
            }).catch(() => []),
            User.findAll({
                where: { teamId: teamId },
                attributes: ['id', 'username', 'email']
            }).catch(() => [])
        ]);

        res.render('vpn', {
            title: 'VPN - AD Challenge',
            user: user.dataValues,
            vpnTeams: vpnTeams || [],
            vpnUsers: vpnUsers || [],
            teamId: teamId,
            teamName: user.team.name,
            teamMembers: teamMembers || [],
            error: null
        });
    } catch (error) {
        console.error('Error rendering VPN page:', error);
        res.render('vpn', {
            title: 'VPN - AD Challenge',
            user: null,
            vpnTeams: [],
            vpnUsers: [],
            teamId: null,
            error: 'Failed to load VPN data'
        });
    }
};

/**
 * Download VPN Config with authorization
 * @route GET /vpn/download/:vpnId/:type
 * 
 * Authorization:
 * - User must be part of a team
 * - For team VPN: Must be part of the team
 * - For user VPN: Must be part of the same team
 */
exports.downloadVpnConfig = async (req, res) => {
    try {
        const { vpnId, type } = req.params;
        const userId = req.user.id;

        // Validate parameters
        if (!vpnId || !type) {
            return res.status(400).json({ error: 'Invalid vpnId or type' });
        }

        if (!['team', 'user'].includes(type)) {
            return res.status(400).json({ error: 'Invalid type. Must be "team" or "user"' });
        }

        // Get current user's team
        const user = await User.findByPk(userId, {
            include: [
                {
                    model: Team,
                    as: 'team',
                    attributes: ['id', 'name']
                }
            ]
        });

        if (!user || !user.team) {
            console.log(`[VPN-DOWNLOAD] Access denied - user ${userId} not in a team`);
            return res.status(403).json({ error: 'You must be part of a team to download VPN configs' });
        }

        const userTeamId = user.team.id;

        // Fetch VPN record from database
        let vpnRecord;
        if (type === 'team') {
            vpnRecord = await VPNTeam.findByPk(vpnId);
        } else {
            vpnRecord = await VPNUser.findByPk(vpnId);
        }

        // Check if record exists
        if (!vpnRecord) {
            console.log(`[VPN-DOWNLOAD] VPN config not found - ID: ${vpnId}, Type: ${type}`);
            return res.status(404).json({ error: 'VPN config not found' });
        }

        // Authorization check: Verify user's team matches VPN's team
        if (vpnRecord.idTeam !== userTeamId) {
            console.log(`[VPN-DOWNLOAD] Access denied - user ${userId} team ${userTeamId} trying to access team ${vpnRecord.idTeam}`);
            return res.status(403).json({ error: 'Access denied - you can only download VPN configs for your own team' });
        }

        // Check if file path exists
        if (!vpnRecord.path) {
            console.log(`[VPN-DOWNLOAD] No file path for VPN ${vpnId}`);
            return res.status(404).json({ error: 'No file path configured for this VPN' });
        }

        // Define allowed base directory - admin's VPN config directory
        const allowedBaseDir = path.resolve(__dirname, '../../admin/cli/data/vpn-config');

        // Extract filename from path - path might be like ./data/vpn-config/team/filename.conf or ./cli/data/vpn-config/team/filename.conf
        let filename = vpnRecord.path;

        // Extract just the subfolder and filename part
        if (filename.includes('vpn-config/')) {
            filename = filename.substring(filename.indexOf('vpn-config/') + 'vpn-config/'.length);
        }

        // Build the full file path
        const filePath = path.join(allowedBaseDir, filename);

        // Security check: Ensure file is within allowed directories (prevent directory traversal)
        const normalizedFilePath = path.normalize(filePath);
        const normalizedBaseDir = path.normalize(allowedBaseDir);

        if (!normalizedFilePath.startsWith(normalizedBaseDir)) {
            console.error(`[VPN-DOWNLOAD-SECURITY] Denied access to file outside allowed directories: ${normalizedFilePath}`);
            return res.status(403).json({ error: 'Access denied - file location not permitted' });
        }

        // Check if file exists
        if (!fs.existsSync(normalizedFilePath)) {
            console.error(`[VPN-DOWNLOAD] File not found: ${normalizedFilePath}`);
            return res.status(404).json({ error: 'VPN config file not found on server' });
        }

        // Check if path is a file (not directory)
        const stats = fs.statSync(normalizedFilePath);
        if (!stats.isFile()) {
            console.error(`[VPN-DOWNLOAD] Path is not a file: ${normalizedFilePath}`);
            return res.status(400).json({ error: 'Invalid file path' });
        }

        // Get filename and sanitize it for download
        let downloadFilename = vpnRecord.nameVpn || path.basename(normalizedFilePath);
        // Remove any dangerous characters from filename
        downloadFilename = downloadFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
        // Ensure .conf extension
        if (!downloadFilename.endsWith('.conf')) {
            downloadFilename += '.conf';
        }

        // Set response headers for file download
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`);
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        // Stream file to client
        const fileStream = fs.createReadStream(normalizedFilePath);

        fileStream.on('error', (err) => {
            console.error(`[VPN-DOWNLOAD] Error reading file: ${normalizedFilePath}`, err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error reading file' });
            }
        });

        fileStream.pipe(res);

        console.log(`[VPN-DOWNLOAD] User ${userId} successfully downloaded: ${downloadFilename} (${type}, ID: ${vpnId})`);

    } catch (error) {
        console.error('[VPN-DOWNLOAD] Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed: ' + error.message });
        }
    }
};
