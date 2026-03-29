const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ScoringGamecontrol = sequelize.define('scoring_gamecontrol', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    competition_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    flag_prefix: {
        type: DataTypes.STRING,
        allowNull: true
    },
    start: {
        type: DataTypes.DATE,
        allowNull: true
    },
    end: {
        type: DataTypes.DATE,
        allowNull: true
    },
    current_tick: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    valid_ticks: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    tick_duration: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    cancel_checks: {
        type: DataTypes.BOOLEAN,
        allowNull: true
    }
}, {
    tableName: 'scoring_gamecontrol',
    timestamps: false
});

module.exports = ScoringGamecontrol;
