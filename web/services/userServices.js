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

const handleAvatarUpload = (file) => {
    if (!file) {
        return {
            success: false,
            error: 'No file provided'
        };
    }

    try {
        ensureUploadDir();

        // Step 3: COMPREHENSIVE FILE VALIDATION
        const validation = fileValidator.validateUploadFile(file, UPLOAD_DIR);

        if (!validation.valid) {
            console.warn(`File upload validation failed: ${validation.error}`, {
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: file.size
            });

            // Clean up temp file
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }

            return {
                success: false,
                error: validation.error
            };
        }

        // Step 4: Build safe destination path
        const safeFilename = validation.filename;
        const destPath = path.join(UPLOAD_DIR, safeFilename);

        // Step 5: Move file from temp location to final destination
        const moveSuccess = fileValidator.moveUploadedFile(file.path, destPath);

        if (!moveSuccess) {
            return {
                success: false,
                error: 'Failed to save file'
            };
        }

        // Step 6: Return safe public path
        const publicPath = `/uploads/avatars/${safeFilename}`;

        return {
            success: true,
            path: publicPath
        };

    } catch (error) {
        console.error('Avatar upload error:', error);

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

        return {
            success: true,
            message: 'Registration successful',
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                fullName: newUser.fullName,
                avatar: newUser.avatar
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
    hashPassword,
    comparePassword
};
