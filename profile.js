const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/me', authenticate, async (req, res) => {
  const result = await db.query(
    `SELECT id, name, email, role, bio, county, constituency, sub_county, location, created_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ user: result.rows[0] });
});

router.put('/me', authenticate, async (req, res) => {
  const { name, bio, county, constituency, sub_county, location } = req.body;
  const result = await db.query(
    `UPDATE users SET
       name = COALESCE($1, name),
       bio = COALESCE($2, bio),
       county = COALESCE($3, county),
       constituency = COALESCE($4, constituency),
       sub_county = COALESCE($5, sub_county),
       location = COALESCE($6, location)
     WHERE id = $7
     RETURNING id, name, email, role, bio, county, constituency, sub_county, location, created_at`,
    [name, bio, county, constituency, sub_county, location, req.user.id]
  );
  res.json({ user: result.rows[0] });
});

module.exports = router;
