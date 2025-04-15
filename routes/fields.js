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

// Add a new timer-based field
router.post('/', (req, res) => {
  const { name, cost_per_hour } = req.body;

  // Validate input
  if (!name || !cost_per_hour || isNaN(cost_per_hour)) {
    return res.status(400).json({ message: 'Field name and valid cost per hour are required' });
  }

  // Check if field name already exists (since name is UNIQUE in schema)
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
      'INSERT INTO tractor_fields (name, cost_per_hour) VALUES (?, ?)',
      [name, parseFloat(cost_per_hour)],
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

// Add a new count-based field
router.post('/count', (req, res) => {
  const { name } = req.body;

  // Validate input
  if (!name) {
    return res.status(400).json({ message: 'Field name is required' });
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

    // Insert new count-based field with cost_per_hour = 0.00
    db.query(
      'INSERT INTO tractor_fields (name, cost_per_hour) VALUES (?, 0.00)',
      [name],
      (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: 'Failed to add count field' });
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