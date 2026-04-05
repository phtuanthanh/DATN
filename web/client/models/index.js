const sequelize = require('../config/database');
const User = require('./userModel');
const Team = require('./teamModel');
const VPNTeam = require('./vpnTeamModel');
const VPNUser = require('./vpnUserModel');

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
        // Use alter: false to skip schema modification
        // Models should match existing database schema
        await sequelize.sync({ alter: false });
        console.log('All models synchronized successfully.');
    } catch (error) {
        const errorMsg = `Database error: ${error.message || 'Unable to connect to the database'}`;
        console.error(errorMsg);
        return { success: false, error: errorMsg };
    }
};

module.exports = {
    sequelize,
    User,
    Team,
    VPNTeam,
    VPNUser,
    syncModels
};
