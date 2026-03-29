const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { User, sequelize } = require('../models');
const { Op } = require('sequelize');
const fileValidator = require('../utils/fileValidator');

const UPLOAD_DIR = path.join(__dirname, '../public/uploads/avatars');
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

/**
 * Ensure upload directory exists with safe permissions
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
 * Validate password requirements
 */
const validatePassword = (password) => {
    if (!PASSWORD_REGEX.test(password)) {
        return {
            valid: false,
            message: 'Password must have at least 8 characters, contain uppercase, lowercase, numbers and special characters'
        };
    }
    return { valid: true };
};

/**
 * Validate email format
 */
const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, message: 'Invalid email format' };
    }
    return { valid: true };
};

/**
 * Validate username - alphanumeric only
 */
const validateUsername = (username) => {
    const usernameRegex = /^[a-zA-Z0-9]+$/;
    if (!usernameRegex.test(username)) {
        return { valid: false, message: 'Username must contain only letters and numbers' };
    }
    return { valid: true };
};

/**
 * Hash password
 */
const hashPassword = async (password) => {
    try {
        const salt = await bcrypt.genSalt(10);
        return await bcrypt.hash(password, salt);
    } catch (error) {
        throw new Error('Password hashing error: ' + error.message);
    }
};

/**
 * Compare password with hashed password
 */
const comparePassword = async (password, hashedPassword) => {
    try {
        return await bcrypt.compare(password, hashedPassword);
    } catch (error) {
        throw new Error('Password comparison error: ' + error.message);
    }
};

/**
 * Generate slug for user
 * Format: AD_<id_user>_<username>
 * @param {number} userId - User ID
 * @param {string} username - Username (should be alphanumeric)
 * @returns {string} Generated slug
 */
const generateSlugUser = (userId, username) => {
    const sanitizedName = username.trim().replace(/[^a-zA-Z0-9]/g, '');
    return `AD_${userId}_${sanitizedName}`;
};

const handleAvatarUpload = (file, oldAvatarPath) => {
    if (!file) {
        return {
            success: false,
            error: 'No file provided'
        };
    }

    try {
        console.log('[AVATAR] Starting avatar upload...');
        ensureUploadDir();

        // Step 1: COMPREHENSIVE FILE VALIDATION
        const validation = fileValidator.validateUploadFile(file, UPLOAD_DIR);

        if (!validation.valid) {
            console.warn(`[AVATAR] File upload validation failed: ${validation.error}`, {
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: file.size
            });

            return {
                success: false,
                error: validation.error
            };
        }

        // Step 2: Build safe destination path
        const safeFilename = validation.filename;
        const destPath = path.join(UPLOAD_DIR, safeFilename);
        console.log(`[AVATAR] Safe path: ${destPath}`);

        // Step 3: Write file from buffer (memory storage) or move from temp path (disk storage)
        if (file.buffer) {
            // Memory storage - write buffer directly
            try {
                console.log(`[AVATAR] Writing buffer to disk (${file.size} bytes)...`);
                const dir = path.dirname(destPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
                }
                fs.writeFileSync(destPath, file.buffer, { mode: 0o644 });
                console.log(`[AVATAR] File written successfully`);
            } catch (error) {
                console.error(`[AVATAR] Failed to write file: ${error.message}`);
                return {
                    success: false,
                    error: 'Failed to save file: ' + error.message
                };
            }
        } else if (file.path) {
            // Disk storage - move file from temp location
            console.log(`[AVATAR] Moving file from temp: ${file.path}`);
            const moveSuccess = fileValidator.moveUploadedFile(file.path, destPath);
            if (!moveSuccess) {
                console.error(`[AVATAR] Failed to move file`);
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

        // Step 4: Delete old avatar if it exists using safe deletion function
        if (oldAvatarPath) {
            console.log(`[AVATAR] Attempting to delete old avatar: ${oldAvatarPath}`);
            const deleteSuccess = fileValidator.deleteUploadedFile(UPLOAD_DIR, oldAvatarPath);
            if (!deleteSuccess) {
                console.warn(`[AVATAR] Could not delete old avatar: ${oldAvatarPath}`);
                // Continue with upload even if delete fails
            }
        }

        // Step 5: Return safe public path
        const publicPath = `/uploads/avatars/${safeFilename}`;
        console.log(`[AVATAR] Upload complete. New path: ${publicPath}`);

        return {
            success: true,
            path: publicPath
        };

    } catch (error) {
        console.error('[AVATAR] Avatar upload error:', error);

        // Clean up temp file on error
        try {
            if (file && file.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        } catch (cleanupError) {
            console.error('[AVATAR] Temp file cleanup error:', cleanupError);
        }

        return {
            success: false,
            error: 'System error during file upload: ' + error.message
        };
    }
};

/**
 * Register new user
 */
const register = async (username, email, fullName, password, passwordConfirm, avatarPath = null) => {
    try {
        // Validate inputs
        if (!username || !email || !password) {
            return {
                success: false,
                message: 'Please fill in all required information'
            };
        }

        // Validate email
        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return {
                success: false,
                message: emailValidation.message
            };
        }

        // Validate username
        const usernameValidation = validateUsername(username);
        if (!usernameValidation.valid) {
            return {
                success: false,
                message: usernameValidation.message
            };
        }

        // Validate password
        if (password !== passwordConfirm) {
            return {
                success: false,
                message: 'Passwords do not match'
            };
        }

        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            return {
                success: false,
                message: passwordValidation.message
            };
        }

        // Check if user exists
        const existingUser = await User.findOne({
            where: {
                [Op.or]: [{ email }, { username }]
            }
        });

        if (existingUser) {
            return {
                success: false,
                message: existingUser.email === email ? 'Email already exists' : 'Username already exists'
            };
        }

        // Hash password
        const hashedPassword = await hashPassword(password);

        // Create user
        const newUser = await User.create({
            username: username.trim(),
            email: email.trim().toLowerCase(),
            fullName: fullName ? fullName.trim() : '',
            password: hashedPassword,
            avatar: avatarPath,
            isActive: true
        });

        // Generate and set slug after user creation (when ID is available)
        const userSlug = generateSlugUser(newUser.id, newUser.username);
        await newUser.update({ slug_name: userSlug });

        // Note: VPNUser record will be created when user joins a team or via vpn-status-user.py script

        return {
            success: true,
            message: 'Registration successful',
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                fullName: newUser.fullName,
                avatar: newUser.avatar,
                slug_name: userSlug
            }
        };
    } catch (error) {
        console.error('Register error:', error);
        return {
            success: false,
            message: 'System error'
        };
    }
};

/**
 * Login user
 */
const login = async (email, password) => {
    try {
        if (!email || !password) {
            return {
                success: false,
                message: 'Please enter email and password'
            };
        }

        // Find user by email
        const user = await User.findOne({
            where: { email: email.trim().toLowerCase() }
        });

        if (!user) {
            return {
                success: false,
                message: 'Invalid email or password'
            };
        }

        if (!user.isActive) {
            return {
                success: false,
                message: 'This account has been disabled'
            };
        }

        // Compare password
        const isPasswordValid = await comparePassword(password, user.password);

        if (!isPasswordValid) {
            return {
                success: false,
                message: 'Invalid email or password'
            };
        }

        return {
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                avatar: user.avatar,
                teamId: user.teamId
            }
        };
    } catch (error) {
        return {
            success: false,
            message: 'System error'
        };
    }
};

/**
 * Get user by ID
 */
const getUserById = async (userId) => {
    try {
        const user = await User.findByPk(userId, {
            attributes: { exclude: ['password'] }
        });
        return user;
    } catch (error) {
        console.error('Get user error:', error);
        return null;
    }
};

/**
 * Update user profile
 */
const updateProfile = async (userId, { fullName, avatar }) => {
    try {
        const user = await User.findByPk(userId);
        if (!user) {
            return {
                success: false,
                message: 'User not found'
            };
        }

        const updateData = {};
        if (fullName) updateData.fullName = fullName.trim();
        if (avatar) updateData.avatar = avatar;

        await user.update(updateData);

        return {
            success: true,
            message: 'Profile updated successfully',
            user: user
        };
    } catch (error) {
        console.error('Update profile error:', error);
        return {
            success: false,
            message: 'System error: ' + error.message
        };
    }
};

module.exports = {
    register,
    login,
    getUserById,
    updateProfile,
    handleAvatarUpload,
    validatePassword,
    validateEmail,
    validateUsername,
    hashPassword,
    generateSlugUser,
    comparePassword
};
