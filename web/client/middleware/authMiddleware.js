const jwt = require('jsonwebtoken');

// Secret key - nên lưu trong .env file
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRE = '7d'; // JWT hết hạn sau 7 ngày

/**
 * Mã hóa JWT token
 * @param {Object} payload - Dữ liệu cần mã hóa (thường là user ID hoặc thông tin user)
 * @returns {String} JWT token đã mã hóa
 */
const generateToken = (payload) => {
  try {
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRE,
      algorithm: 'HS256'
    });
    return token;
  } catch (error) {
    console.error('Lỗi khi tạo token:', error);
    throw error;
  }
};

/**
 * Giải mã JWT token
 * @param {String} token - JWT token cần giải mã
 * @returns {Object} Payload đã được giải mã
 */
const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256']
    });
    return decoded;
  } catch (error) {
    console.error('Lỗi khi xác minh token:', error.message);
    throw error;
  }
};

/**
 * Middleware xác thực JWT
 * Kiểm tra token từ cookie hoặc header Authorization
 * Nếu lỗi sẽ redirect về trang login
 */
const authMiddleware = (req, res, next) => {
  try {
    // Lấy token từ cookie hoặc header Authorization
    let token = req.cookies.authToken;

    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader;
    }

    if (!token) {
      return res.redirect('/auth/login');
    }

    // Giải mã token
    const decoded = verifyToken(token);

    // Lưu thông tin user vào request object để dùng ở các middleware/route tiếp theo
    req.user = decoded;
    req.token = token;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      res.clearCookie('authToken');
      return res.redirect('/auth/login');
    }

    if (error.name === 'JsonWebTokenError') {
      res.clearCookie('authToken');
      return res.redirect('/auth/login');
    }

    res.redirect('/auth/login');
  }
};

/**
 * Middleware tùy chọn - xác thực JWT nhưng không bắt buộc
 * Nếu có token hợp lệ sẽ lưu user, nếu không có token sẽ cho phép tiếp tục
 */
const optionalAuthMiddleware = (req, res, next) => {
  try {
    // Check cookie first, then Authorization header
    let token = req.cookies.authToken;

    if (!token && req.headers.authorization) {
      token = req.headers.authorization.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : req.headers.authorization;
    }

    if (token) {
      try {
        const decoded = verifyToken(token);
        req.user = decoded;
        req.token = token;
      } catch (error) {
        // Token không hợp lệ nhưng vẫn cho phép tiếp tục
        console.warn('Token không hợp lệ nhưng tiếp tục xử lý');
      }
    }

    next();
  } catch (error) {
    next();
  }
};

/**
 * Middleware kiểm tra role (ví dụ: admin, user)
 * @param {...string} allowedRoles - Các role được phép
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.redirect('/login');
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return res.redirect('/login');
    }

    next();
  };
};

// Xuất các function và middleware
module.exports = {
  generateToken,      // Dùng để mã hóa token (thường dùng khi user đăng nhập)
  verifyToken,        // Dùng để giải mã token (kiểm tra token hợp lệ)
  authMiddleware,     // Middleware bắt buộc phải có token
  optionalAuthMiddleware, // Middleware token tùy chọn
  authorize          // Middleware kiểm tra quyền hạn
};
