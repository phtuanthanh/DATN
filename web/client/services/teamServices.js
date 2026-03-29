const { User, Team, VPNTeam } = require('../models');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const fileValidator = require('../utils/fileValidator');

const UPLOAD_DIR = path.join(__dirname, '../public/uploads/teams');

/**
 * Ensure upload directory exists
 */
const ensureUploadDir = () => {
    try {
        if (!fs.existsSync(UPLOAD_DIR)) {
            fs.mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o755 });
        }
    } catch (error) {
        console.error('Failed to create upload directory:', error);
    }
};

/**
 * Generate a unique team key
 * @returns {string} Generated team key
 */
const generateTeamKey = () => {
    return crypto.randomBytes(8).toString('hex').toUpperCase();
};

/**
 * Validate team name - only allow alphanumeric characters (letters and numbers)
 * @param {string} name - Team name to validate
 * @returns {object} Validation result with valid status and error message
 */
const validateTeamName = (name) => {
    if (!name || name.trim().length === 0) {
        return {
            valid: false,
            error: 'Team name is required'
        };
    }

    // Allow only letters (a-z, A-Z) and numbers (0-9)
    const alphanumericRegex = /^[a-zA-Z0-9]+$/;
    if (!alphanumericRegex.test(name.trim())) {
        return {
            valid: false,
            error: 'Team name can only contain letters and numbers'
        };
    }

    return {
        valid: true
    };
};

/**
 * Generate VPN names for team
 * Format: AD_<id_team>_<nameteam>
 * @param {number} teamId - Team ID
 * @param {string} teamName - Team name (should be sanitized - alphanumeric)
 * @returns {object} Object with vpn names for type true and false
 */
const generateVpnNames = (teamId, teamName) => {
    const sanitizedName = teamName.trim().replace(/[^a-zA-Z0-9]/g, '');
    return {
        typeTrue: `AD_${teamId}_${sanitizedName}_1`,
        typeFalse: `AD_${teamId}_${sanitizedName}_2`
    };
};

/**
 * Handle team image upload (similar to avatar upload)
 * @param {object} file - Uploaded file object from multer
 * @returns {object} Result object with success status and path/error
 */
const handleTeamImageUpload = (file, oldImagePath) => {
    if (!file) {
        return {
            success: false,
            error: 'No file provided'
        };
    }

    try {
        console.log('[TEAM-IMG] Starting team image upload...');
        ensureUploadDir();

        // Validate file
        const validation = fileValidator.validateUploadFile(file, UPLOAD_DIR);

        if (!validation.valid) {
            console.warn(`Team image upload validation failed: ${validation.error}`, {
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: file.size
            });

            return {
                success: false,
                error: validation.error
            };
        }

        // Build safe destination path
        const safeFilename = validation.filename;
        const destPath = path.join(UPLOAD_DIR, safeFilename);

        // Write file from buffer (memory storage) or move from temp path (disk storage)
        if (file.buffer) {
            // Memory storage - write buffer directly
            try {
                const dir = path.dirname(destPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
                }
                fs.writeFileSync(destPath, file.buffer, { mode: 0o644 });
            } catch (error) {
                return {
                    success: false,
                    error: 'Failed to save file'
                };
            }
        } else if (file.path) {
            // Disk storage - move file from temp location
            const moveSuccess = fileValidator.moveUploadedFile(file.path, destPath);
            if (!moveSuccess) {
                return {
                    success: false,
                    error: 'Failed to save file'
                };
            }
        } else {
            return {
                success: false,
                error: 'Invalid file storage format'
            };
        }

        // Delete old team image if it exists using safe deletion function
        if (oldImagePath) {
            const deleteSuccess = fileValidator.deleteUploadedFile(UPLOAD_DIR, oldImagePath);
            if (deleteSuccess) {
                console.log(`Old team image deleted successfully`);
            } else {
                console.warn(`Could not delete old team image: ${oldImagePath}`);
                // Continue with upload even if delete fails
            }
        }

        // Return safe public path
        const publicPath = `/uploads/teams/${safeFilename}`;

        return {
            success: true,
            path: publicPath
        };

    } catch (error) {
        console.error('Team image upload error:', error);

        // Clean up temp file on error
        try {
            if (file && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        } catch (cleanupError) {
            console.error('Temp file cleanup error:', cleanupError);
        }

        return {
            success: false,
            error: 'System error during file upload'
        };
    }
};

/**
 * Create a new team
 * @param {object} teamData - Team data (name, country, education, images, etc.)
 * @param {number} userId - User ID of the team creator
 * @returns {object} Result object with success status and data/message
 */
const createTeam = async (teamData, userId) => {
    let transaction = null;
    try {
        // Get sequelize instance to create transaction
        const sequelize = require('../config/database');
        transaction = await sequelize.transaction();

        const user = await User.findByPk(userId, { transaction });

        if (!user) {
            await transaction.rollback();
            return {
                success: false,
                message: 'User not found'
            };
        }

        if (user.teamId) {
            await transaction.rollback();
            return {
                success: false,
                message: 'You are already in a team'
            };
        }

        // Validate team name (alphanumeric only)
        const nameValidation = validateTeamName(teamData.name);
        if (!nameValidation.valid) {
            await transaction.rollback();
            return {
                success: false,
                message: nameValidation.error
            };
        }

        // Generate unique team key
        const teamKey = generateTeamKey();

        // Create new team
        const newTeam = await Team.create({
            name: teamData.name.trim(),
            country: teamData.country || null,
            education: teamData.education || null,
            images: teamData.images || null,
            teamKey: teamKey,
            maxMembers: teamData.maxMembers || 5,
            description: teamData.description || null,
            isActive: true
        }, { transaction });

        // Generate VPN names
        const vpnNames = generateVpnNames(newTeam.id, newTeam.name);

        // Create two VPN Team records
        // First record: typeVpn = true
        await VPNTeam.create({
            idTeam: newTeam.id,
            idUser: userId,
            nameVpn: vpnNames.typeTrue,
            typeVpn: true
        }, { transaction });

        // Second record: typeVpn = false
        await VPNTeam.create({
            idTeam: newTeam.id,
            idUser: userId,
            nameVpn: vpnNames.typeFalse,
            typeVpn: false
        }, { transaction });

        // Add creator to team
        user.teamId = newTeam.id;
        await user.save({ transaction });

        await transaction.commit();

        return {
            success: true,
            message: 'Team created successfully',
            team: newTeam.dataValues,
            teamKey: teamKey
        };
    } catch (error) {
        if (transaction) {
            await transaction.rollback();
        }
        console.error('Create team error:', error);
        return {
            success: false,
            message: 'Error creating team'
        };
    }
};

/**
 * Get team by ID with members
 * @param {number} teamId - Team ID
 * @returns {object} Team with members or null
 */
const getTeamWithMembers = async (teamId) => {
    try {
        const team = await Team.findByPk(teamId, {
            include: [
                {
                    model: User,
                    as: 'members',
                    attributes: ['id', 'username', 'email', 'fullName', 'isActive', 'avatar']
                }
            ]
        });
        return team ? team.dataValues : null;
    } catch (error) {
        console.error('Get team with members error:', error);
        return null;
    }
};

/**
 * Get team members
 * @param {number} teamId - Team ID
 * @returns {array} Array of team members
 */
const getTeamMembers = async (teamId) => {
    try {
        const members = await User.findAll({
            where: { teamId: teamId },
            attributes: ['id', 'username', 'email', 'fullName', 'isActive', 'avatar']
        });
        return members.map(m => m.dataValues);
    } catch (error) {
        console.error('Get team members error:', error);
        return [];
    }
};

/**
 * Join team using team key
 * @param {string} teamKey - Team key
 * @param {number} userId - User ID
 * @returns {object} Result object with success status and message
 */
const joinTeamByKey = async (teamKey, userId) => {
    try {
        const user = await User.findByPk(userId);

        if (!user) {
            return {
                success: false,
                message: 'User not found'
            };
        }

        if (user.teamId) {
            return {
                success: false,
                message: 'You are already in a team'
            };
        }

        const team = await Team.findOne({ where: { teamKey: teamKey } });

        if (!team) {
            return {
                success: false,
                message: 'Invalid team key'
            };
        }

        // Check if team is full
        const memberCount = await User.count({ where: { teamId: team.id } });
        if (memberCount >= team.maxMembers) {
            return {
                success: false,
                message: 'Team is full'
            };
        }

        // Add user to team
        user.teamId = team.id;
        await user.save();

        return {
            success: true,
            message: 'Joined team successfully',
            team: team.dataValues
        };
    } catch (error) {
        console.error('Join team error:', error);
        return {
            success: false,
            message: 'Error joining team'
        };
    }
};

/**
 * Leave team
 * @param {number} userId - User ID
 * @returns {object} Result object with success status and message
 */
const leaveTeam = async (userId) => {
    try {
        const user = await User.findByPk(userId);

        if (!user) {
            return {
                success: false,
                message: 'User not found'
            };
        }

        if (!user.teamId) {
            return {
                success: false,
                message: 'You are not in any team'
            };
        }

        // Check team member count
        const team = await Team.findByPk(user.teamId);
        if (team) {
            const memberCount = await User.count({
                where: { teamId: user.teamId }
            });

            if (memberCount <= 1) {
                return {
                    success: false,
                    message: 'Cannot leave team with only 1 member. Delete the team instead.'
                };
            }
        }

        user.teamId = null;
        await user.save();

        return {
            success: true,
            message: 'Left team successfully'
        };
    } catch (error) {
        console.error('Leave team error:', error);
        return {
            success: false,
            message: 'Error leaving team'
        };
    }
};

module.exports = {
    generateTeamKey,
    validateTeamName,
    generateVpnNames,
    handleTeamImageUpload,
    createTeam,
    getTeamWithMembers,
    getTeamMembers,
    joinTeamByKey,
    leaveTeam
};
