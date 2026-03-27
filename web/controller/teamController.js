const { User, Team } = require('../models');
const teamServices = require('../services/teamServices');

/**
 * GET /team - Display team page
 */
const getTeamPage = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.redirect('/auth/login');
        }

        let userTeam = null;
        let teamMembers = [];

        // If user is part of a team, fetch team and members
        if (user.teamId) {
            userTeam = await Team.findByPk(user.teamId);
            if (userTeam) {
                teamMembers = await teamServices.getTeamMembers(user.teamId);
            }
        }

        res.render('team', {
            user: user.dataValues,
            userTeam: userTeam ? userTeam.dataValues : null,
            teamMembers: teamMembers,
            successMessage: null,
            errorMessage: null
        });
    } catch (error) {
        console.error('Get team page error:', error);
        res.redirect('/dashboard');
    }
};

/**
 * POST /team/create - Create a new team
 */
const createTeam = async (req, res) => {
    try {
        const { teamName, country, education } = req.body;
        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.redirect('/auth/login');
        }

        // Handle image upload
        let imageUrl = null;
        let uploadError = null;

        if (req.file) {
            const uploadResult = teamServices.handleTeamImageUpload(req.file);

            if (uploadResult.success) {
                imageUrl = uploadResult.path;
            } else {
                uploadError = uploadResult.error;
            }
        }

        // If image upload failed, render with error
        if (uploadError) {
            let userTeam = null;
            let teamMembers = [];
            if (user.teamId) {
                userTeam = await Team.findByPk(user.teamId);
                if (userTeam) {
                    teamMembers = await teamServices.getTeamMembers(user.teamId);
                }
            }
            return res.render('team', {
                user: user.dataValues,
                userTeam: userTeam ? userTeam.dataValues : null,
                teamMembers: teamMembers,
                successMessage: null,
                errorMessage: `Image upload failed: ${uploadError}`
            });
        }

        const result = await teamServices.createTeam({
            name: teamName,
            country: country,
            education: education,
            images: imageUrl
        }, req.user.id);

        // Fetch updated user data
        const updatedUser = await User.findByPk(req.user.id);
        let userTeam = null;
        let teamMembers = [];

        if (result.success) {
            userTeam = await Team.findByPk(updatedUser.teamId);
            if (userTeam) {
                teamMembers = await teamServices.getTeamMembers(updatedUser.teamId);
            }
            return res.render('team', {
                user: updatedUser.dataValues,
                userTeam: userTeam.dataValues,
                teamMembers: teamMembers,
                successMessage: 'Team created successfully',
                errorMessage: null
            });
        }

        res.render('team', {
            user: updatedUser.dataValues,
            userTeam: null,
            teamMembers: [],
            successMessage: null,
            errorMessage: result.message
        });
    } catch (error) {
        console.error('Create team error:', error);
        const user = await User.findByPk(req.user.id);
        let userTeam = null;
        let teamMembers = [];
        if (user && user.teamId) {
            userTeam = await Team.findByPk(user.teamId);
            if (userTeam) {
                teamMembers = await teamServices.getTeamMembers(user.teamId);
            }
        }
        res.render('team', {
            user: user ? user.dataValues : null,
            userTeam: userTeam ? userTeam.dataValues : null,
            teamMembers: teamMembers,
            successMessage: null,
            errorMessage: 'Error creating team'
        });
    }
};

/**
 * POST /team/join - Join team using team key
 */
const joinTeam = async (req, res) => {
    try {
        const { teamKey } = req.body;
        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.redirect('/auth/login');
        }

        let userTeam = null;
        let teamMembers = [];

        if (!teamKey || teamKey.trim().length === 0) {
            if (user.teamId) {
                userTeam = await Team.findByPk(user.teamId);
                if (userTeam) {
                    teamMembers = await teamServices.getTeamMembers(user.teamId);
                }
            }
            return res.render('team', {
                user: user.dataValues,
                userTeam: userTeam ? userTeam.dataValues : null,
                teamMembers: teamMembers,
                successMessage: null,
                errorMessage: 'Team key is required'
            });
        }

        const result = await teamServices.joinTeamByKey(teamKey.trim(), req.user.id);

        // Fetch updated user data
        const updatedUser = await User.findByPk(req.user.id);

        if (result.success) {
            userTeam = await Team.findByPk(updatedUser.teamId);
            if (userTeam) {
                teamMembers = await teamServices.getTeamMembers(updatedUser.teamId);
            }
            return res.render('team', {
                user: updatedUser.dataValues,
                userTeam: userTeam.dataValues,
                teamMembers: teamMembers,
                successMessage: 'Joined team successfully',
                errorMessage: null
            });
        }

        if (updatedUser.teamId) {
            userTeam = await Team.findByPk(updatedUser.teamId);
            if (userTeam) {
                teamMembers = await teamServices.getTeamMembers(updatedUser.teamId);
            }
        }
        res.render('team', {
            user: updatedUser.dataValues,
            userTeam: userTeam ? userTeam.dataValues : null,
            teamMembers: teamMembers,
            successMessage: null,
            errorMessage: result.message
        });
    } catch (error) {
        console.error('Join team error:', error);
        const user = await User.findByPk(req.user.id);
        let userTeam = null;
        let teamMembers = [];
        if (user && user.teamId) {
            userTeam = await Team.findByPk(user.teamId);
            if (userTeam) {
                teamMembers = await teamServices.getTeamMembers(user.teamId);
            }
        }
        res.render('team', {
            user: user ? user.dataValues : null,
            userTeam: userTeam ? userTeam.dataValues : null,
            teamMembers: teamMembers,
            successMessage: null,
            errorMessage: 'Error joining team'
        });
    }
};

/**
 * GET /team/leave - Leave current team
 */
const leaveTeam = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.redirect('/auth/login');
        }

        const result = await teamServices.leaveTeam(req.user.id);

        // Fetch updated user data (teamId should be null after leaving)
        const updatedUser = await User.findByPk(req.user.id);

        if (result.success) {
            return res.render('team', {
                user: updatedUser.dataValues,
                userTeam: null,
                teamMembers: [],
                successMessage: 'Left team successfully',
                errorMessage: null
            });
        }

        res.render('team', {
            user: updatedUser.dataValues,
            userTeam: null,
            teamMembers: [],
            successMessage: null,
            errorMessage: result.message
        });
    } catch (error) {
        console.error('Leave team error:', error);
        const user = await User.findByPk(req.user.id);
        res.render('team', {
            user: user ? user.dataValues : null,
            userTeam: null,
            teamMembers: [],
            successMessage: null,
            errorMessage: 'Error leaving team'
        });
    }
};

/**
 * POST /team/update - Update team information
 */
const updateTeam = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);

        if (!user) {
            return res.redirect('/auth/login');
        }

        // Check if user is part of a team
        if (!user.teamId) {
            let teamMembers = [];
            return res.render('team', {
                user: user.dataValues,
                userTeam: null,
                teamMembers: teamMembers,
                successMessage: null,
                errorMessage: 'You are not part of any team'
            });
        }

        // Get team
        const userTeam = await Team.findByPk(user.teamId);

        if (!userTeam) {
            let teamMembers = [];
            return res.render('team', {
                user: user.dataValues,
                userTeam: null,
                teamMembers: teamMembers,
                successMessage: null,
                errorMessage: 'Team not found'
            });
        }


        const { teamName, country, education } = req.body;
        let imageUploadError = null;

        // Handle team image upload if file is provided
        if (req.file) {
            const uploadResult = teamServices.handleTeamImageUpload(req.file);
            
            if (uploadResult.success) {
                userTeam.teamImage = uploadResult.path;
            } else {
                imageUploadError = uploadResult.error;
            }
        }

        // If image upload failed, return error
        if (imageUploadError) {
            const teamMembers = await teamServices.getTeamMembers(user.teamId);
            return res.render('team', {
                user: user.dataValues,
                userTeam: userTeam.dataValues,
                teamMembers: teamMembers,
                successMessage: null,
                errorMessage: `Team image upload failed: ${imageUploadError}`
            });
        }

        // Update team fields
        if (teamName) {
            userTeam.name = teamName;
        }

        if (country) {
            userTeam.country = country;
        }

        if (education) {
            userTeam.education = education;
        }

        await userTeam.save();

        // Fetch updated team members
        const teamMembers = await teamServices.getTeamMembers(user.teamId);

        res.render('team', {
            user: user.dataValues,
            userTeam: userTeam.dataValues,
            teamMembers: teamMembers,
            successMessage: '✓ Team information updated successfully!',
            errorMessage: null
        });
    } catch (error) {
        console.error('Update team error:', error);
        
        try {
            const user = await User.findByPk(req.user.id);
            let userTeam = null;
            let teamMembers = [];

            if (user && user.teamId) {
                userTeam = await Team.findByPk(user.teamId);
                if (userTeam) {
                    teamMembers = await teamServices.getTeamMembers(user.teamId);
                }
            }

            return res.render('team', {
                user: user ? user.dataValues : null,
                userTeam: userTeam ? userTeam.dataValues : null,
                teamMembers: teamMembers,
                successMessage: null,
                errorMessage: 'Failed to update team information'
            });
        } catch (err) {
            res.redirect('/team');
        }
    }
};

module.exports = {
    getTeamPage,
    createTeam,
    joinTeam,
    leaveTeam,
    updateTeam
};
