const { exec } = require('child_process');
const { promisify } = require('util');
const sequelize = require('../config/database');
const { VPNTeam, Team } = require('../models');

const execAsync = promisify(exec);

/**
 * VPN Status Service - Monitor and update VPN connection status
 * Pings each VPN IP and updates status in database
 */

class VPNStatusService {
    constructor(options = {}) {
        this.interval = options.interval || 60000; // Default: 60 seconds
        this.maxRetries = options.maxRetries || 3;
        this.timeout = options.timeout || 5000;
        this.isRunning = false;
        this.lastUpdate = null;
    }

    /**
     * Ping an IP address and return true if reachable
     * @param {string} ip - IP address to ping
     * @returns {Promise<boolean>}
     */
    async pingIP(ip) {
        try {
            // Use ping command with timeout
            const cmd = `ping -c 1 -W ${this.timeout / 1000} ${ip}`;
            const { stdout, stderr } = await execAsync(cmd, { 
                timeout: this.timeout + 2000,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            if (stdout.includes('1 received')) {
                return true;
            }
            return false;
        } catch (error) {
            // Timeout or connection refused is expected for offline IPs
            return false;
        }
    }

    /**
     * Check all VPN IPs and update their status
     * @returns {Promise<Object>} - Statistics of the check
     */
    async checkAllVPNs() {
        try {
            console.log(`\n[${new Date().toLocaleString()}] Starting VPN status check...`);

            // Get all VPN teams with their IP addresses
            const vpnTeams = await VPNTeam.findAll({
                attributes: ['id', 'idTeam', 'nameVpn', 'ipVpn', 'statusVpn'],
                where: {
                    ipVpn: {
                        [sequelize.Sequelize.Op.ne]: null
                    }
                },
                include: [{
                    model: Team,
                    as: 'team',
                    attributes: ['id', 'name']
                }]
            });

            if (vpnTeams.length === 0) {
                console.log('⚠ No VPN teams with IP addresses found');
                return { total: 0, online: 0, offline: 0 };
            }

            console.log(`Found ${vpnTeams.length} VPN teams to check`);

            let online = 0;
            let offline = 0;
            const updates = [];

            // Check each VPN IP
            for (const vpnTeam of vpnTeams) {
                try {
                    const isOnline = await this.pingIP(vpnTeam.ipVpn);
                    const newStatus = isOnline ? 'online' : 'offline';
                    const oldStatus = vpnTeam.statusVpn;

                    // Update if status changed
                    if (oldStatus !== newStatus) {
                        updates.push({
                            vpnTeamId: vpnTeam.id,
                            teamName: vpnTeam.team?.name || 'Unknown',
                            vpnName: vpnTeam.nameVpn,
                            ip: vpnTeam.ipVpn,
                            oldStatus,
                            newStatus,
                            timestamp: new Date()
                        });

                        // Update in database
                        await VPNTeam.update(
                            { statusVpn: newStatus },
                            { where: { id: vpnTeam.id } }
                        );

                        const statusEmoji = newStatus === 'online' ? '✓' : '✗';
                        console.log(
                            `  ${statusEmoji} ${vpnTeam.team?.name} (${vpnTeam.nameVpn}): ` +
                            `${vpnTeam.ipVpn} -> ${oldStatus} → ${newStatus}`
                        );
                    }

                    if (isOnline) {
                        online++;
                    } else {
                        offline++;
                    }
                } catch (error) {
                    console.error(
                        `  ✗ Error checking ${vpnTeam.nameVpn} (${vpnTeam.ipVpn}): ${error.message}`
                    );
                    offline++;
                }
            }

            this.lastUpdate = new Date();

            const stats = {
                total: vpnTeams.length,
                online,
                offline,
                updated: updates.length,
                changes: updates
            };

            console.log(
                `✓ Check completed: ${online} online, ${offline} offline, ` +
                `${updates.length} status changes`
            );

            return stats;
        } catch (error) {
            console.error('✗ Error in checkAllVPNs:', error);
            return { error: error.message };
        }
    }

    /**
     * Start the continuous VPN status monitoring service
     * @returns {Promise<void>}
     */
    async start() {
        if (this.isRunning) {
            console.log('⚠ VPN Status Service is already running');
            return;
        }

        console.log(`Starting VPN Status Service (interval: ${this.interval}ms)`);

        try {
            // Verify database connection
            await sequelize.authenticate();
            console.log('✓ Database connection verified');
        } catch (error) {
            console.error('✗ Database connection failed:', error);
            process.exit(1);
        }

        this.isRunning = true;

        // Run initial check immediately
        await this.checkAllVPNs();

        // Schedule periodic checks
        this.intervalId = setInterval(async () => {
            try {
                await this.checkAllVPNs();
            } catch (error) {
                console.error('✗ Error during scheduled check:', error);
            }
        }, this.interval);

        console.log('✓ VPN Status Service started successfully');
    }

    /**
     * Stop the VPN status monitoring service
     * @returns {void}
     */
    stop() {
        if (!this.isRunning) {
            console.log('⚠ VPN Status Service is not running');
            return;
        }

        if (this.intervalId) {
            clearInterval(this.intervalId);
        }

        this.isRunning = false;
        console.log('✓ VPN Status Service stopped');
    }

    /**
     * Get current service status
     * @returns {Object}
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            interval: this.interval,
            lastUpdate: this.lastUpdate,
            uptime: this.isRunning ? process.uptime() : null
        };
    }

    /**
     * Get all current VPN statuses
     * @returns {Promise<Array>}
     */
    async getAllStatus() {
        try {
            const vpnTeams = await VPNTeam.findAll({
                attributes: ['id', 'nameVpn', 'ipVpn', 'statusVpn', 'updatedAt'],
                include: [{
                    model: Team,
                    as: 'team',
                    attributes: ['id', 'name']
                }],
                order: [['updatedAt', 'DESC']]
            });

            return vpnTeams;
        } catch (error) {
            console.error('Error getting VPN statuses:', error);
            return [];
        }
    }
}

module.exports = VPNStatusService;
