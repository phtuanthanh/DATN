const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ScoringService = sequelize.define('ScoringService', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    slug: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    margin: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    }
}, {
    tableName: 'scoring_service',
    timestamps: false,
    freezeTableName: true
});

module.exports = ScoringService;
