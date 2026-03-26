require('dotenv/config');
const fs = require('fs');
const path = require('path');
const userServices = require('../services/userServices');

const UPLOAD_DIR = path.join(__dirname, '../public/uploads/avatars');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const GetLogin = (req, res) => {
    res.render('login', {
        title: 'Login - AD Challenge',
        error: null
    });
};

const PostLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await userServices.login(email, password);

        if (result.success) {
            req.session.user = result.user;
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
    res.render('resgiter', {
        title: 'Register - AD Challenge',
        error: null
    });
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
            req.session.user = result.user;
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
    req.session.destroy((err) => {
        if (err) {
            return res.send('Error logging out');
        }
        res.redirect('/');
    });
};

module.exports = {
    GetLogin,
    GetResgiter,
    PostLogin,
    PostResgiter,
    Logout
};