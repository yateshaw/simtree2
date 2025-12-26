import { Pool } from 'pg';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.get('/test-db', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    res.json({ success: true, timestamp: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const port = 5001;
app.listen(port, '0.0.0.0', () => {
  console.log(`Test server running on port ${port}`);
});