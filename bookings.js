const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Book a session. Free sessions (volunteer/mentor, or professional sessions priced at 0)
// are confirmed immediately. Paid sessions are created as pending_payment and must be
// confirmed via POST /api/payments/confirm.
router.post('/', authenticate, async (req, res) => {
  const { session_id, scheduled_at } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id is required' });

  const sessionResult = await db.query('SELECT * FROM sessions WHERE id = $1', [session_id]);
  const session = sessionResult.rows[0];
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const amount = Number(session.price) || 0;
  const status = amount > 0 ? 'pending_payment' : 'confirmed';

  const booking = await db.query(
    `INSERT INTO bookings (session_id, user_id, status, amount, scheduled_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [session_id, req.user.id, status, amount, scheduled_at || null]
  );

  let payment = null;
  if (amount > 0) {
    const paymentResult = await db.query(
      `INSERT INTO payments (user_id, amount, direction, reference_type, reference_id, status)
       VALUES ($1, $2, 'charge', 'booking', $3, 'pending') RETURNING *`,
      [req.user.id, amount, booking.rows[0].id]
    );
    payment = paymentResult.rows[0];
  }

  res.status(201).json({ booking: booking.rows[0], payment });
});

// A normal user's own bookings
router.get('/mine', authenticate, async (req, res) => {
  const result = await db.query(
    `SELECT b.id, b.status, b.amount, b.scheduled_at, b.created_at,
            s.title AS session_title, s.kind, u.name AS host_name
     FROM bookings b
     JOIN sessions s ON s.id = b.session_id
     JOIN users u ON u.id = s.host_id
     WHERE b.user_id = $1
     ORDER BY b.created_at DESC`,
    [req.user.id]
  );
  res.json({ bookings: result.rows });
});

module.exports = router;
