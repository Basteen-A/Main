const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Get all fields
router.get('/', (req, res) => {
  db.query('SELECT * FROM tractor_fields', (err, result) => {
    if (err) {
      console.error('Error fetching fields:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    res.json(result);
  });
});

// Add a new field
router.post('/', (req, res) => {
  let { name, cost_per_hour } = req.body;

  // Sanitize input
  if (typeof name !== 'string') {
    return res.status(400).json({ message: 'Field name must be a string' });
  }
  name = name.trim();
  if (!name) {
    return res.status(400).json({ message: 'Field name is required' });
  }
  if (name.length > 255) {
    return res.status(400).json({ message: 'Field name cannot exceed 255 characters' });
  }

  // Default cost_per_hour to 0 if not provided; validate if provided
  const finalCostPerHour = cost_per_hour !== undefined ? parseFloat(cost_per_hour) : 0;
  if (cost_per_hour !== undefined && (isNaN(finalCostPerHour) || finalCostPerHour < 0)) {
    return res.status(400).json({ message: 'Cost per hour must be a non-negative number' });
  }

  // Check if field name already exists
  db.query('SELECT * FROM tractor_fields WHERE name = ?', [name], (err, result) => {
    if (err) {
      console.error('Error checking field existence:', err);
      return res.status(500).json({ message: 'Internal server error', sqlError: err.code });
    }
    if (result.length > 0) {
      return res.status(400).json({ message: 'Field name already exists' });
    }

    // Insert new field
    db.query(
      'INSERT INTO tractor_fields (name, cost_per_hour) VALUES (?, ?)',
      [name, finalCostPerHour],
      (err, result) => {
        if (err) {
          console.error('Error adding field:', err);
          return res.status(500).json({ message: 'Failed to add field', sqlError: err.code });
        }
        const fieldId = result.insertId;
        res.json({
          success: true,
          field: { id: fieldId, name, cost_per_hour: finalCostPerHour },
        });
      }
    );
  });
});

// Delete a field
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  // Fetch field name and check for bills
  db.query('SELECT name FROM tractor_fields WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('Error fetching field:', err);
      return res.status(500).json({ message: 'Internal server error', sqlError: err.code });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: 'Field not found' });
    }
    const fieldName = result[0].name;

    // Check if field is used in bills
    db.query('SELECT COUNT(*) as count FROM bills WHERE field_name = ?', [fieldName], (err, result) => {
      if (err) {
        console.error('Error checking bills:', err);
        return res.status(500).json({ message: 'Internal server error', sqlError: err.code });
      }
      if (result[0].count > 0) {
        return res.status(400).json({ message: 'Cannot delete field with existing bills' });
      }

      // Delete field
      db.query('DELETE FROM tractor_fields WHERE id = ?', [id], (err, result) => {
        if (err) {
          console.error('Error deleting field:', err);
          return res.status(500).json({ message: 'Internal server error', sqlError: err.code });
        }
        res.json({ success: true, fieldName });
      });
    });
  });
});

module.exports = router;