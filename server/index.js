require('express-async-errors');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Routes
const authRoutes = require('./routes/auth');
const claimsRoutes = require('./routes/claims');
const auditorRoutes = require('./routes/auditor');
const policyRoutes = require('./routes/policy');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const httpServer = http.createServer(app);

const IS_PROD = process.env.NODE_ENV === 'production';

// Socket.IO for real-time notifications
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Attach io to app so routes can access it
app.set('io', io);
app.set('trust proxy', 1);

// ========================
// Middleware
// ========================
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan(IS_PROD ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Rate limiting — global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PROD ? 200 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});
app.use('/api/', globalLimiter);

// Rate limiting — auth endpoints (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PROD ? 15 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please wait 15 minutes.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: IS_PROD ? '1d' : 0,
}));

// ========================
// Routes
// ========================
app.use('/api/auth', authRoutes);
app.use('/api/claims', claimsRoutes);
app.use('/api/auditor', auditorRoutes);
app.use('/api/policy', policyRoutes);
app.use('/api/analytics', analyticsRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ========================
// Socket.IO Events
// ========================
io.on('connection', (socket) => {
  if (!IS_PROD) console.log(`Client connected: ${socket.id}`);

  socket.on('join_room', (userId) => {
    socket.join(userId);
    if (!IS_PROD) console.log(`User ${userId} joined their notification room`);
  });

  socket.on('disconnect', () => {
    if (!IS_PROD) console.log(`Client disconnected: ${socket.id}`);
  });
});

// ========================
// Error Handler (must be last)
// ========================
app.use(errorHandler);

// ========================
// Start Server
// ========================
const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDB();
    httpServer.listen(PORT, () => {
      console.log(`\n🚀 Server running on http://localhost:${PORT}`);
      console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔌 Socket.IO enabled`);
      console.log(`🗜️  Compression enabled`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n⏳ ${signal} received. Shutting down gracefully...`);
  httpServer.close(async () => {
    const mongoose = require('mongoose');
    await mongoose.connection.close();
    console.log('✅ Server closed. DB disconnected.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
