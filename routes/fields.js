const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Get all fields
router.get('/', (req, res) => {
  db.query('SELECT * FROM tractor_fields', (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    res.json(result);
  });
});

// Add a new field
router.post('/', (req, res) => {
  const { name, cost_per_hour, billing_type } = req.body;

  // Validate input
  if (!name || !billing_type || (billing_type === 'time' && (!cost_per_hour || isNaN(cost_per_hour)))) {
    return res.status(400).json({ message: 'Field name, billing type, and valid cost per hour (for time-based) are required' });
  }

  // Check if field name already exists
  db.query('SELECT * FROM tractor_fields WHERE name = ?', [name], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    if (result.length > 0) {
      return res.status(400).json({ message: 'Field name already exists' });
    }

    // Insert new field
    db.query(
      'INSERT INTO tractor_fields (name, cost_per_hour, billing_type) VALUES (?, ?, ?)',
      [name, billing_type === 'count' ? 0 : parseFloat(cost_per_hour), billing_type],
      (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: 'Failed to add field' });
        }
        res.json({ success: true, fieldId: result.insertId });
      }
    );
  });
});

// Delete a field
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  db.query('DELETE FROM tractor_fields WHERE id = ?', [id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    res.json({ success: true });
  });
});

module.exports = router;