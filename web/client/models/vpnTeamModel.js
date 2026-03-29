const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const VPNTeam = sequelize.define('VPNTeam', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    idTeam: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'teams',
            key: 'id'
        }
    },
    idUser: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    nameVpn: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true
    },
    path: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    ipVpn: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    statusVpn: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    typeVpn: {
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
    tableName: 'vpn_teams',
    timestamps: true
});

module.exports = VPNTeam;
