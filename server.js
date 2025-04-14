require('dotenv').config();
const express = require('express');
const cors = require('cors');
// const plantRouter = require('./routes/plant');
const app = express();
// Middleware
app.use(cors());
app.use(express.json());
app.use('/auth', require('./routes/auth'));
app.use('/users', require('./routes/users'));
app.use('/fields', require('./routes/fields'));
app.use('/bills', require('./routes/bills'));
app.use('/iot', require('./routes/iot'));


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));