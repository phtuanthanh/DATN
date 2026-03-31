require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

// Import Database and Models
const { syncModels } = require('./models');

// Import Routes
const homeRouter = require('./routes/home');
const authRouter = require('./routes/auth');
const userRouter = require('./routes/user');
const teamRouter = require('./routes/team');
const vpnRouter = require('./routes/vpn');

// Import Middleware
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== View Engine Setup =====
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===== Middleware =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// ===== Routes =====
app.use('/', homeRouter);
app.use('/auth', authRouter);
app.use('/', userRouter);
app.use('/team', teamRouter);
app.use('/vpn', vpnRouter);

// ===== Error Handlers =====
app.use(notFoundHandler);
app.use(errorHandler);

// ===== Start Server =====
const startServer = async () => {
    try {
        await syncModels();
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

module.exports = app;
