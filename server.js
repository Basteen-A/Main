require('dotenv').config();
const express = require('express');
const cors = require('cors');
// const plantRouter = require('./routes/plant');
const app = express();
// Middleware
app.use(cors());
app.use(express.json());
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/fields', require('./routes/fields'));
app.use('/api/bills', require('./routes/bills'));



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


