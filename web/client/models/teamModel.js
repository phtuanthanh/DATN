const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Team = sequelize.define('Team', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
    },
    country: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    education: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    images: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    teamKey: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    maxMembers: {
        type: DataTypes.INTEGER,
        defaultValue: 5
    },
    net: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    slug_team: {
        type: DataTypes.STRING(255),
        allowNull: true,
        unique: true,
        comment: 'Format: AD_<id_team>_<name_team>'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'teams',
    timestamps: true
});

module.exports = Team;
