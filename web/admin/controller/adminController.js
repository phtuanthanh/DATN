const competitionServices = require('../services/competitionServices');
const { ScoringGamecontrol } = require('../models');
const { spawn } = require('child_process');
const path = require('path');

/**
 * Get competition information
 * @route GET /admin/api/competition
 */
exports.getCompetition = async (req, res) => {
    try {
        const competition = await competitionServices.getCurrentCompetition();

        if (!competition) {
            return res.status(404).json({ error: 'Competition not found' });
        }

        res.json(competition);
    } catch (error) {
        console.error('Error fetching competition:', error);
        res.status(500).json({ error: 'Failed to fetch competition data' });
    }
};

/**
 * Get all admin statistics
 * @route GET /admin/api/stats
 */
exports.getDashboardStats = async (req, res) => {
    try {
        const { User, Team, VPNTeam, VPNUser } = require('../models');

        const [totalUsers, totalTeams, vpnTeamConfigs, vpnUserConfigs] = await Promise.all([
            User.count(),
            Team.count(),
            VPNTeam.count(),
            VPNUser.count()
        ]);

        const activeTeams = await Team.count({
            where: {
                status: 'active'
            }
        }).catch(() => 0);

        const competition = await competitionServices.getCurrentCompetition();

        res.json({
            totalUsers,
            totalTeams,
            activeTeams,
            vpnTeamConfigs,
            vpnUserConfigs,
            competition
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
};

/**
 * Get dashboard with both stats and competition info
 * @route GET /admin/dashboard
 */
exports.getDashboard = async (req, res) => {
    try {
        const { User, Team, VPNTeam, VPNUser } = require('../models');

        const [totalUsers, totalTeams, vpnTeamConfigs, vpnUserConfigs] = await Promise.all([
            User.count(),
            Team.count(),
            VPNTeam.count(),
            VPNUser.count()
        ]);

        const activeTeams = await Team.count({
            where: {
                status: 'active'
            }
        }).catch(() => 0);

        const competition = await competitionServices.getCurrentCompetition();

        res.render('dashboard', {
            username: req.session.username || 'Admin',
            stats: {
                totalUsers,
                totalTeams,
                activeTeams,
                vpnTeamConfigs,
                vpnUserConfigs
            },
            competition: competition
        });
    } catch (error) {
        console.error('Error rendering dashboard:', error);
        res.render('dashboard', {
            username: req.session.username || 'Admin',
            stats: {
                totalUsers: 0,
                totalTeams: 0,
                activeTeams: 0,
                vpnTeamConfigs: 0,
                vpnUserConfigs: 0
            },
            competition: null,
            error: 'Failed to load competition data'
        });
    }
};

/**
 * Get competition page for editing
 * @route GET /admin/competition
 */
exports.getCompetitionPage = async (req, res) => {
    try {
        const competition = await competitionServices.getCompetitionForEdit();

        res.render('competition-page', {
            username: req.session.username || 'Admin',
            competition: competition
        });
    } catch (error) {
        console.error('Error rendering competition page:', error);
        res.render('competition-page', {
            username: req.session.username || 'Admin',
            competition: null,
            error: 'Failed to load competition data'
        });
    }
};

/**
 * Update or create competition
 * @route POST /admin/api/competition
 */
exports.updateCompetition = async (req, res) => {
    try {
        const result = await competitionServices.updateCompetition(req.body);

        if (!result.success) {
            return res.status(400).json({
                error: result.errors.join('; ')
            });
        }

        console.log(`✓ Competition updated: ${req.body.competition_name}`);
        res.json({
            success: true,
            message: 'Competition settings updated successfully',
            data: result.data
        });
    } catch (error) {
        console.error('Error updating competition:', error);
        res.status(500).json({
            error: 'Failed to update competition settings: ' + error.message
        });
    }
};

// Test VPN environment
exports.testVpnEnvironment = async (req, res) => {
    try {
        console.log('[VPN-TEST] Testing VPN environment...');

        const fs = require('fs');
        const scriptPath = path.join(__dirname, '../cli/vpn-status-user.py');
        const envPath = path.join(__dirname, '../.env');

        // Check if script exists
        const scriptExists = fs.existsSync(scriptPath);
        console.log(`[VPN-TEST] Script exists (${scriptPath}):`, scriptExists);

        // Check if .env exists
        const envExists = fs.existsSync(envPath);
        console.log(`[VPN-TEST] .env exists (${envPath}):`, envExists);

        // Check Python
        const pythonTest = spawn('python3', ['--version'], {
            cwd: path.join(__dirname, '../cli/vpn')
        });

        let pythonOutput = '';
        let pythonError = '';

        pythonTest.stdout.on('data', (data) => {
            pythonOutput += data.toString();
        });

        pythonTest.stderr.on('data', (data) => {
            pythonError += data.toString();
        });

        pythonTest.on('close', (code) => {
            const result = {
                scriptExists,
                envExists,
                pythonAvailable: code === 0,
                pythonVersion: pythonOutput || pythonError,
                cwd: path.join(__dirname, '../cli/vpn'),
                timestamp: new Date().toISOString()
            };
            console.log('[VPN-TEST] Result:', result);
            res.json(result);
        });

    } catch (error) {
        console.error('[VPN-TEST] Error:', error);
        res.status(500).json({
            error: error.message
        });
    }
};

// Helper function to group teams by idTeam
function groupVpnTeamsByTeam(teams) {
    const grouped = {};
    teams.forEach(team => {
        const teamId = team.idTeam || 'unknown';
        if (!grouped[teamId]) {
            grouped[teamId] = [];
        }
        grouped[teamId].push(team);
    });
    return grouped;
}

// Helper function to group users by idTeam
function groupVpnUsersByTeam(users) {
    const grouped = {};
    users.forEach(user => {
        const teamId = user.idTeam || 'no-team';
        if (!grouped[teamId]) {
            grouped[teamId] = [];
        }
        grouped[teamId].push(user);
    });
    return grouped;
}

// Get VPN page
exports.getVpnPage = async (req, res) => {
    try {
        const { VPNTeam, VPNUser, Team, User } = require('../models');

        const [vpnTeams, vpnUsers] = await Promise.all([
            VPNTeam.findAll({
                include: [
                    { model: Team, as: 'team', attributes: ['id', 'name'] },
                    { model: User, as: 'creator', attributes: ['id', 'username'] }
                ],
                order: [['idTeam', 'ASC'], ['typeVpn', 'DESC']]
            }).catch(() => []),
            VPNUser.findAll({
                include: [
                    { model: User, as: 'user', attributes: ['id', 'username', 'email'] },
                    { model: Team, as: 'userTeam', attributes: ['id', 'name'] }
                ],
                order: [['idTeam', 'ASC'], ['id', 'ASC']]
            }).catch(() => [])
        ]);

        // Group data for template
        const groupedVpnTeams = groupVpnTeamsByTeam(vpnTeams);
        const groupedVpnUsers = groupVpnUsersByTeam(vpnUsers);

        res.render('vpn-page', {
            username: req.session.username || 'Admin',
            vpnTeams: vpnTeams || [],
            vpnUsers: vpnUsers || [],
            groupedVpnTeams: groupedVpnTeams,
            groupedVpnUsers: groupedVpnUsers
        });
    } catch (error) {
        console.error('Error rendering VPN page:', error);
        res.render('vpn-page', {
            username: req.session.username || 'Admin',
            vpnTeams: [],
            vpnUsers: [],
            groupedVpnTeams: {},
            groupedVpnUsers: {},
            error: 'Failed to load VPN data'
        });
    }
};

// Get team page
exports.getTeamPage = async (req, res) => {
    try {
        const { Team, User } = require('../models');

        const teams = await Team.findAll({
            include: [
                {
                    model: User,
                    as: 'members',
                    attributes: ['id', 'username']
                }
            ]
        }).catch(err => {
            console.error('Error fetching teams:', err);
            return [];
        });

        // Add member count to each team
        const teamsWithMembers = teams.map(team => {
            const teamData = team.toJSON ? team.toJSON() : team;
            return {
                ...teamData,
                memberCount: teamData.members ? teamData.members.length : 0
            };
        });

        res.render('team-page', {
            username: req.session.username || 'Admin',
            teams: teamsWithMembers || []
        });
    } catch (error) {
        console.error('Error rendering team page:', error);
        res.render('team-page', {
            username: req.session.username || 'Admin',
            teams: [],
            error: 'Failed to load teams data'
        });
    }
};

// Generate net value from VPN config
exports.generateTeamNet = async (req, res) => {
    try {
        const { teamId } = req.params;
        const { Team, VPNTeam } = require('../models');

        // Find team
        const team = await Team.findByPk(teamId);
        if (!team) {
            return res.status(404).json({ error: 'Team not found' });
        }

        // Find vulnbox VPN config (typeVpn = true)
        const vpnConfig = await VPNTeam.findOne({
            where: {
                idTeam: teamId,
                typeVpn: true
            }
        });

        if (!vpnConfig || !vpnConfig.ipVpn) {
            return res.status(400).json({ error: 'No vulnbox VPN config found for this team' });
        }

        // Extract net host from IP (last octet)
        // Example: 192.168.199.18 -> 18
        const ipParts = vpnConfig.ipVpn.split('.');
        if (ipParts.length !== 4) {
            return res.status(400).json({ error: 'Invalid IP format' });
        }

        const netValue = parseInt(ipParts[3]);
        if (isNaN(netValue)) {
            return res.status(400).json({ error: 'Invalid IP octets' });
        }

        // Update team's net column
        await team.update({ net: netValue });

        console.log(`✓ Updated team ${teamId} net value: ${netValue} (from IP: ${vpnConfig.ipVpn})`);

        res.json({
            success: true,
            message: 'Net value generated successfully',
            data: {
                teamId: teamId,
                teamName: team.name,
                ipVpn: vpnConfig.ipVpn,
                netValue: netValue
            }
        });
    } catch (error) {
        console.error('Error generating team net:', error);
        res.status(500).json({ error: 'Failed to generate net value: ' + error.message });
    }
};

// Generate net values for all teams
exports.generateAllTeamNets = async (req, res) => {
    try {
        const { Team, VPNTeam } = require('../models');

        // Get all teams
        const teams = await Team.findAll();
        if (!teams || teams.length === 0) {
            return res.status(400).json({ error: 'No teams found' });
        }

        const updated = [];
        const skipped = [];

        // Process each team
        for (const team of teams) {
            try {
                // Find vulnbox VPN config (typeVpn = true)
                const vpnConfig = await VPNTeam.findOne({
                    where: {
                        idTeam: team.id,
                        typeVpn: true
                    }
                });

                if (!vpnConfig || !vpnConfig.ipVpn) {
                    skipped.push({
                        teamId: team.id,
                        teamName: team.name,
                        reason: 'No vulnbox VPN config'
                    });
                    continue;
                }

                // Extract net host from IP (last octet)
                const ipParts = vpnConfig.ipVpn.split('.');
                if (ipParts.length !== 4) {
                    skipped.push({
                        teamId: team.id,
                        teamName: team.name,
                        reason: 'Invalid IP format'
                    });
                    continue;
                }

                const netValue = parseInt(ipParts[3]);
                if (isNaN(netValue)) {
                    skipped.push({
                        teamId: team.id,
                        teamName: team.name,
                        reason: 'Invalid IP octets'
                    });
                    continue;
                }

                // Update team's net column
                await team.update({ net: netValue });

                updated.push({
                    teamId: team.id,
                    teamName: team.name,
                    ipVpn: vpnConfig.ipVpn,
                    netValue: netValue,
                    previousNet: team.net
                });

                console.log(`✓ Updated team ${team.id} (${team.name}) net value: ${netValue} (from IP: ${vpnConfig.ipVpn})`);

            } catch (error) {
                console.error(`Error processing team ${team.id}:`, error);
                skipped.push({
                    teamId: team.id,
                    teamName: team.name,
                    reason: error.message
                });
            }
        }

        res.json({
            success: true,
            message: `Generated net values for ${updated.length} teams`,
            data: {
                updated,
                skipped,
                totalProcessed: teams.length
            }
        });
    } catch (error) {
        console.error('Error generating all team nets:', error);
        res.status(500).json({ error: 'Failed to generate net values: ' + error.message });
    }
};

// Get user page
exports.getUserPage = async (req, res) => {
    try {
        const { User } = require('../models');

        const users = await User.findAll().catch(() => []);

        res.render('user-page', {
            username: req.session.username || 'Admin',
            users: users || []
        });
    } catch (error) {
        console.error('Error rendering user page:', error);
        res.render('user-page', {
            username: req.session.username || 'Admin',
            users: [],
            error: 'Failed to load users data'
        });
    }
};

// Get test page
exports.getTestPage = async (req, res) => {
    try {
        res.render('test-page', {
            username: req.session.username || 'Admin',
            testResults: {
                database: true,
                api: true,
                session: true
            }
        });
    } catch (error) {
        console.error('Error rendering test page:', error);
        res.render('test-page', {
            username: req.session.username || 'Admin',
            testResults: {
                database: false,
                api: false,
                session: false
            },
            error: 'Failed to load test page'
        });
    }
};

exports.getScoreboardPage = async (req, res) => {
    try {
        res.render('scoreboard-page', {
            username: req.session.username || 'Admin'
        });
    } catch (error) {
        console.error('Error rendering scoreboard page:', error);
        res.render('error', {
            message: 'Failed to load scoreboard',
            error: error
        });
    }
};

/**
 * Get scoreboard API data
 * @route GET /admin/scoreboard-data
 */
exports.getScoreboard = async (req, res) => {
    try {
        const sequelize = require('../config/database');

        // Get current tick from competition
        const competitionResult = await sequelize.query(`
            SELECT current_tick
            FROM competition
            LIMIT 1
        `, { type: sequelize.QueryTypes.SELECT });

        const currentTick = competitionResult.length > 0 ? (competitionResult[0].current_tick || 0) : 0;

        // Get all services (not just those with scores)
        const allServicesResult = await sequelize.query(`
            SELECT id, name
            FROM scoring_service
            ORDER BY name ASC
        `, { type: sequelize.QueryTypes.SELECT });

        const services = allServicesResult.map(s => s.name);

        // Get all scoreboard data with status
        const scoreboardData = await sequelize.query(`
            SELECT 
                ss.attack,
                ss.defense,
                ss.sla,
                ss.total,
                ss.service_id,
                ss.team_id,
                t.name as team_name,
                t.images as team_images,
                t.country as team_country,
                s.name as service_name
            FROM scoring_scoreboard ss
            LEFT JOIN teams t ON ss.team_id = t.id
            LEFT JOIN scoring_service s ON ss.service_id = s.id
            ORDER BY ss.team_id ASC, ss.service_id ASC
        `, { type: sequelize.QueryTypes.SELECT });

        if (!scoreboardData || scoreboardData.length === 0) {
            return res.json({
                teams: [],
                services: services,
                latestTick: currentTick
            });
        }

        // Group by team
        const teamMap = {};

        scoreboardData.forEach(row => {
            const teamName = row.team_name || `Team ${row.team_id}`;
            const serviceName = row.service_name || `Service ${row.service_id}`;

            if (!teamMap[row.team_id]) {
                teamMap[row.team_id] = {
                    id: row.team_id,
                    name: teamName,
                    images: row.team_images,
                    country: row.team_country,
                    services: {},
                    totalAttack: 0,
                    totalDefense: 0,
                    totalSla: 0
                };

                // Initialize all services with 0 values for each team
                services.forEach(svc => {
                    teamMap[row.team_id].services[svc] = {
                        attack: 0,
                        defense: 0,
                        sla: 0
                    };
                });
            }

            // Update with actual data
            teamMap[row.team_id].services[serviceName] = {
                attack: row.attack || 0,
                defense: row.defense || 0,
                sla: row.sla || 0
            };

            teamMap[row.team_id].totalAttack += row.attack || 0;
            teamMap[row.team_id].totalDefense += row.defense || 0;
            teamMap[row.team_id].totalSla += row.sla || 0;
        });

        // Convert to array and sort by total score
        const teams = Object.values(teamMap).map(team => {
            team.totalScore = team.totalAttack + team.totalDefense + team.totalSla;
            return team;
        }).sort((a, b) => b.totalScore - a.totalScore);

        console.log('[SCOREBOARD] Services:', services);
        console.log('[SCOREBOARD] Teams count:', teams.length);
        console.log('[SCOREBOARD] Current tick:', currentTick);
        if (teams.length > 0) {
            console.log('[SCOREBOARD] Team 0 services:', JSON.stringify(teams[0].services));
        }

        res.json({
            teams,
            services,
            latestTick: currentTick
        });
    } catch (error) {
        console.error('Error fetching scoreboard:', error);
        res.status(500).json({
            error: 'Failed to fetch scoreboard data'
        });
    }
};

/**
 * Generate VPN configs for teams (vulnbox)
 */
exports.generateVpnTeamsVulnbox = async (req, res) => {
    try {
        const scriptPath = path.join(__dirname, '../cli/vpn/vpn-status-vulnbox.py');
        console.log('[VPN-VULNBOX] Starting VPN vulnbox generation...');
        const python = spawn('python3', [scriptPath], {
            cwd: path.join(__dirname, '../cli/vpn')
        });

        let output = '';
        let errorOutput = '';

        python.stdout.on('data', (data) => {
            output += data.toString();
            console.log(`[VPN-VULNBOX-STDOUT] ${data}`);
        });

        python.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.error(`[VPN-VULNBOX-STDERR] ${data}`);
        });

        python.on('error', (err) => {
            console.error('[VPN-VULNBOX-ERROR] Process error:', err);
            res.json({
                success: false,
                message: 'Failed to spawn python process',
                error: err.message
            });
        });

        python.on('close', (code) => {
            console.log(`[VPN-VULNBOX] Process exited with code ${code}`);
            if (code === 0) {
                res.json({
                    success: true,
                    message: 'VPN vulnbox generation completed',
                    output: output
                });
            } else {
                res.json({
                    success: false,
                    message: `VPN vulnbox generation failed with exit code ${code}`,
                    error: errorOutput || output
                });
            }
        });
    } catch (error) {
        console.error('Error generating VPN vulnbox:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating VPN vulnbox',
            error: error.message
        });
    }
};

/**
 * Generate VPN configs for teams (testbox)
 */
exports.generateVpnTeamsTestbox = async (req, res) => {
    try {
        const scriptPath = path.join(__dirname, '../cli/vpn/vpn-status-testbox.py');
        console.log('[VPN-TESTBOX] Starting VPN testbox generation...');
        const python = spawn('python3', [scriptPath], {
            cwd: path.join(__dirname, '../cli/vpn')
        });

        let output = '';
        let errorOutput = '';

        python.stdout.on('data', (data) => {
            output += data.toString();
            console.log(`[VPN-TESTBOX-STDOUT] ${data}`);
        });

        python.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.error(`[VPN-TESTBOX-STDERR] ${data}`);
        });

        python.on('error', (err) => {
            console.error('[VPN-TESTBOX-ERROR] Process error:', err);
            res.json({
                success: false,
                message: 'Failed to spawn python process',
                error: err.message
            });
        });

        python.on('close', (code) => {
            console.log(`[VPN-TESTBOX] Process exited with code ${code}`);
            if (code === 0) {
                res.json({
                    success: true,
                    message: 'VPN testbox generation completed',
                    output: output
                });
            } else {
                res.json({
                    success: false,
                    message: `VPN testbox generation failed with exit code ${code}`,
                    error: errorOutput || output
                });
            }
        });
    } catch (error) {
        console.error('Error generating VPN testbox:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating VPN testbox',
            error: error.message
        });
    }
};

/**
 * Generate VPN configs for users
 */
exports.generateVpnUsers = async (req, res) => {
    try {
        const scriptPath = path.join(__dirname, '../cli/vpn/vpn-status-user.py');
        console.log('[VPN-USER] Starting VPN user generation...');
        console.log('[VPN-USER] Script path:', scriptPath);
        console.log('[VPN-USER] Working directory:', path.join(__dirname, '../cli/vpn'));

        const python = spawn('python3', [scriptPath], {
            cwd: path.join(__dirname, '../cli/vpn')
        });

        let output = '';
        let errorOutput = '';

        python.stdout.on('data', (data) => {
            output += data.toString();
            console.log(`[VPN-USER-STDOUT] ${data}`);
        });

        python.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.error(`[VPN-USER-STDERR] ${data}`);
        });

        python.on('error', (err) => {
            console.error('[VPN-USER-ERROR] Process error:', err);
            res.json({
                success: false,
                message: 'Failed to spawn python process',
                error: err.message
            });
        });

        python.on('close', (code) => {
            console.log(`[VPN-USER] Process exited with code ${code}`);
            if (code === 0) {
                res.json({
                    success: true,
                    message: 'VPN user generation completed',
                    output: output
                });
            } else {
                res.json({
                    success: false,
                    message: `VPN user generation failed with exit code ${code}`,
                    error: errorOutput || output
                });
            }
        });
    } catch (error) {
        console.error('Error generating VPN users:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating VPN users',
            error: error.message
        });
    }
};

/**
 * Download VPN config file - SECURE endpoint
 * @route GET /admin/download-vpn/:vpnId/:type
 * @security Validates file path to prevent directory traversal attacks
 */
exports.downloadVpnConfig = async (req, res) => {
    const fs = require('fs');

    try {
        const { vpnId, type } = req.params;
        const { VPNTeam, VPNUser } = require('../models');

        // Validate parameters
        if (!vpnId || !type) {
            return res.status(400).json({ error: 'Invalid vpnId or type' });
        }

        if (!['team', 'user'].includes(type)) {
            return res.status(400).json({ error: 'Invalid type. Must be "team" or "user"' });
        }

        // Fetch VPN record from database
        let vpnRecord;
        if (type === 'team') {
            vpnRecord = await VPNTeam.findByPk(vpnId);
        } else {
            vpnRecord = await VPNUser.findByPk(vpnId);
        }

        // Check if record exists
        if (!vpnRecord) {
            return res.status(404).json({ error: 'VPN config not found' });
        }

        // Check if file path exists
        if (!vpnRecord.path) {
            return res.status(404).json({ error: 'No file path configured for this VPN' });
        }

        // Normalize path from database: convert ./data/vpn-config/ to ./cli/data/vpn-config/
        let normalizedPath = vpnRecord.path;
        if (normalizedPath.startsWith('./data/vpn-config/')) {
            normalizedPath = './cli/data/vpn-config/' + normalizedPath.substring('./data/vpn-config/'.length);
        }

        // Define allowed base directories
        const allowedBaseDirs = [
            path.resolve(__dirname, '../cli/data/vpn-config')
        ];

        // Resolve and validate the path
        const filePath = path.resolve(__dirname, '../' + normalizedPath);

        // Security check: Ensure file is within allowed directories (prevent directory traversal)
        let isAllowed = false;
        for (const baseDir of allowedBaseDirs) {
            if (filePath.startsWith(baseDir)) {
                isAllowed = true;
                break;
            }
        }

        if (!isAllowed) {
            console.error(`[SECURITY] Denied access to file outside allowed directories: ${filePath}`);
            return res.status(403).json({ error: 'Access denied - file location not permitted' });
        }

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            console.error(`[VPN-DOWNLOAD] File not found: ${filePath}`);
            return res.status(404).json({ error: 'VPN config file not found on server' });
        }

        // Check if path is a file (not directory)
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) {
            console.error(`[VPN-DOWNLOAD] Path is not a file: ${filePath}`);
            return res.status(400).json({ error: 'Invalid file path' });
        }

        // Get filename and sanitize it
        let filename = vpnRecord.nameVpn || path.basename(filePath);
        // Remove any dangerous characters from filename
        filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        // Ensure .conf extension
        if (!filename.endsWith('.conf')) {
            filename += '.conf';
        }

        // Set response headers for file download
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        // Stream file to client
        const fileStream = fs.createReadStream(filePath);

        fileStream.on('error', (err) => {
            console.error(`[VPN-DOWNLOAD] Error reading file: ${filePath}`, err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error reading file' });
            }
        });

        fileStream.pipe(res);

        console.log(`[VPN-DOWNLOAD] Successfully downloaded: ${filename} (${type}, ID: ${vpnId}) from ${filePath}`);

    } catch (error) {
        console.error('[VPN-DOWNLOAD] Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed: ' + error.message });
        }
    }
};

/**
 * Reset competition data - truncate all scoring tables and reset tick to 0
 * @route POST /admin/competition-reset
 */
exports.resetCompetitionData = async (req, res) => {
    const sequelize = require('../config/database');

    try {
        // Only allow POST and check for confirmation
        if (req.body.confirm !== 'true') {
            return res.status(400).json({
                success: false,
                error: 'Reset confirmation required'
            });
        }

        // Execute delete to clear data - IMPORTANT: Delete child tables before parent tables
        // scoring_capture has foreign key to scoring_flag, so delete it first
        await sequelize.query(`DELETE FROM scoring_capture`);
        await sequelize.query(`DELETE FROM scoring_flag`);
        await sequelize.query(`DELETE FROM scoring_statuscheck`);
        await sequelize.query(`DELETE FROM scoring_checkerstate`);
        await sequelize.query(`DELETE FROM scoring_scoreboard`);

        await sequelize.query(`
            UPDATE scoring_gamecontrol SET current_tick = 0, cancel_checks = false
        `);

        console.log('[RESET] Competition data reset successfully');

        return res.json({
            success: true,
            message: 'Đã xóa dữ liệu cuộc thi! Tick reset về 0.'
        });

    } catch (error) {
        console.error('[RESET] Error resetting competition:', error);
        return res.status(500).json({
            success: false,
            error: 'Lỗi khi xử lý dữ liệu'
        });
    }
};

/**
 * Run Python test script and capture output
 */
function runPythonTest(scriptName) {
    return new Promise((resolve) => {
        const logs = [];
        const scriptPath = path.join(__dirname, '../cli/testing', scriptName);

        try {
            const python = spawn('python3', [scriptPath], {
                timeout: 30000
            });

            let stdout = '';
            let stderr = '';

            python.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            python.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            python.on('close', (code) => {
                // Parse JSON logs from stdout (top to bottom)
                const lines = stdout.trim().split('\n');

                // Iterate through lines from first to last (top to bottom)
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.trim()) {
                        try {
                            const log = JSON.parse(line);
                            logs.push({
                                level: log.level || 'info',
                                message: log.message || line,
                                timestamp: log.timestamp
                            });
                        } catch (e) {
                            // If not JSON, add as raw text
                            logs.push({
                                level: 'info',
                                message: line
                            });
                        }
                    }
                }

                if (stderr.trim()) {
                    logs.push({
                        level: 'error',
                        message: stderr.trim()
                    });
                }

                // Ensure logs are in chronological order (from first to last)
                // Don't reverse - keep the order as they were printed
                resolve(logs);
            });

            python.on('error', (err) => {
                logs.push({
                    level: 'error',
                    message: `Failed to execute test: ${err.message}`
                });
                resolve(logs);
            });
        } catch (err) {
            logs.push({
                level: 'error',
                message: `Failed to spawn Python process: ${err.message}`
            });
            resolve(logs);
        }
    });
}

/**
 * Test Wireguard
 * @route POST /admin/test/wireguard
 */
exports.testWireguard = async (req, res) => {
    try {
        const logs = await runPythonTest('test_wireguard.py');
        res.json({ logs });
    } catch (error) {
        console.error('Error in testWireguard:', error);
        res.status(500).json({
            error: 'Failed to run Wireguard test',
            logs: [{ level: 'error', message: error.message }]
        });
    }
};

/**
 * Start services
 * @route POST /admin/test/start
 */
exports.testStart = async (req, res) => {
    try {
        const logs = await runPythonTest('start_services.py');
        res.json({ logs });
    } catch (error) {
        console.error('Error in testStart:', error);
        res.status(500).json({
            error: 'Failed to start services',
            logs: [{ level: 'error', message: error.message }]
        });
    }
};

/**
 * Stop services
 * @route POST /admin/test/stop
 */
exports.testStop = async (req, res) => {
    try {
        const logs = await runPythonTest('stop_services.py');
        res.json({ logs });
    } catch (error) {
        console.error('Error in testStop:', error);
        res.status(500).json({
            error: 'Failed to stop services',
            logs: [{ level: 'error', message: error.message }]
        });
    }
};

/**
 * Test services connectivity
 * @route POST /admin/test/connectivity
 */
exports.testConnectivity = async (req, res) => {
    try {
        const logs = await runPythonTest('test_services_connectivity.py');
        res.json({ logs });
    } catch (error) {
        console.error('Error in testConnectivity:', error);
        res.status(500).json({
            error: 'Failed to test services connectivity',
            logs: [{ level: 'error', message: error.message }]
        });
    }
};
