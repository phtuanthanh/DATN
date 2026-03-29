const { ScoringGamecontrol } = require('../models');

// Get competition information
exports.getCompetition = async (req, res) => {
    try {
        const competition = await ScoringGamecontrol.findOne();

        if (!competition) {
            return res.status(404).json({ error: 'Competition not found' });
        }

        const data = {
            competitionName: competition.competition_name || 'N/A',
            flagPrefix: competition.flag_prefix || 'N/A',
            startTime: competition.start ? new Date(competition.start).toLocaleString() : 'Not set',
            endTime: competition.end ? new Date(competition.end).toLocaleString() : 'Not set',
            currentTick: competition.current_tick || 0,
            validTicks: competition.valid_ticks || 0,
            tickDuration: competition.tick_duration || 0,
            cancelChecks: competition.cancel_checks || false,
            isActive: competition.start && new Date() >= new Date(competition.start) &&
                (!competition.end || new Date() <= new Date(competition.end))
        };

        res.json(data);
    } catch (error) {
        console.error('Error fetching competition:', error);
        res.status(500).json({ error: 'Failed to fetch competition data' });
    }
};

// Get all admin statistics
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

        const competition = await ScoringGamecontrol.findOne();

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

// Get dashboard with both stats and competition info
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

        const competition = await ScoringGamecontrol.findOne();

        res.render('dashboard', {
            username: req.session.username || 'Admin',
            stats: {
                totalUsers,
                totalTeams,
                activeTeams,
                vpnTeamConfigs,
                vpnUserConfigs
            },
            competition: competition ? {
                competitionName: competition.competition_name || 'N/A',
                flagPrefix: competition.flag_prefix || 'N/A',
                startTime: competition.start ? new Date(competition.start).toLocaleString() : 'Not set',
                endTime: competition.end ? new Date(competition.end).toLocaleString() : 'Not set',
                currentTick: competition.current_tick || 0,
                validTicks: competition.valid_ticks || 0,
                tickDuration: competition.tick_duration || 0,
                cancelChecks: competition.cancel_checks || false,
                isActive: competition.start && new Date() >= new Date(competition.start) &&
                    (!competition.end || new Date() <= new Date(competition.end))
            } : null
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
