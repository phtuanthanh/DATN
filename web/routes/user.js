const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const { authMiddleware } = require('../middleware/authMiddleware');
const { User, Team } = require('../models');
const userServices = require('../services/userServices');
const router = express.Router();

/**
 * Multer configuration for profile updates
 */
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, os.tmpdir());
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        cb(null, `avatar-${timestamp}-${random}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

router.get('/dashboard', authMiddleware, async (req, res) => {
    try {
        // Get current user from token
        const user = await User.findByPk(req.user.id);
        
        if (!user) {
            return res.redirect('/auth/login');
        }

        let userTeam = null;
        let teamMembers = [];
        let userTeamName = null;

        // If user is part of a team, fetch team and members
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
            userTeamName: userTeamName,
            teamMembers: teamMembers.map(m => m.dataValues)
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.redirect('/auth/login');
    }
});

/**
 * GET /profile - Display user profile
 */
router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        
        if (!user) {
            return res.redirect('/auth/login');
        }

        let userTeamName = null;

        // If user is part of a team, fetch team name
        if (user.teamId) {
            const userTeam = await Team.findByPk(user.teamId);
            if (userTeam) {
                userTeamName = userTeam.name;
            }
        }

        res.render('profile', {
            user: user.dataValues,
            userTeamName: userTeamName
        });
    } catch (error) {
        console.error('Profile page error:', error);
        res.redirect('/dashboard');
    }
});

/**
 * GET /scoreboard - Display scoreboard
 */
router.get('/scoreboard', authMiddleware, async (req, res) => {
    try {
        res.render('scoreboard');
    } catch (error) {
        console.error('Scoreboard page error:', error);
        res.redirect('/dashboard');
    }
});

/**
 * GET /vpn - Display VPN status
 */
router.get('/vpn', authMiddleware, async (req, res) => {
    try {
        res.render('vpn');
    } catch (error) {
        console.error('VPN page error:', error);
        res.redirect('/dashboard');
    }
});

/**
 * POST /profile/update - Update user profile information
 */
router.post('/profile/update', authMiddleware, upload.single('avatar'), async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        
        if (!user) {
            return res.redirect('/auth/login');
        }

        const { email, fullName } = req.body;
        let avatarPath = null;
        let updateError = null;

        // Handle avatar upload if file is provided
        if (req.file) {
            const uploadResult = userServices.handleAvatarUpload(req.file);
            
            if (uploadResult.success) {
                avatarPath = uploadResult.path;
            } else {
                updateError = uploadResult.error;
            }
        }

        // If avatar upload failed, return error
        if (updateError) {
            let userTeamName = null;
            if (user.teamId) {
                const userTeam = await Team.findByPk(user.teamId);
                if (userTeam) {
                    userTeamName = userTeam.name;
                }
            }

            return res.render('profile', {
                user: user.dataValues,
                userTeamName: userTeamName,
                errorMessage: `Avatar upload failed: ${updateError}`
            });
        }

        // Update user profile
        if (email) {
            user.email = email;
        }

        if (fullName) {
            user.fullName = fullName;
        }

        if (avatarPath) {
            user.profilePicture = avatarPath;
        }

        await user.save();

        // Fetch team info for response
        let userTeamName = null;
        if (user.teamId) {
            const userTeam = await Team.findByPk(user.teamId);
            if (userTeam) {
                userTeamName = userTeam.name;
            }
        }

        res.render('profile', {
            user: user.dataValues,
            userTeamName: userTeamName,
            successMessage: '✓ Profile updated successfully!'
        });
    } catch (error) {
        console.error('Profile update error:', error);
        
        try {
            const user = await User.findByPk(req.user.id);
            let userTeamName = null;
            if (user && user.teamId) {
                const userTeam = await Team.findByPk(user.teamId);
                if (userTeam) {
                    userTeamName = userTeam.name;
                }
            }

            return res.render('profile', {
                user: user ? user.dataValues : {},
                userTeamName: userTeamName,
                errorMessage: 'Failed to update profile'
            });
        } catch (err) {
            res.redirect('/profile');
        }
    }
});

module.exports = router;
