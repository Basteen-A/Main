const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.query('SELECT * FROM users WHERE username = ? AND password = ?', 
    [username, password], 
    (err, result) => {
      if (err) throw err;
      if (result.length > 0) {
        res.json({ success: true, user: result[0] });
      } else {
        res.json({ success: false, message: 'Invalid credentials' });
      }
    });
});

router.post('/signup', (req, res) => {
  const { username, password } = req.body;
  db.query('INSERT INTO users (username, password, is_admin) VALUES (?, ?, 0)', 
    [username, password], 
    (err, result) => {
      if (err) throw err;
      res.json({ success: true, userId: result.insertId });
    });
});

module.exports = router;