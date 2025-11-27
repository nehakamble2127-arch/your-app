// your-app/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

app.get('/', (req, res) => res.send('SMS App API (Mongoose) running'));

async function start() {
  if (!MONGO_URI) {
    console.error('MONGO_URI missing in .env');
    process.exit(1);
  }

  try {
    // Connect using mongoose. Don't pass deprecated options.
    await mongoose.connect(MONGO_URI);
    console.log('Mongoose connected');

    // Register your routes from your-app/routes
    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/groups', require('./routes/groups'));
    // app.use('/api/messages', require('./routes/messages')); // if exists

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
