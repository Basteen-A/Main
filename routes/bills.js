const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Start a bill
router.post('/start', (req, res) => {
  const { user_id, field_name, price_per_count } = req.body;

  if (!user_id || !field_name) {
    return res.status(400).json({ message: 'User ID and field name are required' });
  }

  // Validate field exists
  db.query('SELECT cost_per_hour FROM tractor_fields WHERE name = ?', [field_name], (err, result) => {
    if (err) {
      console.error('Error checking field:', err);
      return res.status(500).json({ message: 'Internal server error', sqlError: err.code });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: 'Field not found' });
    }
    const isCountField = result[0].cost_per_hour === 0;
    if (isCountField && (!price_per_count || price_per_count <= 0)) {
      return res.status(400).json({ message: 'Price per count must be a positive number for count fields' });
    }

    // Insert bill
    db.query(
      'INSERT INTO bills (user_id, field_name, start_time, status, price_per_count) VALUES (?, ?, NOW(), ?, ?)',
      [user_id, field_name, 'running', isCountField ? price_per_count : null],
      (err, result) => {
        if (err) {
          console.error('Error starting bill:', err);
          return res.status(500).json({ message: 'Failed to start bill', sqlError: err.code });
        }
        res.json({ billId: result.insertId });
      }
    );
  });
});

// Stop a bill
router.post('/stop', (req, res) => {
  const { billId, count, cost } = req.body;

  if (!billId) {
    return res.status(400).json({ message: 'Bill ID is required' });
  }

  // Fetch bill and field
  db.query(
    'SELECT b.*, f.cost_per_hour FROM bills b JOIN tractor_fields f ON b.field_name = f.name WHERE b.id = ? AND b.stop_time IS NULL',
    [billId],
    (err, result) => {
      if (err) {
        console.error('Error fetching bill:', err);
        return res.status(500).json({ message: 'Internal server error', sqlError: err.code });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: 'Bill not found or already stopped' });
      }
      const bill = result[0];
      const isCountField = bill.cost_per_hour === 0;

      if (isCountField) {
        if (count === undefined || cost === undefined) {
          return res.status(400).json({ message: 'Count and cost are required for count fields' });
        }
        db.query(
          'UPDATE bills SET stop_time = NOW(), count = ?, cost = ?, status = ? WHERE id = ?',
          [count, cost, 'pending', billId],
          (err, result) => {
            if (err) {
              console.error('Error stopping bill:', err);
              return res.status(500).json({ message: 'Failed to stop bill', sqlError: err.code });
            }
            res.json({ count, cost });
          }
        );
      } else {
        const startTime = new Date(bill.start_time);
        const endTime = new Date();
        const seconds = Math.floor((endTime - startTime) / 1000);
        const hours = seconds / 3600;
        const cost = hours * bill.cost_per_hour;
        const time = new Date(seconds * 1000).toISOString().substr(11, 8);

        db.query(
          'UPDATE bills SET stop_time = NOW(), time = ?, cost = ?, status = ? WHERE id = ?',
          [time, cost.toFixed(2), 'pending', billId],
          (err, result) => {
            if (err) {
              console.error('Error stopping bill:', err);
              return res.status(500).json({ message: 'Failed to stop bill', sqlError: err.code });
            }
            res.json({ time, cost });
          }
        );
      }
    }
  );
});

// Edit a bill
router.post('/edit', (req, res) => {
  const { billId, time, cost, count } = req.body;

  if (!billId) {
    return res.status(400).json({ message: 'Bill ID is required' });
  }

  db.query('SELECT field_name FROM bills WHERE id = ?', [billId], (err, result) => {
    if (err) {
      console.error('Error fetching bill:', err);
      return res.status(500).json({ message: 'Internal server error', sqlError: err.code });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    db.query('SELECT cost_per_hour FROM tractor_fields WHERE name = ?', [result[0].field_name], (err, fieldResult) => {
      if (err) {
        console.error('Error fetching field:', err);
        return res.status(500).json({ message: 'Internal server error', sqlError: err.code });
      }
      const isCountField = fieldResult[0].cost_per_hour === 0;

      const updates = {};
      if (isCountField) {
        if (count !== undefined) updates.count = parseInt(count);
        if (cost !== undefined) updates.cost = parseFloat(cost);
      } else {
        if (time && /^\d{1,2}:\d{2}:\d{2}$/.test(time)) updates.time = time;
        if (cost !== undefined) updates.cost = parseFloat(cost);
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: 'No valid fields to update' });
      }

      const fields = Object.keys(updates).map(field => `${field} = ?`).join(', ');
      const values = Object.values(updates);
      values.push(billId);

      db.query(
        `UPDATE bills SET ${fields} WHERE id = ?`,
        values,
        (err, result) => {
          if (err) {
            console.error('Error editing bill:', err);
            return res.status(500).json({ message: 'Failed to edit bill', sqlError: err.code });
          }
          res.json({ success: true });
        }
      );
    });
  });
});

// Mark bill as paid
router.post('/pay', (req, res) => {
  const { billId, payment_method } = req.body;

  if (!billId || !payment_method) {
    return res.status(400).json({ message: 'Bill ID and payment method are required' });
  }

  db.query(
    'UPDATE bills SET status = ?, payment_method = ? WHERE id = ? AND status = ?',
    ['completed', payment_method, billId, 'pending'],
    (err, result) => {
      if (err) {
        console.error('Error paying bill:', err);
        return res.status(500).json({ message: 'Failed to mark bill as paid', sqlError: err.code });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Bill not found or not pending' });
      }
      res.json({ success: true });
    }
  );
});

// Get bills for a user
router.get('/user/:userId', (req, res) => {
  const { userId } = req.params;
  const { field_name, month } = req.query;

  let query = 'SELECT * FROM bills WHERE user_id = ?';
  const params = [userId];

  if (field_name) {
    query += ' AND field_name = ?';
    params.push(field_name);
  }
  if (month) {
    query += ' AND DATE_FORMAT(start_time, "%Y-%m") = ?';
    params.push(month);
  }

  db.query(query, params, (err, result) => {
    if (err) {
      console.error('Error fetching bills:', err);
      return res.status(500).json({ message: 'Internal server error', sqlError: err.code });
    }
    res.json(result);
  });
});

module.exports = router;