import pkg from 'pg';
const { Pool } = pkg;

import dotenv from 'dotenv';
dotenv.config();

// 🟢 PostgreSQL připojení (Neon.tech)
export const pool = new Pool({
  connectionString: process.env.DB_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 🧠 Test připojení
try {
  const client = await pool.connect();
  const result = await client.query('SELECT NOW() AS now');
  console.log(`✅ Připojeno k PostgreSQL (Neon.tech) — ${result.rows[0].now}`);
  client.release();
} catch (err) {
  console.error('❌ Chyba při připojení k PostgreSQL:', err);
}
