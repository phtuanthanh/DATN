const express = require('express');
const { optionalAuthMiddleware } = require('../middleware/authMiddleware');
const router = express.Router();

// Home Route - Load home page (works for both logged in and logged out users)
router.get('/', optionalAuthMiddleware, async (req, res) => {
    try {
        let userData = null;

        // If user is logged in, fetch full user data
        if (req.user) {
            const { User } = require('../models');
            userData = await User.findByPk(req.user.id, {
                attributes: { exclude: ['password'] }
            });
        }

        res.render('home', {
            title: 'AD Challenge - N3m3s1s Club',
            user: userData ? userData.dataValues : null
        });
    } catch (error) {
        console.error('Home page error:', error);
        res.render('home', {
            title: 'AD Challenge - N3m3s1s Club',
            user: null
        });
    }
});

module.exports = router;
