const express = require('express');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

/*
 * This router simulates a payment provider (e.g. M-Pesa Daraja or Stripe) so the
 * platform's booking/signup flow can be demoed end to end without live credentials.
 * To go live, swap the body of POST /confirm for a call to your provider's charge
 * API, and have their webhook call this same "mark payment paid" logic.
 */

// Confirm a pending charge (booking or listing signup) — simulates a successful payment.
router.post('/confirm', authenticate, async (req, res) => {
  const { payment_id } = req.body;
  if (!payment_id) return res.status(400).json({ error: 'payment_id is required' });

  const paymentResult = await db.query('SELECT * FROM payments WHERE id = $1 AND user_id = $2', [payment_id, req.user.id]);
  const payment = paymentResult.rows[0];
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  await db.query(`UPDATE payments SET status = 'paid' WHERE id = $1`, [payment_id]);

  if (payment.reference_type === 'booking') {
    await db.query(`UPDATE bookings SET status = 'confirmed' WHERE id = $1`, [payment.reference_id]);
  } else if (payment.reference_type === 'listing_signup') {
    await db.query(`UPDATE listing_signups SET status = 'confirmed' WHERE id = $1`, [payment.reference_id]);
  }

  res.json({ message: 'Payment confirmed', payment_id, status: 'paid' });
});

// My payment history
router.get('/mine', authenticate, async (req, res) => {
  const result = await db.query('SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
  res.json({ payments: result.rows });
});

// Professional: request a payout of earnings from confirmed, paid bookings.
router.post('/payout', authenticate, requireRole('professional'), async (req, res) => {
  const earned = await db.query(
    `SELECT COALESCE(SUM(b.amount), 0) AS total
     FROM bookings b
     JOIN sessions s ON s.id = b.session_id
     WHERE s.host_id = $1 AND b.status = 'confirmed'`,
    [req.user.id]
  );
  const paidOut = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
     WHERE user_id = $1 AND direction = 'payout' AND status = 'paid'`,
    [req.user.id]
  );
  const available = Number(earned.rows[0].total) - Number(paidOut.rows[0].total);
  if (available <= 0) return res.status(400).json({ error: 'No available balance to pay out' });

  const payout = await db.query(
    `INSERT INTO payments (user_id, amount, direction, reference_type, status, provider)
     VALUES ($1, $2, 'payout', 'host_payout', 'paid', 'mock') RETURNING *`,
    [req.user.id, available]
  );
  res.status(201).json({ payout: payout.rows[0] });
});

// Professional: available balance
router.get('/balance', authenticate, requireRole('professional'), async (req, res) => {
  const earned = await db.query(
    `SELECT COALESCE(SUM(b.amount), 0) AS total
     FROM bookings b JOIN sessions s ON s.id = b.session_id
     WHERE s.host_id = $1 AND b.status = 'confirmed'`,
    [req.user.id]
  );
  const paidOut = await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
     WHERE user_id = $1 AND direction = 'payout' AND status = 'paid'`,
    [req.user.id]
  );
  res.json({
    earned: Number(earned.rows[0].total),
    paid_out: Number(paidOut.rows[0].total),
    available: Number(earned.rows[0].total) - Number(paidOut.rows[0].total),
  });
});

module.exports = router;
