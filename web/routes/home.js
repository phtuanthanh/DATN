const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const router = express.Router();

// Home Route - Load home page
router.get('/', authMiddleware, (req, res) => {
    let token = req.cookies.authToken;
    if (!token) {
     res.render('home', {
        title: 'AD Challenge - N3m3s1s Club',
        user: req.user || null
    });
    } else {
        res.redirect('/dashboard');
    }
  
});

module.exports = router;
