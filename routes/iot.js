const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.post('/signal', (req, res) => {
  const { billId, action } = req.body;
  if (!billId || !action) {
    return res.status(400).json({ message: 'Bill ID and action are required' });
  }
  // Log to database (optional)
  db.query(
    'INSERT INTO iot_logs (bill_id, action, created_at) VALUES (?, ?, NOW())',
    [billId, action],
    (err) => {
      if (err) {
        console.error('Error logging IoT signal:', err);
        return res.status(500).json({ message: 'Failed to log signal' });
      }
      res.json({ success: true });
    }
  );
});

module.exports = router;