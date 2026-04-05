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

// Serve team images from client uploads
app.use('/uploads', express.static(path.join(__dirname, '../client/public/uploads')));

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
        const syncResult = await syncModels();
        if (syncResult && syncResult.error) {
            console.error('Database sync failed:', syncResult.error);
            console.error('Attempting to continue...');
        }
        app.listen(PORT, HOST, () => {
            console.log(`Admin panel server running at http://${HOST}:${PORT}`);
        });
    } catch (error) {
        const errorMsg = `Failed to start server: ${error.message || 'Unknown error'}`;
        console.error(errorMsg);
        process.exit(1);
    }
};

startServer();

module.exports = app;
