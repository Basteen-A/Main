const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcrypt'); // Add bcrypt for password hashing
const saltRounds = 10; // Number of salt rounds for hashing

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.query('SELECT * FROM users WHERE username = ?', [username], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
    if (result.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = result[0];
    bcrypt.compare(password, user.password, (err, match) => {
      if (err) {
        console.error('Bcrypt compare error:', err);
        return res.status(500).json({ success: false, message: 'Internal server error' });
      }
      if (match) {
        const { password, ...userWithoutPassword } = user; // Exclude password
        res.json({ success: true, userId: user.id, user: userWithoutPassword });
      } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
    });
  });
});

router.post('/signup', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
      console.error('Bcrypt hash error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }

    db.query('INSERT INTO users (username, password, is_admin) VALUES (?, ?, 0)', [username, hash], (err, result) => {
      if (err) {
        console.error('Database error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ success: false, message: 'Username already exists' });
        }
        return res.status(500).json({ success: false, message: 'Internal server error' });
      }
      res.json({ success: true, userId: result.insertId, username, is_admin: 0 });
    });
  });
});

module.exports = router;
