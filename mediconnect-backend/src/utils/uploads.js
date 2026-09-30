const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { ApiError } = require("../middleware/errorHandler");

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");
const ALLOWED_MIME = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// Files are renamed to a random token on disk (never trust the original
// filename) and served only through an authenticated/authorized route,
// never as static files — this mitigates path traversal and unauthorized access.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_ROOT),
  filename: (req, file, cb) => {
    const token = crypto.randomBytes(16).toString("hex");
    cb(null, `${token}${path.extname(file.originalname).slice(0, 10)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new ApiError(400, "Unsupported file type."));
    }
    cb(null, true);
  },
});

module.exports = { upload, UPLOAD_ROOT, ALLOWED_MIME };
