const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const VPNUser = sequelize.define('VPNUser', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    idUser: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    idTeam: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'teams',
            key: 'id'
        }
    },
    nameVpn: {
        type: DataTypes.STRING(255),
        allowNull: true
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
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'vpn_users',
    timestamps: true
});

module.exports = VPNUser;
