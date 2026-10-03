import pg from 'pg';
import { readFileSync } from 'fs';

const { Pool } = pg;

// Load DATABASE_URL from .env
const envContent = readFileSync('.env', 'utf8');
const dbUrlLine = envContent.split('\n').find(l => l.startsWith('DATABASE_URL='));
if (!dbUrlLine) {
  console.error('DATABASE_URL not found in .env');
  process.exit(1);
}
const DATABASE_URL = dbUrlLine.split('=')[1].trim();

const pool = new Pool({ connectionString: DATABASE_URL });

const sql = readFileSync('scripts/clean-goal-progress-dupes.sql', 'utf8');

async function main() {
  const client = await pool.connect();
  try {
    const result = await client.query(sql);
    console.log(`Deleted ${result.rowCount} duplicate GoalProgress row(s)`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });