const express = require('express');
const router = express.Router();

router.get('/dashboard', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Dashboard - AD Challenge</title>
            <link rel="stylesheet" href="/css/style.css">
            <style>
                .dashboard-container {
                    max-width: 1200px;
                    margin: 100px auto;
                    padding: 0 20px;
                }
                .dashboard-header {
                    color: var(--primary-color);
                    margin-bottom: 2rem;
                }
            </style>
        </head>
        <body style="background-color: var(--dark-bg); color: var(--text-primary);">
            <nav class="navbar">
                <div class="container">
                    <div class="navbar-brand">
                        <h1>AD Challenge</h1>
                    </div>
                    <ul class="nav-links">
                        <li>Welcome, ${req.session.user.username}</li>
                        <li><a href="/auth/logout" class="cta-btn">Logout</a></li>
                    </ul>
                </div>
            </nav>
            <div class="dashboard-container">
                <div class="dashboard-header">
                    <h1>Dashboard</h1>
                    <p>Welcome to your dashboard, ${req.session.user.email}</p>
                </div>
                <div style="background: var(--card-bg); padding: 2rem; border-radius: 10px; border: 1px solid var(--border-color);">
                    <h2 style="color: var(--primary-color); margin-bottom: 1rem;">Your Profile</h2>
                    <p><strong>Email:</strong> ${req.session.user.email}</p>
                    <p><strong>User ID:</strong> ${req.session.user.id}</p>
                </div>
            </div>
        </body>
        </html>
    `);
});

module.exports = router;
