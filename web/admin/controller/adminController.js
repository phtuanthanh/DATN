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
            cwd: path.join(__dirname, '../cli')
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
                cwd: path.join(__dirname, '../cli'),
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
                    { model: User, as: 'user', attributes: ['id', 'username'] },
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
        const { Team } = require('../models');

        const teams = await Team.findAll().catch(() => []);

        res.render('team-page', {
            username: req.session.username || 'Admin',
            teams: teams || []
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

// Get scoreboard data
exports.getScoreboard = async (req, res) => {
    try {
        const { ScoringScoreboard, Team } = require('../models');

        // Fetch all scoreboard entries
        const scoreboardData = await ScoringScoreboard.findAll({
            order: [['tick', 'DESC']]
        }).catch(() => []);

        if (!scoreboardData || scoreboardData.length === 0) {
            return res.json({
                teams: []
            });
        }

        // Get latest tick
        const latestTick = scoreboardData[0].dataValues.tick || 0;

        // Filter data for latest tick only
        const latestData = scoreboardData.filter(d => d.dataValues.tick === latestTick);

        // Group by team
        const teamMap = {};
        const serviceList = new Set();

        latestData.forEach(row => {
            const teamName = row.dataValues.team;
            const serviceName = row.dataValues.service;

            serviceList.add(serviceName);

            if (!teamMap[teamName]) {
                teamMap[teamName] = {
                    name: teamName,
                    services: {},
                    totalAttack: 0,
                    totalDefense: 0,
                    totalSla: 0
                };
            }

            teamMap[teamName].services[serviceName] = {
                attack: row.dataValues.attack || 0,
                defense: row.dataValues.defense || 0,
                sla: row.dataValues.sla || 0
            };

            teamMap[teamName].totalAttack += row.dataValues.attack || 0;
            teamMap[teamName].totalDefense += row.dataValues.defense || 0;
            teamMap[teamName].totalSla += row.dataValues.sla || 0;
        });

        // Convert to array and sort by total score
        const teams = Object.values(teamMap).map(team => {
            team.totalScore = team.totalAttack + team.totalDefense + team.totalSla;
            return team;
        }).sort((a, b) => b.totalScore - a.totalScore);

        res.json({
            teams,
            services: Array.from(serviceList).sort(),
            latestTick
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
        const scriptPath = path.join(__dirname, '../cli/vpn-status-vulnbox.py');
        console.log('[VPN-VULNBOX] Starting VPN vulnbox generation...');
        const python = spawn('python3', [scriptPath], {
            cwd: path.join(__dirname, '../cli')
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
        const scriptPath = path.join(__dirname, '../cli/vpn-status-testbox.py');
        console.log('[VPN-TESTBOX] Starting VPN testbox generation...');
        const python = spawn('python3', [scriptPath], {
            cwd: path.join(__dirname, '../cli')
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
        const scriptPath = path.join(__dirname, '../cli/vpn-status-user.py');
        console.log('[VPN-USER] Starting VPN user generation...');
        console.log('[VPN-USER] Script path:', scriptPath);
        console.log('[VPN-USER] Working directory:', path.join(__dirname, '../cli'));

        const python = spawn('python3', [scriptPath], {
            cwd: path.join(__dirname, '../cli')
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
