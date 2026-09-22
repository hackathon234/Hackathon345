require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const sessionRoutes = require('./routes/sessions');
const bookingRoutes = require('./routes/bookings');
const listingRoutes = require('./routes/listings');
const paymentRoutes = require('./routes/payments');
const chatRoutes = require('./routes/chat');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN || '*' } });

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/chat', chatRoutes);

// Serve the static frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

/*
 * Live calls — minimal signaling/presence layer.
 * Each "call" is a Socket.IO room. Clients exchange WebRTC SDP/ICE messages through
 * this server, which never sees the audio/video itself (only routes call setup).
 * A production build would typically use a managed SFU (e.g. Daily.co, Twilio,
 * LiveKit) instead of raw peer-to-peer signaling for group calls at scale.
 */
io.on('connection', (socket) => {
  socket.on('call:join', ({ roomId, name }) => {
    socket.join(roomId);
    socket.to(roomId).emit('call:peer-joined', { socketId: socket.id, name });
  });

  socket.on('call:signal', ({ roomId, signal, to }) => {
    io.to(to || roomId).emit('call:signal', { from: socket.id, signal });
  });

  socket.on('call:leave', ({ roomId }) => {
    socket.leave(roomId);
    socket.to(roomId).emit('call:peer-left', { socketId: socket.id });
  });

  socket.on('disconnect', () => {
    socket.rooms.forEach((roomId) => socket.to(roomId).emit('call:peer-left', { socketId: socket.id }));
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Amani server running on http://localhost:${PORT}`);
});
