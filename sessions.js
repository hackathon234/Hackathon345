const express = require('express');
const db = require('../db');
const { authenticate, authenticateOptional, requireRole } = require('../middleware/auth');

const router = express.Router();
const HOST_ROLES = ['professional', 'volunteer', 'mentor'];

// Public: list all sessions available for booking (previewable by guests, bookable once signed in)
router.get('/', authenticateOptional, async (req, res) => {
  const { kind } = req.query;
  const params = [];
  let where = '';
  if (kind && HOST_ROLES.includes(kind)) {
    params.push(kind);
    where = 'WHERE s.kind = $1';
  }
  const result = await db.query(
    `SELECT s.id, s.title, s.description, s.duration_minutes, s.price, s.kind, s.created_at,
            u.id AS host_id, u.name AS host_name
     FROM sessions s
     JOIN users u ON u.id = s.host_id
     ${where}
     ORDER BY s.created_at DESC`,
    params
  );
  res.json({ sessions: result.rows, authenticated: !!req.user });
});

// Host: upload a new session (professionals set a price, volunteers/mentors are free)
router.post('/', authenticate, requireRole(...HOST_ROLES), async (req, res) => {
  const { title, description, duration_minutes, price } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const finalPrice = req.user.role === 'professional' ? Number(price) || 0 : 0;

  const result = await db.query(
    `INSERT INTO sessions (host_id, kind, title, description, duration_minutes, price)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [req.user.id, req.user.role, title, description || null, duration_minutes || 45, finalPrice]
  );
  res.status(201).json({ session: result.rows[0] });
});

// Host: sessions I've uploaded
router.get('/mine', authenticate, requireRole(...HOST_ROLES), async (req, res) => {
  const result = await db.query('SELECT * FROM sessions WHERE host_id = $1 ORDER BY created_at DESC', [req.user.id]);
  res.json({ sessions: result.rows });
});

// Host: bookings received on my sessions
router.get('/mine/bookings', authenticate, requireRole(...HOST_ROLES), async (req, res) => {
  const result = await db.query(
    `SELECT b.id, b.status, b.amount, b.scheduled_at, b.created_at,
            s.title AS session_title, u.name AS booked_by
     FROM bookings b
     JOIN sessions s ON s.id = b.session_id
     JOIN users u ON u.id = b.user_id
     WHERE s.host_id = $1
     ORDER BY b.created_at DESC`,
    [req.user.id]
  );
  res.json({ bookings: result.rows });
});

module.exports = router;
