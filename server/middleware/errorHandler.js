const fs = require('fs');
const path = require('path');

const IS_PROD = process.env.NODE_ENV === 'production';
const LOG_FILE = path.join(__dirname, '..', 'error.log');

function logToFile(entry) {
  const line = JSON.stringify(entry) + '\n';
  fs.appendFile(LOG_FILE, line, () => {});
}

const errorHandler = (err, req, res, next) => {
  const timestamp = new Date().toISOString();
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}`;

  const logEntry = {
    timestamp,
    requestId,
    method: req.method,
    path: req.originalUrl,
    status: err.statusCode || 500,
    message: err.message,
    ...(IS_PROD ? {} : { stack: err.stack }),
  };

  console.error(`[${timestamp}] [${requestId}] ${err.message}`);
  if (!IS_PROD) console.error(err.stack);
  logToFile(logEntry);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: 'Validation Error', errors: messages, requestId });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({ message: `${field} already exists`, requestId });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ message: 'Invalid token', requestId });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ message: 'Token has expired. Please sign in again.', requestId });
  }

  // Multer file size limit
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File too large. Max size is 10MB.', requestId });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    message: IS_PROD ? 'Internal Server Error' : (err.message || 'Internal Server Error'),
    requestId,
    ...(IS_PROD ? {} : { stack: err.stack }),
  });
};

module.exports = errorHandler;
