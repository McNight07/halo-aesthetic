// One-off script: node api/_db/migrate.js
// Reads schema.sql and runs each statement against Neon via DATABASE_URL.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  const schema = fs
    .readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements = schema
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    console.log('Running:', statement.split('\n')[0].slice(0, 70), '...');
    await sql(statement);
  }
  console.log('Migration complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
