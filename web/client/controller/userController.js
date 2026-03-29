require('dotenv/config');
const fs = require('fs');
const path = require('path');
const userServices = require('../services/userServices');
const auth = require('../middleware/authMiddleware');
const UPLOAD_DIR = path.join(__dirname, '../public/uploads/avatars');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const GetLogin = (req, res) => {
    let token = req.cookies.authToken;
    if (!token) {
        res.render('login', {
            title: 'Login - AD Challenge',
            error: null
        });
    } else {
        res.redirect('/dashboard');
    }
};

const PostLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await userServices.login(email, password);

        if (result.success) {
            const token = auth.generateToken({ id: result.user.id, email: result.user.email, username: result.user.username });

            // Set token in HTTP-only cookie
            res.cookie('authToken', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });

            return res.redirect('/dashboard');
        }
        res.render('login', {
            title: 'Login - AD Challenge',
            error: result.message
        });
    } catch (error) {
        console.error('PostLogin error:', error);
        res.render('login', {
            title: 'Login - AD Challenge',
            error: 'An error occurred, please try again'
        });
    }
};

const GetResgiter = (req, res) => {
    let token = req.cookies.authToken;
    if (!token) {
        res.render('resgiter', {
            title: 'Register - AD Challenge',
            error: null
        });
    } else {
        res.redirect('/dashboard');
    }
};

const PostResgiter = async (req, res) => {
    try {
        const { username, email, fullName, password, passwordConfirm } = req.body;

        // Handle avatar upload
        let avatarPath = null;
        let uploadError = null;

        if (req.file) {
            const uploadResult = userServices.handleAvatarUpload(req.file);

            if (uploadResult.success) {
                avatarPath = uploadResult.path;
            } else {
                uploadError = uploadResult.error;
            }
        }

        // If avatar upload failed, return error
        if (uploadError) {
            return res.render('resgiter', {
                title: 'Register - AD Challenge',
                error: `Avatar upload failed: ${uploadError}`
            });
        }

        // Register user
        const result = await userServices.register(
            username,
            email,
            fullName,
            password,
            passwordConfirm,
            avatarPath
        );

        if (result.success) {
            const token = auth.generateToken({ id: result.user.id, email: result.user.email, username: result.user.username });

            // Set token in HTTP-only cookie
            res.cookie('authToken', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });

            return res.redirect('/dashboard');
        }

        res.render('resgiter', {
            title: 'Register - AD Challenge',
            error: result.message
        });
    } catch (error) {
        res.render('resgiter', {
            title: 'Register - AD Challenge',
            error: 'An error occurred, please try again'
        });
    }
};

const Logout = (req, res) => {
    res.clearCookie('authToken');
    res.redirect('/');
};

/**
 * Handle profile update (avatar, fullName)
 * Handles multer errors and file validation errors
 */
exports.updateProfile = async (req, res) => {
    try {
        const { User, Team } = require('../models');
        const user = await User.findByPk(req.user.id);
        if (!user) return res.redirect('/auth/login');
        const { fullName } = req.body;
        let avatarPath = null;
        let updateError = null;
        if (req.file) {
            const uploadResult = userServices.handleAvatarUpload(req.file, user.avatar);
            if (uploadResult.success) {
                avatarPath = uploadResult.path;
            } else {
                updateError = uploadResult.error;
            }
        }
        if (updateError) {
            let userTeamName = null;
            if (user.teamId) {
                const userTeam = await Team.findByPk(user.teamId);
                if (userTeam) userTeamName = userTeam.name;
            }
            return res.render('profile', {
                user: user.dataValues,
                userTeamName,
                errorMessage: `Avatar upload failed: ${updateError}`
            });
        }
        if (fullName) user.fullName = fullName;
        if (avatarPath) user.avatar = avatarPath;
        await user.save();
        let userTeamName = null;
        if (user.teamId) {
            const userTeam = await Team.findByPk(user.teamId);
            if (userTeam) userTeamName = userTeam.name;
        }
        res.render('profile', {
            user: user.dataValues,
            userTeamName,
            successMessage: '✓ Profile updated successfully!'
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).render('error', {
            code: '500',
            title: 'Profile Update Error',
            message: error.message || 'An error occurred while updating profile.'
        });
    }
};

/**
 * GET /dashboard - Display dashboard
 */
exports.getDashboard = async (req, res) => {
    try {
        // If not logged in, show home page
        if (!req.user) {
            return res.render('home', {
                title: 'AD Challenge - N3m3s1s Club',
                user: null
            });
        }

        const { User, Team } = require('../models');
        const user = await User.findByPk(req.user.id);
        if (!user) return res.redirect('/auth/login');
        let userTeam = null;
        let teamMembers = [];
        let userTeamName = null;
        if (user.teamId) {
            userTeam = await Team.findByPk(user.teamId);
            if (userTeam) {
                userTeamName = userTeam.name;
                teamMembers = await User.findAll({
                    where: { teamId: user.teamId },
                    attributes: ['id', 'username', 'email', 'fullName', 'isActive', 'createdAt']
                });
            }
        }
        res.render('dashboard', {
            user: user.dataValues,
            userTeam: userTeam ? userTeam.dataValues : null,
            userTeamName,
            teamMembers: teamMembers.map(m => m.dataValues)
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.redirect('/auth/login');
    }
};

/**
 * GET /profile - Display user profile
 */
exports.getProfile = async (req, res) => {
    try {
        const { User, Team } = require('../models');
        const user = await User.findByPk(req.user.id);
        if (!user) return res.redirect('/auth/login');
        let userTeamName = null;
        if (user.teamId) {
            const userTeam = await Team.findByPk(user.teamId);
            if (userTeam) userTeamName = userTeam.name;
        }
        res.render('profile', {
            user: user.dataValues,
            userTeamName
        });
    } catch (error) {
        console.error('Profile page error:', error);
        res.redirect('/dashboard');
    }
};

/**
 * GET /scoreboard - Display scoreboard
 */
exports.getScoreboard = async (req, res) => {
    try {
        const { User } = require('../models');
        const user = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password'] }
        });
        res.render('scoreboard', { user: user ? user.dataValues : req.user });
    } catch (error) {
        console.error('Scoreboard page error:', error);
        res.render('scoreboard', { user: req.user });
    }
};

/**
 * GET /vpn - Display VPN status
 */
exports.getVpn = async (req, res) => {
    try {
        const { User } = require('../models');
        const user = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password'] }
        });
        res.render('vpn', { user: user ? user.dataValues : req.user });
    } catch (error) {
        console.error('VPN page error:', error);
        res.render('vpn', { user: req.user });
    }
};

/**
 * GET /services - Display services
 */
exports.getServices = async (req, res) => {
    try {
        const { User } = require('../models');
        const user = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password'] }
        });
        res.render('services', { user: user ? user.dataValues : req.user });
    } catch (error) {
        console.error('Services page error:', error);
        res.render('services', { user: req.user });
    }
};

module.exports = {
    GetLogin,
    GetResgiter,
    PostLogin,
    PostResgiter,
    Logout,
    getDashboard: exports.getDashboard,
    getProfile: exports.getProfile,
    getScoreboard: exports.getScoreboard,
    getVpn: exports.getVpn,
    getServices: exports.getServices,
    updateProfile: exports.updateProfile
};