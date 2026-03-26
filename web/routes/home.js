const express = require('express');
const router = express.Router();

// Home Route - Load home page
router.get('/', (req, res) => {
    res.render('home', {
        title: 'AD Challenge - N3m3s1s Club',
        user: req.session.user || null
    });
});

module.exports = router;
