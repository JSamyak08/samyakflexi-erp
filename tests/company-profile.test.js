import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  COMPANY_PROFILE_STORAGE_KEY,
  SEED_COMPANY_PROFILE,
  cacheCompanyProfile,
  companyTagline,
  getCompanyProfile,
} from '../src/services/companyProfile.js';
import { calculateGSTBreakdown } from '../src/utils/pdfHelpers.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

test('company profile uses the registered seed when nothing is stored', () => {
  const previous = global.localStorage;
  global.localStorage = memoryStorage();
  try {
    const profile = getCompanyProfile();
    assert.equal(profile.gstin, '23AABCM3526F1ZY');
    assert.equal(profile.cin, 'L67120MH1994PLC225907');
    assert.equal(profile.tagline, companyTagline(SEED_COMPANY_PROFILE));
    assert.equal(profile.address.includes('Kheda Industrial Area'), true);
  } finally {
    global.localStorage = previous;
  }
});

test('an incomplete saved company profile is not filled from the seed', () => {
  const previous = global.localStorage;
  global.localStorage = memoryStorage({
    [COMPANY_PROFILE_STORAGE_KEY]: JSON.stringify({ ...SEED_COMPANY_PROFILE, gstin: '', cin: '' }),
  });
  try {
    assert.throws(() => getCompanyProfile(), /cin, gstin/);
  } finally {
    global.localStorage = previous;
  }
});

test('a complete saved company profile replaces the seed', () => {
  const previous = global.localStorage;
  global.localStorage = memoryStorage();
  try {
    const saved = cacheCompanyProfile({
      ...SEED_COMPANY_PROFILE,
      gstin: '27AAAAA0000A1Z5',
      cin: 'U12345MH2020PLC000001',
    });
    assert.equal(saved.gstin, '27AAAAA0000A1Z5');
    assert.equal(getCompanyProfile().cin, 'U12345MH2020PLC000001');
    assert.equal(getCompanyProfile().tagline.includes('U12345MH2020PLC000001'), true);
  } finally {
    global.localStorage = previous;
  }
});

test('tax calculation refuses a missing plant GSTIN', () => {
  assert.throws(
    () => calculateGSTBreakdown('27AAAAA0000A1Z5', 'Mumbai', 1000, 18, ''),
    /Company GSTIN is missing/,
  );
  const intra = calculateGSTBreakdown('23AAAAA0000A1Z5', 'Dhar', 1000, 18, SEED_COMPANY_PROFILE.gstin);
  assert.equal(intra.isIntraState, true);
  assert.equal(intra.igstAmount, 0);
});

test('company profile migration seeds once and does not overwrite', async () => {
  const sql = fs.readFileSync(
    new URL('../supabase/migrations/20261023180000_company_profile_setting.sql', import.meta.url),
    'utf8',
  );
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.system_settings (
      setting_key text PRIMARY KEY,
      setting_value text,
      updated_at timestamptz
    );
  `);
  await db.exec(sql);
  const seeded = await db.query(`SELECT setting_value FROM public.system_settings WHERE setting_key = 'company_profile'`);
  const profile = JSON.parse(seeded.rows[0].setting_value);
  assert.equal(profile.gstin, SEED_COMPANY_PROFILE.gstin);
  assert.equal(profile.cin, SEED_COMPANY_PROFILE.cin);
  assert.equal(profile.name, SEED_COMPANY_PROFILE.name);
  await db.query(`UPDATE public.system_settings SET setting_value = '{"gstin":"KEEP"}' WHERE setting_key = 'company_profile'`);
  await db.exec(sql);
  const again = await db.query(`SELECT setting_value FROM public.system_settings WHERE setting_key = 'company_profile'`);
  assert.equal(again.rows[0].setting_value, '{"gstin":"KEEP"}');
});
