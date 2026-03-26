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
        // Use force: true to drop and recreate tables with proper sequences
        // This ensures auto-increment IDs work correctly in PostgreSQL
        await sequelize.sync({ force: true });
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
