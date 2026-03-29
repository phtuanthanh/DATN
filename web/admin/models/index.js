const sequelize = require('../config/database');

// Import models from client (shared models)
const User = require('../../client/models/userModel');
const Team = require('../../client/models/teamModel');
const VPNTeam = require('../../client/models/vpnTeamModel');
const VPNUser = require('../../client/models/vpnUserModel');
const ScoringGamecontrol = require('./scoringGamecontrol');
const ScoringScoreboard = require('./scoringScoreboard');
const ScoringService = require('./scoringService');

// Define relationships
Team.hasMany(User, { foreignKey: 'teamId', as: 'members' });
User.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });

// VPN Team relationships
Team.hasMany(VPNTeam, { foreignKey: 'idTeam', as: 'vpnConfigs' });
VPNTeam.belongsTo(Team, { foreignKey: 'idTeam', as: 'team' });
User.hasMany(VPNTeam, { foreignKey: 'idUser', as: 'vpnTeamConfigs' });
VPNTeam.belongsTo(User, { foreignKey: 'idUser', as: 'creator' });

// VPN User relationships
User.hasMany(VPNUser, { foreignKey: 'idUser', as: 'vpnUserConfigs' });
VPNUser.belongsTo(User, { foreignKey: 'idUser', as: 'user' });
Team.hasMany(VPNUser, { foreignKey: 'idTeam', as: 'vpnUserConfigs' });
VPNUser.belongsTo(Team, { foreignKey: 'idTeam', as: 'userTeam' });

const syncModels = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connection established successfully.');

        // Sync only models we own - exclude read-only tables like scoring_gamecontrol
        const modelsToSync = [User, Team, VPNTeam, VPNUser];
        for (const model of modelsToSync) {
            await model.sync({ alter: false });
        }

        console.log('All owned models synchronized successfully.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
        throw error;
    }
};

module.exports = {
    sequelize,
    User,
    Team,
    VPNTeam,
    VPNUser,
    ScoringGamecontrol,
    ScoringScoreboard,
    ScoringService,
    syncModels
};
