const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ScoringScoreboard = sequelize.define('scoring_scoreboard', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    team: {
        type: DataTypes.STRING,
        allowNull: true
    },
    service: {
        type: DataTypes.STRING,
        allowNull: true
    },
    attack: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0
    },
    defense: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0
    },
    sla: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0
    },
    tick: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'scoring_scoreboard',
    timestamps: false
});

module.exports = ScoringScoreboard;
