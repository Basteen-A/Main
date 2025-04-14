const express = require('express');
const router = express.Router();

router.post('/signal', (req, res) => {
  const { billId, action } = req.body;
  if (!billId || !action) {
    return res.status(400).json({ message: 'billId and action required' });
  }
  console.log('Received IoT signal:', { billId, action });
  // Add IoT logic (e.g., trigger device, log to DB)
  res.json({ success: true });
});

module.exports = router;