import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_HOST = 'awtjvrhpoyzjwrfumhip.supabase.co';
const PRODUCTION_HOST = 'eamstsaqkbeiywfaanhi.supabase.co';

function loginFile() {
  const candidates = [
    process.env.CAMERA_LOGINS,
    path.resolve('uploads/test_logins.json')
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

const file = loginFile();
if (!file) {
  console.error('Set CAMERA_LOGINS to the test login file.');
  process.exit(1);
}
const creds = JSON.parse(fs.readFileSync(file, 'utf8'));
const projectUrl = String(creds.project_url || '');
if (!projectUrl.includes(TEST_HOST) || projectUrl.includes(PRODUCTION_HOST)) {
  console.error('Refusing to start the camera flow against a non-test Supabase project.');
  process.exit(1);
}

const vite = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/vite/bin/vite.js');
const child = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_SUPABASE_URL: projectUrl,
    VITE_SUPABASE_ANON_KEY: creds.anon_key
  }
});
child.on('exit', (code) => process.exit(code ?? 0));
