const express = require('express');
const db = require('../db');
const { authenticate, authenticateOptional, requireRole } = require('../middleware/auth');

const router = express.Router();

// Public preview: only the 3 nearest-dated upcoming events, minimal detail, no sign-up.
router.get('/preview', async (req, res) => {
  const result = await db.query(
    `SELECT id, title, type, county, event_date, price
     FROM listings
     WHERE type = 'event' AND event_date >= CURRENT_DATE
     ORDER BY event_date ASC
     LIMIT 3`
  );
  res.json({ listings: result.rows });
});

// Full listing feed — filterable by location, constituency, county, sub_county.
// Full detail is only returned to authenticated users; guests get the preview shape.
router.get('/', authenticateOptional, async (req, res) => {
  const { type, county, constituency, sub_county } = req.query;
  const clauses = [];
  const params = [];

  if (type === 'event' || type === 'gathering') {
    params.push(type);
    clauses.push(`type = $${params.length}`);
  }
  if (county) { params.push(county); clauses.push(`county = $${params.length}`); }
  if (constituency) { params.push(constituency); clauses.push(`constituency = $${params.length}`); }
  if (sub_county) { params.push(sub_county); clauses.push(`sub_county = $${params.length}`); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT l.*, u.name AS organizer_name
     FROM listings l JOIN users u ON u.id = l.organizer_id
     ${where}
     ORDER BY event_date ASC`,
    params
  );

  if (!req.user) {
    // Guests see title/date/location/price but not the description or organizer contact.
    const stripped = result.rows.map(({ description, organizer_id, ...rest }) => rest);
    return res.json({ listings: stripped, authenticated: false });
  }
  res.json({ listings: result.rows, authenticated: true });
});

// Organizer/partner: create a new event or gathering listing
router.post('/', authenticate, requireRole('organizer', 'partner'), async (req, res) => {
  const { type, title, description, county, constituency, sub_county, location, event_date, price } = req.body;
  if (!type || !title || !county || !event_date) {
    return res.status(400).json({ error: 'type, title, county and event_date are required' });
  }
  const result = await db.query(
    `INSERT INTO listings (organizer_id, type, title, description, county, constituency, sub_county, location, event_date, price)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.user.id, type, title, description || null, county, constituency || null, sub_county || null, location || null, event_date, Number(price) || 0]
  );
  res.status(201).json({ listing: result.rows[0] });
});

// Organizer/partner: my own published listings
router.get('/mine', authenticate, requireRole('organizer', 'partner'), async (req, res) => {
  const result = await db.query('SELECT * FROM listings WHERE organizer_id = $1 ORDER BY event_date ASC', [req.user.id]);
  res.json({ listings: result.rows });
});

// Normal user: sign up for an event/gathering. Paid listings create a pending payment.
router.post('/:id/signup', authenticate, async (req, res) => {
  const { id } = req.params;
  const listingResult = await db.query('SELECT * FROM listings WHERE id = $1', [id]);
  const listing = listingResult.rows[0];
  if (!listing) return res.status(404).json({ error: 'Listing not found' });

  const amount = Number(listing.price) || 0;
  const status = amount > 0 ? 'pending_payment' : 'confirmed';

  const signup = await db.query(
    `INSERT INTO listing_signups (listing_id, user_id, status, amount)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (listing_id, user_id) DO UPDATE SET status = EXCLUDED.status
     RETURNING *`,
    [id, req.user.id, status, amount]
  );

  let payment = null;
  if (amount > 0) {
    const paymentResult = await db.query(
      `INSERT INTO payments (user_id, amount, direction, reference_type, reference_id, status)
       VALUES ($1,$2,'charge','listing_signup',$3,'pending') RETURNING *`,
      [req.user.id, amount, signup.rows[0].id]
    );
    payment = paymentResult.rows[0];
  }

  res.status(201).json({ signup: signup.rows[0], payment });
});

module.exports = router;
