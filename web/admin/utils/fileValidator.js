const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.pdf'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Validate uploaded file
 */
const validateUploadFile = (file, uploadDir) => {
    if (!file) {
        return {
            valid: false,
            error: 'No file provided'
        };
    }

    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return {
            valid: false,
            error: `File type not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`
        };
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
        return {
            valid: false,
            error: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`
        };
    }

    // Generate safe filename
    const timestamp = Date.now();
    const randomStr = crypto.randomBytes(8).toString('hex');
    const filename = `${timestamp}-${randomStr}${ext}`;

    return {
        valid: true,
        filename
    };
};

/**
 * Move uploaded file
 */
const moveUploadedFile = (srcPath, destPath) => {
    try {
        fs.renameSync(srcPath, destPath);
        return true;
    } catch (error) {
        console.error('Move file error:', error);
        return false;
    }
};

/**
 * Delete uploaded file
 */
const deleteUploadedFile = (uploadDir, filename) => {
    try {
        const filepath = path.join(uploadDir, path.basename(filename));
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Delete file error:', error);
        return false;
    }
};

module.exports = {
    validateUploadFile,
    moveUploadedFile,
    deleteUploadedFile
};
