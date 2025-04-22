const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Get all bills for a specific user with optional filters
router.get('/user/:userId', (req, res) => {
  const { userId } = req.params;
  const { status, field_name } = req.query;
  let query = 'SELECT b.id, b.user_id, b.field_id, b.field_name, b.time, b.cost, b.count, b.price_per_count, b.status, b.payment_method, b.created_at, b.start_time, b.stop_time FROM bills b WHERE user_id = ?';
  const params = [userId];

  if (status) {
    query += ' AND b.status = ?';
    params.push(status);
  }
  if (field_name) {
    query += ' AND b.field_name = ?';
    params.push(field_name);
  }
  query += ' ORDER BY created_at DESC';

  db.query(query, params, (err, result) => {
    if (err) {
      console.error('Error fetching bills:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    res.json(result);
  });
});

// Start a new bill (timer or count)
router.post('/start', (req, res) => {
  const { user_id, field_name, count } = req.body;
  if (!user_id || !field_name) return res.status(400).json({ message: 'User ID and field name are required' });

  db.query(
    'SELECT id, cost_per_hour, billing_type FROM tractor_fields WHERE name = ?',
    [field_name],
    (err, fieldResult) => {
      if (err) {
        console.error('Error checking field:', err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      if (fieldResult.length === 0) {
        return res.status(400).json({ message: 'Field does not exist' });
      }

      const { id: fieldId, billing_type } = fieldResult[0];
      const isCountBased = billing_type === 'count';
      const startTime = new Date();

      if (isCountBased && count && count > 0) {
        const pricePerCount = 40; // Replace with dynamic logic if needed
        const cost = count * pricePerCount;
        db.query(
          'INSERT INTO bills (user_id, field_id, field_name, start_time, status, count, price_per_count, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [user_id, fieldId, field_name, startTime, 'running', count, pricePerCount, cost],
          (err, result) => {
            if (err) {
              console.error('Error starting bill:', err);
              return res.status(500).json({ message: 'Failed to start bill' });
            }
            res.json({ success: true, billId: result.insertId, start_time: startTime.toISOString(), isCountBased });
          }
        );
      } else {
        db.query(
          'INSERT INTO bills (user_id, field_id, field_name, start_time, status) VALUES (?, ?, ?, ?, ?)',
          [user_id, fieldId, field_name, startTime, 'running'],
          (err, result) => {
            if (err) {
              console.error('Error starting bill:', err);
              return res.status(500).json({ message: 'Failed to start bill' });
            }
            res.json({ success: true, billId: result.insertId, start_time: startTime.toISOString(), isCountBased });
          }
        );
      }
    }
  );
});

// Stop a bill (timer or count)
router.post('/stop', (req, res) => {
  const { billId, count, price_per_count } = req.body;
  if (!billId) return res.status(400).json({ message: 'Bill ID is required' });

  db.query(
    `SELECT b.start_time, b.count, tf.cost_per_hour, tf.billing_type 
     FROM bills b 
     JOIN tractor_fields tf ON b.field_id = tf.id 
     WHERE b.id = ? AND b.stop_time IS NULL AND b.status = "running"`,
    [billId],
    (err, result) => {
      if (err) {
        console.error('Error fetching bill:', err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      if (result.length === 0) {
        return res.status(400).json({ message: 'Bill not found or not running' });
      }

      const { start_time, cost_per_hour, billing_type } = result[0];
      const isCountBased = billing_type === 'count';
      const stopTime = new Date();

      let timeString = null, cost = null;
      if (!isCountBased) {
        const startTime = new Date(start_time);
        const diffMs = stopTime - startTime;
        const diffSec = Math.floor(diffMs / 1000);
        const hours = Math.floor(diffSec / 3600);
        const minutes = Math.floor((diffSec % 3600) / 60);
        const seconds = diffSec % 60;
        timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        const timeInHours = diffMs / (1000 * 60 * 60);
        cost = Number((timeInHours * cost_per_hour).toFixed(2));
      } else {
        if (!count && !result[0].count) return res.status(400).json({ message: 'Count is required for count-based billing' });
        if (!price_per_count) return res.status(400).json({ message: 'Price per count is required' });
        const finalCount = count || result[0].count;
        cost = Number((finalCount * price_per_count).toFixed(2));
      }

      db.query(
        `UPDATE bills 
         SET stop_time = ?, time = ?, cost = ?, count = ?, price_per_count = ?, status = 'pending'
         WHERE id = ?`,
        [stopTime, timeString, cost, isCountBased ? count || result[0].count : null, isCountBased ? price_per_count : null, billId],
        (err, updateResult) => {
          if (err) {
            console.error('Error updating bill:', err);
            return res.status(500).json({ message: 'Failed to update bill' });
          }
          if (updateResult.affectedRows === 0) {
            return res.status(400).json({ message: 'Bill update failed' });
          }
          res.json({ success: true, time: timeString, cost, count: isCountBased ? count || result[0].count : null });
        }
      );
    }
  );
});

// Edit a bill
router.put('/edit/:billId', (req, res) => {
  const { billId } = req.params;
  const { time, cost, count, price_per_count, status } = req.body;

  if (!cost || !status || (count && !price_per_count)) {
    return res.status(400).json({ message: 'Cost, status, and price per count (if count is provided) are required' });
  }

  db.query(
    `SELECT tf.billing_type FROM bills b JOIN tractor_fields tf ON b.field_id = tf.id WHERE b.id = ?`,
    [billId],
    (err, result) => {
      if (err) {
        console.error('Error fetching bill:', err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      if (result.length === 0) {
        return res.status(400).json({ message: 'Bill not found' });
      }

      const isCountBased = result[0].billing_type === 'count';
      const updateFields = [];
      const params = [];

      if (time && !isCountBased) {
        updateFields.push('time = ?');
        params.push(time);
      }
      if (cost) {
        updateFields.push('cost = ?');
        params.push(parseFloat(cost));
      }
      if (count && isCountBased) {
        updateFields.push('count = ?');
        params.push(parseInt(count));
      }
      if (price_per_count && isCountBased) {
        updateFields.push('price_per_count = ?');
        params.push(parseFloat(price_per_count));
      }
      if (status) {
        updateFields.push('status = ?');
        params.push(status);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ message: 'No valid fields to update' });
      }

      params.push(billId);
      const query = `UPDATE bills SET ${updateFields.join(', ')} WHERE id = ?`;

      db.query(query, params, (err, updateResult) => {
        if (err) {
          console.error('Error updating bill:', err);
          return res.status(500).json({ message: 'Failed to update bill' });
        }
        if (updateResult.affectedRows === 0) {
          return res.status(400).json({ message: 'Bill update failed' });
        }
        res.json({ success: true });
      });
    }
  );
});

// ... other routes (pay, delete) remain unchanged ...


// ... other routes (pay, delete) remain unchanged ...

// Delete all bills for a user
router.delete('/user/:userId', (req, res) => {
  const { userId } = req.params;

  db.query(
    'DELETE FROM bills WHERE user_id = ?',
    [userId],
    (err) => {
      if (err) {
        console.error('Error deleting bill history:', err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      console.log(`Bill history deleted for user ${userId}`);
      res.json({ success: true });
    }
  );
});

// Pay a bill
router.post('/pay', (req, res) => {
  const { billId, payment_method } = req.body;

  if (!billId || !payment_method) {
    return res.status(400).json({ message: 'Bill ID and payment method are required' });
  }

  db.query(
    'UPDATE bills SET status = "completed", payment_method = ? WHERE id = ? AND status = "pending"',
    [payment_method, billId],
    (err, result) => {
      if (err) {
        console.error('Error paying bill:', err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      if (result.affectedRows === 0) {
        return res.status(400).json({ message: 'Bill not found or already paid' });
      }
      console.log(`Bill ID ${billId} paid via ${payment_method}`);
      res.json({ success: true });
    }
  );
});

module.exports = router;