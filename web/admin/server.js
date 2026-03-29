require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const path = require('path');

const { syncModels } = require('./models');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || 'localhost';

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layout');

// Layout middleware
app.use(expressLayouts);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'admin_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Routes
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

// Default route
app.get('/', (req, res) => {
    if (req.session && req.session.adminId) {
        return res.redirect('/admin');
    }
    res.redirect('/auth/login');
});

// Error handling
app.use(errorHandler);

// Initialize database and start server
const startServer = async () => {
    try {
        await syncModels();
        app.listen(PORT, HOST, () => {
            console.log(`Admin panel server running at http://${HOST}:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

module.exports = app;
