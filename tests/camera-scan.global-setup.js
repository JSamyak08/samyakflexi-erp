import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';

const TEST_HOST = 'awtjvrhpoyzjwrfumhip.supabase.co';
const PRODUCTION_HOST = 'eamstsaqkbeiywfaanhi.supabase.co';
export const CAMERA_BARCODE = 'FG-QA-PR';

function loginFile() {
  const candidates = [
    process.env.CAMERA_LOGINS,
    path.resolve('uploads/test_logins.json')
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

export default async function globalSetup() {
  const file = loginFile();
  if (!file) throw new Error('Set CAMERA_LOGINS to the test login file.');
  const creds = JSON.parse(fs.readFileSync(file, 'utf8'));
  const projectUrl = String(creds.project_url || '');
  if (!projectUrl.includes(TEST_HOST) || projectUrl.includes(PRODUCTION_HOST)) {
    throw new Error('Camera flow test must use the test Supabase project.');
  }
  const dir = path.resolve('artifacts/camera');
  fs.mkdirSync(dir, { recursive: true });
  const png = path.join(dir, 'barcode.png');
  const y4m = path.join(dir, 'barcode.y4m');
  await QRCode.toFile(png, CAMERA_BARCODE, {
    width: 400,
    margin: 4,
    errorCorrectionLevel: 'H',
    color: { dark: '#000000', light: '#ffffff' }
  });
  execFileSync('ffmpeg', [
    '-y',
    '-loop', '1',
    '-i', png,
    '-vf', 'scale=400:400:flags=neighbor,pad=640:480:(ow-iw)/2:(oh-ih)/2:white',
    '-frames:v', '20',
    '-r', '10',
    '-pix_fmt', 'yuv420p',
    y4m
  ], { stdio: 'inherit' });
  const bytes = fs.readFileSync(y4m);
  const headerEnd = bytes.indexOf(0x0a);
  const header = bytes.subarray(0, headerEnd).toString('ascii').replace(/C420\w*/g, 'C420');
  fs.writeFileSync(y4m, Buffer.concat([Buffer.from(`${header}\n`, 'ascii'), bytes.subarray(headerEnd + 1)]));
}
