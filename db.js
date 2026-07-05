const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Force IPv4 to avoid IPv6 issues on some hosting platforms
  family: 4,
  // SSL configuration
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  // Connection timeout
  connectionTimeoutMillis: 10000,
  // Idle timeout
  idleTimeoutMillis: 30000,
  // Max connections
  max: 20,
});

module.exports = pool;