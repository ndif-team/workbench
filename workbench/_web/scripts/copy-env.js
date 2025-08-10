const fs = require('fs');
const path = require('path');

const rootEnv = path.resolve(__dirname, '../../../.env');
const webEnv = path.resolve(__dirname, '../.env.local');

try {
  if (fs.existsSync(rootEnv)) {
    const contents = fs.readFileSync(rootEnv, 'utf8');
    fs.writeFileSync(webEnv, contents);
  } else {
    // Minimal required env for E2E mode
    const minimal = [
      'NEXT_PUBLIC_E2E=true',
      'NEXT_PUBLIC_BACKEND_URL=http://localhost:9999',
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY=anon',
      'DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres',
    ].join('\n');
    fs.writeFileSync(webEnv, minimal);
  }
  console.log('Env prepared at', webEnv);
} catch (e) {
  console.error('copy-env failed:', e);
  process.exit(0);
}