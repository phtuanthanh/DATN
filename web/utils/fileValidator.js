const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Allowed image file extensions (lowercase)
 */
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

/**
 * Allowed MIME types
 */
const ALLOWED_MIMES = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp']
};

/**
 * Magic bytes (file signatures) to verify actual file type
 * Prevents uploading disguised files as images
 */
const MAGIC_BYTES = {
    'image/jpeg': [0xFF, 0xD8, 0xFF],
    'image/png': [0x89, 0x50, 0x4E, 0x47],
    'image/gif': [0x47, 0x49, 0x46],
    'image/webp': [0x52, 0x49, 0x46, 0x46] // RIFF format
};

/**
 * Verify file magic bytes (file signature)
 * @param {string} filePath - Path to the file
 * @param {string} mimeType - MIME type to verify
 * @returns {boolean} - True if magic bytes match
 */
const verifyMagicBytes = (filePath, mimeType) => {
    try {
        const buffer = Buffer.alloc(4);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buffer, 0, 4, 0);
        fs.closeSync(fd);

        const magicBytes = MAGIC_BYTES[mimeType];
        if (!magicBytes) return false;

        // Check if file starts with expected magic bytes
        for (let i = 0; i < magicBytes.length; i++) {
            if (buffer[i] !== magicBytes[i]) {
                return false;
            }
        }

        return true;
    } catch (error) {
        console.error('Magic bytes verification error:', error);
        return false;
    }
};

/**
 * Sanitize filename to prevent path traversal
 * @param {string} originalFilename - Original filename from upload
 * @returns {string} - Safe filename
 */
const sanitizeFilename = (originalFilename) => {
    const ext = path.extname(originalFilename).toLowerCase();
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(8).toString('hex');
    return `${timestamp}-${randomBytes}${ext}`;
};

const isPathSafe = (baseDir, uploadPath) => {
    const resolvedBase = path.resolve(baseDir);
    const resolvedPath = path.resolve(uploadPath);


    return resolvedPath.startsWith(resolvedBase + path.sep) || resolvedPath === resolvedBase;
};
const validateUploadFile = (file, uploadDir) => {
    // Check file exists
    if (!file) {
        return {
            valid: false,
            error: 'No file provided'
        };
    }

    // Check MIME type
    if (!ALLOWED_MIMES[file.mimetype]) {
        return {
            valid: false,
            error: `Invalid MIME type: ${file.mimetype}`
        };
    }

    // Check file size
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        return {
            valid: false,
            error: 'File size exceeds 5MB limit'
        };
    }

    if (file.size < 100) {
        return {
            valid: false,
            error: 'File size too small (minimum 100 bytes)'
        };
    }

    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return {
            valid: false,
            error: `File extension ${ext} not allowed`
        };
    }

    // Check file extension matches MIME type
    const allowedExts = ALLOWED_MIMES[file.mimetype];
    if (!allowedExts.includes(ext)) {
        return {
            valid: false,
            error: `File extension ${ext} does not match MIME type ${file.mimetype}`
        };
    }

    // Verify magic bytes (actual file signature)
    if (!verifyMagicBytes(file.path, file.mimetype)) {
        return {
            valid: false,
            error: 'File content does not match declared MIME type (possible disguised file)'
        };
    }

    // Sanitize filename to prevent path traversal
    const safeFilename = sanitizeFilename(file.originalname);

    // Check path safety
    const fullPath = path.join(uploadDir, safeFilename);
    if (!isPathSafe(uploadDir, fullPath)) {
        return {
            valid: false,
            error: 'Invalid file path (path traversal detected)'
        };
    }

    return {
        valid: true,
        filename: safeFilename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size
    };
};

/**
 * Safely move uploaded file from temp to final destination
 * @param {string} sourcePath - Temp file path
 * @param {string} destPath - Final destination path
 * @returns {boolean} - Success status
 */
const moveUploadedFile = (sourcePath, destPath) => {
    try {
        // Verify destination is safe
        const baseDir = path.dirname(destPath);
        if (!isPathSafe(baseDir, destPath)) {
            throw new Error('Destination path is not safe');
        }

        // Ensure destination directory exists
        const dir = path.dirname(destPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
        }

        // Copy file atomically
        fs.copyFileSync(sourcePath, destPath);

        // Set restrictive file permissions (read-only for others)
        fs.chmodSync(destPath, 0o644);

        // Clean up temp file
        if (fs.existsSync(sourcePath)) {
            fs.unlinkSync(sourcePath);
        }

        return true;
    } catch (error) {
        console.error('File move error:', error);
        return false;
    }
};

/**
 * Delete uploaded file safely
 * @param {string} uploadDir - Base upload directory
 * @param {string} filePath - File path to delete
 * @returns {boolean} - Success status
 */
const deleteUploadedFile = (uploadDir, filePath) => {
    try {
        const fullPath = path.join(uploadDir, path.basename(filePath));

        // Verify path is safe
        if (!isPathSafe(uploadDir, fullPath)) {
            throw new Error('Invalid file path');
        }

        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            return true;
        }

        return false;
    } catch (error) {
        console.error('File deletion error:', error);
        return false;
    }
};

module.exports = {
    ALLOWED_EXTENSIONS,
    ALLOWED_MIMES,
    MAGIC_BYTES,
    validateUploadFile,
    sanitizeFilename,
    isPathSafe,
    verifyMagicBytes,
    moveUploadedFile,
    deleteUploadedFile
};
