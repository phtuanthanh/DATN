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

module.exports = {
    GetLogin,
    GetResgiter,
    PostLogin,
    PostResgiter,
    Logout
};