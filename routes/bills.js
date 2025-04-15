const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get('/user/:userId', (req, res) => {
  const { userId } = req.params;
  db.query(
    'SELECT * FROM bills WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      res.json(result);
    }
  );
});

router.post('/start', (req, res) => {
  const { user_id, field_name } = req.body;
  if (!user_id || !field_name) {
    return res.status(400).json({ message: 'User ID and field name are required' });
  }
  db.query(
    'INSERT INTO bills (user_id, field_name, start_time, status) VALUES (?, ?, NOW(), ?)',
    [user_id, field_name, 'pending'],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to start timer' });
      }
      res.json({ success: true, billId: result.insertId });
    }
  );
});

router.post('/stop', (req, res) => {
  const { billId } = req.body;
  if (!billId) {
    return res.status(400).json({ message: 'Bill ID is required' });
  }
  db.query(
    'SELECT start_time, field_name FROM bills WHERE id = ? AND stop_time IS NULL',
    [billId],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: 'Bill not found or already stopped' });
      }
      const { start_time, field_name } = result[0];
      db.query(
        'SELECT cost_per_hour FROM tractor_fields WHERE name = ?',
        [field_name],
        (err, fieldResult) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Internal server error' });
          }
          if (fieldResult.length === 0) {
            return res.status(404).json({ message: 'Field not found' });
          }
          const costPerHour = parseFloat(fieldResult[0].cost_per_hour);
          const startTime = new Date(start_time);
          const stopTime = new Date();
          const hours = (stopTime - startTime) / (1000 * 60 * 60);
          const cost = costPerHour * hours;
          const seconds = Math.floor((stopTime - startTime) / 1000);
          const hoursFormatted = Math.floor(seconds / 3600);
          const minutesFormatted = Math.floor((seconds % 3600) / 60);
          const secondsFormatted = seconds % 60;
          const time = `${hoursFormatted.toString().padStart(2, '0')}:${minutesFormatted
            .toString()
            .padStart(2, '0')}:${secondsFormatted.toString().padStart(2, '0')}`;
          db.query(
            'UPDATE bills SET stop_time = NOW(), time = ?, cost = ? WHERE id = ?',
            [time, cost.toFixed(2), billId],
            (err) => {
              if (err) {
                console.error(err);
                return res.status(500).json({ message: 'Failed to stop timer' });
              }
              res.json({ success: true, time, cost: parseFloat(cost.toFixed(2)) });
            }
          );
        }
      );
    }
  );
});

router.post('/start-count', (req, res) => {
  const { user_id, field_name, price_per_count } = req.body;
  if (!user_id || !field_name || !price_per_count || isNaN(price_per_count)) {
    return res.status(400).json({ message: 'User ID, field name, and valid price per count are required' });
  }
  db.query(
    'SELECT cost_per_hour FROM tractor_fields WHERE name = ?',
    [field_name],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: 'Field not found' });
      }
      if (parseFloat(result[0].cost_per_hour) !== 0) {
        return res.status(400).json({ message: 'Field is not count-based' });
      }
      db.query(
        'INSERT INTO bills (user_id, field_name, start_time, status, count, price_per_count) VALUES (?, ?, NOW(), ?, 0, ?)',
        [user_id, field_name, 'pending', parseFloat(price_per_count)],
        (err, result) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Failed to start count' });
          }
          res.json({ success: true, billId: result.insertId });
        }
      );
    }
  );
});

router.post('/update-count', (req, res) => {
  const { billId, count } = req.body;
  if (!billId || count === undefined || isNaN(count)) {
    return res.status(400).json({ message: 'Bill ID and valid count are required' });
  }
  db.query(
    'UPDATE bills SET count = ? WHERE id = ? AND stop_time IS NULL',
    [count, billId],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to update count' });
      }
      res.json({ success: true });
    }
  );
});

router.post('/stop-count', (req, res) => {
  const { billId } = req.body;
  if (!billId) {
    return res.status(400).json({ message: 'Bill ID is required' });
  }
  db.query(
    'SELECT count, price_per_count FROM bills WHERE id = ? AND stop_time IS NULL',
    [billId],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: 'Bill not found or already stopped' });
      }
      const { count, price_per_count } = result[0];
      const cost = count * price_per_count;
      db.query(
        'UPDATE bills SET stop_time = NOW(), cost = ? WHERE id = ?',
        [cost.toFixed(2), billId],
        (err) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Failed to stop count' });
          }
          res.json({ success: true, count, cost: parseFloat(cost.toFixed(2)) });
        }
      );
    }
  );
});

router.post('/pay', (req, res) => {
  const { billId, payment_method } = req.body;
  if (!billId || !payment_method) {
    return res.status(400).json({ message: 'Bill ID and payment method are required' });
  }
  db.query(
    'UPDATE bills SET status = ?, payment_method = ? WHERE id = ?',
    ['completed', payment_method, billId],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to mark bill as paid' });
      }
      res.json({ success: true });
    }
  );
});

router.delete('/user/:userId', (req, res) => {
  const { userId } = req.params;
  db.query('DELETE FROM bills WHERE user_id = ?', [userId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Failed to delete bill history' });
    }
    res.json({ success: true });
  });
});

module.exports = router;