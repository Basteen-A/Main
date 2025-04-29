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

  db.query('SELECT id FROM users WHERE id = ?', [user_id], (err, userResult) => {
    if (err) {
      console.error('Database error checking user:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    if (userResult.length === 0) {
      console.error('User not found:', user_id);
      return res.status(404).json({ message: 'User not found' });
    }

    db.query(
      'SELECT name, billing_type, cost_per_hour FROM tractor_fields WHERE name = ?',
      [field_name],
      (err, fieldResult) => {
        if (err) {
          console.error('Database error checking field:', err);
          return res.status(500).json({ message: 'Internal server error' });
        }
        if (fieldResult.length === 0) {
          console.error('Field not found:', field_name);
          return res.status(404).json({ message: 'Field not found' });
        }
        if (fieldResult[0].billing_type !== 'time') {
          console.error('Field is not time-based:', field_name);
          return res.status(400).json({ message: 'Field must be time-based' });
        }

        const bill = {
          user_id,
          field_name,
          start_time: new Date(),
          status: 'running',
          cost_per_hour: fieldResult[0].cost_per_hour || 0.00,
        };

        db.query(
          'INSERT INTO bills (user_id, field_name, start_time, status, cost_per_hour) VALUES (?, ?, ?, ?, ?)',
          [bill.user_id, bill.field_name, bill.start_time, bill.status, bill.cost_per_hour],
          (err, result) => {
            if (err) {
              console.error('Database error inserting bill:', err);
              return res.status(500).json({ message: 'Failed to start bill' });
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
        return res.status(500).json({ message: 'Internal server error' });
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
            return res.status(500).json({ message: 'Failed to stop bill' });
          }
          console.log('Bill stopped:', { billId, time, cost });
          res.json({ success: true, time, cost });
        }
      );
    }
  );
});

// Pay a bill (full or partial payment)
router.post('/pay', (req, res) => {
  const { billId, payment_method, amount } = req.body;

  if (!billId || !payment_method || !amount || amount <= 0) {
    console.error('Invalid payment data:', { billId, payment_method, amount });
    return res.status(400).json({ message: 'Bill ID, payment method, and valid amount are required' });
  }

  db.query(
    'SELECT cost, status FROM bills WHERE id = ?',
    [billId],
    (err, billResult) => {
      if (err) {
        console.error('Database error fetching bill:', err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      if (billResult.length === 0 || billResult[0].status !== 'pending') {
        console.error('Bill not found or not pending:', billId);
        return res.status(404).json({ message: 'Bill not found or not pending' });
      }

      const billCost = parseFloat(billResult[0].cost);
      db.query(
        'SELECT SUM(amount) as totalPaid FROM payments WHERE bill_id = ? AND status = ?',
        [billId, 'completed'],
        (err, paymentSum) => {
          if (err) {
            console.error('Database error calculating payments:', err);
            return res.status(500).json({ message: 'Internal server error' });
          }
          const totalPaid = parseFloat(paymentSum[0].totalPaid) || 0;
          if (amount > (billCost - totalPaid)) {
            console.error('Payment amount exceeds remaining bill cost:', { billId, amount, billCost, totalPaid });
            return res.status(400).json({ message: 'Payment amount cannot exceed remaining bill cost' });
          }

          db.query(
            'INSERT INTO payments (bill_id, amount, payment_method, status) VALUES (?, ?, ?, ?)',
            [billId, amount, payment_method, 'pending'],
            (err, result) => {
              if (err) {
                console.error('Database error inserting payment:', err);
                return res.status(500).json({ message: 'Failed to record payment' });
              }
              console.log('Payment recorded:', { billId, paymentId: result.insertId, amount });
              res.json({ success: true, paymentId: result.insertId });
            }
          );
        }
      );
    }
  );
});

// Confirm a payment
router.post('/confirm-payment', (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    console.error('Missing paymentId');
    return res.status(400).json({ message: 'Payment ID is required' });
  }

  db.query(
    'UPDATE payments SET status = ? WHERE id = ? AND status = ?',
    ['completed', paymentId, 'pending'],
    (err, paymentResult) => {
      if (err) {
        console.error('Database error updating payment:', err);
        return res.status(500).json({ message: 'Internal server error' });
      }
      if (paymentResult.affectedRows === 0) {
        console.error('Payment not found or already confirmed:', paymentId);
        return res.status(404).json({ message: 'Payment not found or already confirmed' });
      }

      db.query(
        'SELECT bill_id FROM payments WHERE id = ?',
        [paymentId],
        (err, payment) => {
          if (err) {
            console.error('Database error fetching payment:', err);
            return res.status(500).json({ message: 'Internal server error' });
          }

          const billId = payment[0].bill_id;
          db.query(
            'SELECT SUM(amount) as totalPaid FROM payments WHERE bill_id = ? AND status = ?',
            [billId, 'completed'],
            (err, paymentSum) => {
              if (err) {
                console.error('Database error calculating payments:', err);
                return res.status(500).json({ message: 'Internal server error' });
              }

              db.query(
                'SELECT cost FROM bills WHERE id = ? AND status = ?',
                [billId, 'pending'],
                (err, billResult) => {
                  if (err) {
                    console.error('Database error fetching bill:', err);
                    return res.status(500).json({ message: 'Internal server error' });
                  }
                  if (billResult.length === 0) {
                    console.error('Bill not found or not pending:', billId);
                    return res.status(404).json({ message: 'Bill not found or not pending' });
                  }

                  const totalPaid = parseFloat(paymentSum[0].totalPaid) || 0;
                  const billCost = parseFloat(billResult[0].cost);
                  if (totalPaid >= billCost) {
                    db.query(
                      'UPDATE bills SET status = ? WHERE id = ?',
                      ['completed', billId],
                      (err) => {
                        if (err) {
                          console.error('Database error updating bill status:', err);
                          return res.status(500).json({ message: 'Internal server error' });
                        }
                        console.log('Bill marked as completed:', { billId, totalPaid });
                        res.json({ success: true, billCompleted: true });
                      }
                    );
                  } else {
                    console.log('Payment confirmed, bill remains pending:', { billId, totalPaid });
                    res.json({ success: true, billCompleted: false });
                  }
                }
              );
            }
          );
        }
      );
    }
  );
});

// Edit a bill
router.put('/edit/:billId', (req, res) => {
  const { billId } = req.params;
  const { time, cost, status } = req.body;

  if (!cost || isNaN(cost) || !status) {
    console.error('Invalid edit data:', { time, cost, status });
    return res.status(400).json({ message: 'Cost and status are required' });
  }
  if (time && !/^\d{2}:\d{2}:\d{2}$/.test(time)) {
    console.error('Invalid time format:', time);
    return res.status(400).json({ message: 'Time must be in HH:MM:SS format' });
  }

  db.query(
    'UPDATE bills SET time = ?, cost = ?, status = ? WHERE id = ?',
    [time || null, parseFloat(cost), status, billId],
    (err, result) => {
      if (err) {
        console.error('Database error editing bill:', err);
        return res.status(500).json({ message: 'Failed to edit bill' });
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

  if (!userId) {
    console.error('Missing userId');
    return res.status(400).json({ message: 'User ID is required' });
  }

  let query = `
    SELECT b.*, COALESCE(SUM(p.amount), 0) as total_paid
    FROM bills b
    LEFT JOIN payments p ON b.id = p.bill_id AND p.status = 'completed'
    WHERE b.user_id = ?
  `;
  const params = [userId];

  if (status) {
    query += ' AND b.status = ?';
    params.push(status);
  }
  if (field_name) {
    query += ' AND b.field_name = ?';
    params.push(field_name);
  }
  query += ' GROUP BY b.id';

  db.query(query, params, (err, result) => {
    if (err) {
      console.error('Database error fetching bills:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    console.log('Fetched bills for user:', { userId, count: result.length });
    res.json(result);
  });
});

// Delete all bills for a user
router.delete('/user/:userId', (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    console.error('Missing userId');
    return res.status(400).json({ message: 'User ID is required' });
  }

  db.query('DELETE FROM bills WHERE user_id = ?', [userId], (err, result) => {
    if (err) {
      console.error('Database error deleting bills:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    console.log('Bills deleted for user:', { userId, deletedCount: result.affectedRows });
    res.json({ success: true, deletedCount: result.affectedRows });
  });
});

// Delete a specific bill
router.delete('/:billId', (req, res) => {
  const { billId } = req.params;

  if (!billId) {
    console.error('Missing billId');
    return res.status(400).json({ message: 'Bill ID is required' });
  }

  db.query('DELETE FROM bills WHERE id = ?', [billId], (err, result) => {
    if (err) {
      console.error('Database error deleting bill:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
    if (result.affectedRows === 0) {
      console.error('Bill not found:', billId);
      return res.status(404).json({ message: 'Bill not found' });
    }
    console.log('Bill deleted:', { billId });
    res.json({ success: true });
  });
});



const handleDeleteBillHistory = async (userId) => {
  Alert.alert(
    'Confirm',
    'Are you sure you want to delete this user\'s bill history?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const response = await axios.delete(`${BASE_URL}/bills/user/${userId}`);
            if (response.status === 200) {
              Alert.alert('Success', `Deleted ${response.data.deletedCount} bills successfully`);
              fetchBills();
            } else {
              throw new Error('Failed to delete bills');
            }
          } catch (error) {
            console.error('Delete bill history error:', error.response?.status, error.response?.data || error.message);
            const message = error.response?.status === 404
              ? 'No bills found for this user'
              : error.response?.data?.message || 'Failed to delete bill history';
            Alert.alert('Error', message);
          }
        },
      },
    ]
  );
};

module.exports = router;