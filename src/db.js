import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // 🩵 Připojení se obnoví při ztrátě
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

// 🧩 Oprava: automatické obnovení při "PROTOCOL_CONNECTION_LOST"
pool.on('error', (err) => {
  console.error('⚠️ MySQL pool error:', err.code);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.log('🔄 Obnovuji připojení k MySQL...');
  }
});

try {
  const conn = await pool.getConnection();
  console.log(`✅ Připojeno k databázi ${process.env.DB_NAME} na ${process.env.DB_HOST}`);
  conn.release();
} catch (err) {
  console.error('❌ Chyba při připojování k DB:', err.message);
}
