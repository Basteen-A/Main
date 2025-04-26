const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Get all non-admin users
router.get('/', (req, res) => {
  db.query('SELECT id, username FROM users WHERE is_admin = 0', (err, result) => {
    if (err) {
      console.error('Error fetching users:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    res.json(result);
  });
});

// Search non-admin users by username
router.get('/search', (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ message: 'Search query is required' });
  }
  db.query(
    'SELECT id, username FROM users WHERE username LIKE ? AND is_admin = 0',
    [`%${query}%`],
    (err, result) => {
      if (err) {
        console.error('Error searching users:', err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      res.json(result);
    }
  );
});

// Delete a user
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM users WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('Error deleting user:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ success: true });
  });
});

module.exports = router;