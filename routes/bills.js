const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Start a bill
router.post('/start', (req, res) => {
  const { user_id, field_name } = req.body;

  if (!user_id || !field_name) {
    console.error('Missing required fields:', { user_id, field_name });
    return res.status(400).json({ message: 'User ID and field name are required' });
  }

  // Validate user_id
  db.query('SELECT id FROM users WHERE id = ?', [user_id], (err, userResult) => {
    if (err) {
      console.error('Database error checking user:', err);
      return res.status(500).json({ message: 'Internal server error', details: err.message });
    }
    if (userResult.length === 0) {
      console.error('User not found:', user_id);
      return res.status(404).json({ message: 'User not found' });
    }

    // Validate field_name
    db.query(
      'SELECT name, billing_type, cost_per_hour FROM tractor_fields WHERE name = ?',
      [field_name],
      (err, fieldResult) => {
        if (err) {
          console.error('Database error checking field:', err);
          return res.status(500).json({ message: 'Internal server error', details: err.message });
        }
        if (fieldResult.length === 0) {
          console.error('Field not found:', field_name);
          return res.status(404).json({ message: 'Field not found' });
        }
        if (fieldResult[0].billing_type !== 'time') {
          console.error('Field is not time-based:', field_name);
          return res.status(400).json({ message: 'Field must be time-based' });
        }

        // Insert bill
        const bill = {
          user_id,
          field_name,
          start_time: new Date(),
          status: 'running',
          cost_per_hour: fieldResult[0].cost_per_hour || 0.00, // Default to 0 if null
        };

        db.query(
          'INSERT INTO bills (user_id, field_name, start_time, status, cost_per_hour) VALUES (?, ?, ?, ?, ?)',
          [bill.user_id, bill.field_name, bill.start_time, bill.status, bill.cost_per_hour],
          (err, result) => {
            if (err) {
              console.error('Database error inserting bill:', err);
              return res.status(500).json({ message: 'Failed to start bill', details: err.message });
            }
            console.log('Bill started:', { billId: result.insertId, user_id, field_name });
            res.json({ success: true, billId: result.insertId });
          }
        );
      }
    );
  });
});

// Stop a bill
router.post('/stop', (req, res) => {
  const { billId } = req.body;

  if (!billId) {
    console.error('Missing billId');
    return res.status(400).json({ message: 'Bill ID is required' });
  }

  db.query(
    'SELECT start_time, cost_per_hour, field_name FROM bills WHERE id = ? AND status = ?',
    [billId, 'running'],
    (err, result) => {
      if (err) {
        console.error('Database error fetching bill:', err);
        return res.status(500).json({ message: 'Internal server error', details: err.message });
      }
      if (result.length === 0) {
        console.error('Bill not found or not running:', billId);
        return res.status(404).json({ message: 'Bill not found or not running' });
      }

      const startTime = new Date(result[0].start_time);
      const stopTime = new Date();
      const timeSeconds = Math.floor((stopTime - startTime) / 1000);
      const hours = timeSeconds / 3600;
      const cost = hours * result[0].cost_per_hour;
      const time = new Date(timeSeconds * 1000).toISOString().substr(11, 8);

      db.query(
        'UPDATE bills SET stop_time = ?, time = ?, cost = ?, status = ? WHERE id = ?',
        [stopTime, time, cost, 'pending', billId],
        (err) => {
          if (err) {
            console.error('Database error updating bill:', err);
            return res.status(500).json({ message: 'Failed to stop bill', details: err.message });
          }
          console.log('Bill stopped:', { billId, time, cost });
          res.json({ success: true, time, cost });
        }
      );
    }
  );
});

// Pay a bill
router.post('/pay', (req, res) => {
  const { billId, payment_method } = req.body;

  if (!billId || !payment_method) {
    console.error('Missing billId or payment_method:', { billId, payment_method });
    return res.status(400).json({ message: 'Bill ID and payment method are required' });
  }

  db.query(
    'UPDATE bills SET status = ? WHERE id = ? AND status = ?',
    ['completed', billId, 'pending'],
    (err, result) => {
      if (err) {
        console.error('Database error updating bill status:', err);
        return res.status(500).json({ message: 'Internal server error', details: err.message });
      }
      if (result.affectedRows === 0) {
        console.error('Bill not found or not pending:', billId);
        return res.status(404).json({ message: 'Bill not found or not pending' });
      }
      console.log('Bill marked as completed:', { billId });
      res.json({ success: true });
    }
  );
});

// Edit a bill
router.put('/edit/:billId', (req, res) => {
  const { billId } = req.params;
  const { time, cost, status } = req.body;

  if (!time || isNaN(cost) || !status) {
    console.error('Invalid edit data:', { time, cost, status });
    return res.status(400).json({ message: 'Time, cost, and status are required' });
  }

  db.query(
    'UPDATE bills SET time = ?, cost = ?, status = ? WHERE id = ?',
    [time, parseFloat(cost), status, billId],
    (err, result) => {
      if (err) {
        console.error('Database error editing bill:', err);
        return res.status(500).json({ message: 'Failed to edit bill', details: err.message });
      }
      if (result.affectedRows === 0) {
        console.error('Bill not found:', billId);
        return res.status(404).json({ message: 'Bill not found' });
      }
      console.log('Bill edited:', { billId, time, cost, status });
      res.json({ success: true });
    }
  );
});

// Get user bills
router.get('/user/:userId', (req, res) => {
  const { userId } = req.params;
  const { status, field_name } = req.query;

  let query = 'SELECT * FROM bills WHERE user_id = ?';
  const params = [userId];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (field_name) {
    query += ' AND field_name = ?';
    params.push(field_name);
  }

  db.query(query, params, (err, result) => {
    if (err) {
      console.error('Database error fetching bills:', err);
      return res.status(500).json({ message: 'Internal server error', details: err.message });
    }
    console.log('Fetched bills for user:', { userId, count: result.length });
    res.json(result);
  });
});

module.exports = router;
