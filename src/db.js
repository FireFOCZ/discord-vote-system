import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

try {
  const conn = await pool.getConnection();
  console.log(`✅ Připojeno k databázi ${process.env.DB_NAME} na ${process.env.DB_HOST}`);
  conn.release();
} catch (err) {
  console.error('❌ Nepodařilo se připojit k databázi:', err);
}
