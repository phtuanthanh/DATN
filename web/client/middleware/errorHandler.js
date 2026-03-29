const notFoundHandler = (req, res) => {
    res.status(404).render('error', {
        code: '404',
        title: 'Not Found',
        message: 'An error occurred, please try again'
    });
};

const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
    const statusCode = err.statusCode || 500;
    const title = err.statusCode === 403 ? 'Access Denied' : 'Error Occurred';
    const message = err.message || 'Something went wrong. Please try again later.';

    res.status(statusCode).render('error', {
        code: statusCode,
        title: title,
        message: message
    });
};

module.exports = {
    notFoundHandler,
    errorHandler
};
