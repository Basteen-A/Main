const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get('/', (req, res) => {
  db.query('SELECT id, username FROM users WHERE is_admin = 0', (err, result) => {
    if (err) throw err;
    res.json(result);
  });
});

router.delete('/:id', (req, res) => {
  db.query('DELETE FROM users WHERE id = ?', [req.params.id], (err) => {
    if (err) throw err;
    res.json({ success: true });
  });
});

router.get('/search', (req, res) => {
  const { query } = req.query;
  db.query('SELECT id, username FROM users WHERE username LIKE ? AND is_admin = 0', 
    [`%${query}%`], 
    (err, result) => {
      if (err) throw err;
      res.json(result);
    });
});

router.delete('/:id', (req, res) => {
    const { id } = req.params;
  
    db.query('DELETE FROM users WHERE id = ?', [id], (err) => {
      if (err) {
        console.error('Error deleting user:', err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      res.json({ success: true });
    });
  });

module.exports = router;