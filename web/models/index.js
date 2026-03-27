const sequelize = require('../config/database');
const User = require('./userModel');
const Team = require('./teamModel');

// Define relationships
Team.hasMany(User, { foreignKey: 'teamId', as: 'members' });
User.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });

const syncModels = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connection established successfully.');
        // Use alter: true to modify existing tables to match models
        // This adds/updates columns without dropping data
        await sequelize.sync({ alter: true });
        console.log('All models synchronized successfully.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
        throw error;
    }
};

module.exports = {
    sequelize,
    User,
    Team,
    syncModels
};
