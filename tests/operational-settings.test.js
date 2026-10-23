import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { SEED_COMPANY_PROFILE } from '../src/services/companyProfile.js';
import { calculateGSTBreakdown } from '../src/utils/pdfHelpers.js';
import { companyDomain } from '../src/services/emailPolicy.js';
import { getFilmSubstrateDensity } from '../src/factoryStore.js';
import {
  filmRatePerKg,
  financialYearLabel,
  netPrintedSubstrateKg,
  wastagePercentForQuantity,
} from '../src/services/operationalConfig.js';

test('GST requires a rate and does not treat a city name as intra-state', () => {
  assert.throws(
    () => calculateGSTBreakdown('27AAAAA0000A1Z5', 'Mumbai', 1000, undefined, SEED_COMPANY_PROFILE.gstin),
    /GST rate is not configured/,
  );
  assert.throws(
    () => calculateGSTBreakdown('', 'Plot 1, Pithampur, Madhya Pradesh', 1000, 18, SEED_COMPANY_PROFILE.gstin),
    /Party GSTIN is missing/,
  );
  const interstate = calculateGSTBreakdown('', 'Pithampur', 1000, 18, SEED_COMPANY_PROFILE.gstin, 'igst');
  assert.equal(interstate.isIntraState, false);
  assert.equal(interstate.igstAmount, 180);
});

test('company mail domain is required', () => {
  const previousDomain = process.env.COMPANY_EMAIL_DOMAIN;
  const previousVite = process.env.VITE_COMPANY_EMAIL_DOMAIN;
  delete process.env.COMPANY_EMAIL_DOMAIN;
  delete process.env.VITE_COMPANY_EMAIL_DOMAIN;
  try {
    assert.throws(() => companyDomain({}), /COMPANY_EMAIL_DOMAIN is not configured/);
  } finally {
    if (previousDomain === undefined) delete process.env.COMPANY_EMAIL_DOMAIN;
    else process.env.COMPANY_EMAIL_DOMAIN = previousDomain;
    if (previousVite === undefined) delete process.env.VITE_COMPANY_EMAIL_DOMAIN;
    else process.env.VITE_COMPANY_EMAIL_DOMAIN = previousVite;
  }
});

test('wastage tiers, film rates, and density do not invent a stand-in', () => {
  assert.equal(wastagePercentForQuantity(2500, false), 4.5);
  assert.equal(wastagePercentForQuantity(400, true), 8);
  assert.equal(filmRatePerKg({ filmType: 'Not A Catalog Grade' }), null);
  assert.notEqual(filmRatePerKg({ filmType: 'Not A Catalog Grade' }), 140);
  assert.equal(getFilmSubstrateDensity('polyester'), 1.4);
  assert.equal(getFilmSubstrateDensity('poly'), null);
  assert.equal(getFilmSubstrateDensity(''), null);
});

test('plain substrate wastage is deducted from printed film only', () => {
  assert.equal(netPrintedSubstrateKg([
    { consumedWeightKg: 10, plainSubstrateWastageKg: 2.5 },
    { consumedWeightKg: 4, plainSubstrateWastageKg: '' },
  ]), 11.5);
});

test('financial year starts in April', () => {
  assert.equal(
    financialYearLabel(new Date('2026-04-01T00:30:00+05:30'), 4, 'Asia/Kolkata'),
    '26-27',
  );
  assert.equal(
    financialYearLabel(new Date('2026-03-31T12:00:00+05:30'), 4, 'Asia/Kolkata'),
    '25-26',
  );
});

test('operational migration fills missing company keys and does not clobber gstin', async () => {
  const sql = fs.readFileSync(
    new URL('../supabase/migrations/20261023203000_operational_settings.sql', import.meta.url),
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
  await db.query(
    `INSERT INTO public.system_settings (setting_key, setting_value) VALUES ('company_profile', $1)`,
    ['{"gstin":"KEEP"}'],
  );
  await db.exec(sql);
  const row = await db.query(`SELECT setting_value FROM public.system_settings WHERE setting_key = 'company_profile'`);
  const profile = JSON.parse(row.rows[0].setting_value);
  assert.equal(profile.gstin, 'KEEP');
  assert.equal(profile.defaultGstRatePct, 18);
  assert.equal(profile.timeZone, 'Asia/Kolkata');
  assert.equal(profile.financialYearStartMonth, 4);
  const costing = await db.query(`SELECT setting_key FROM public.system_settings WHERE setting_key = 'costing_settings'`);
  assert.equal(costing.rows.length, 1);
  await db.exec(sql);
  const again = await db.query(`SELECT setting_value FROM public.system_settings WHERE setting_key = 'company_profile'`);
  assert.equal(JSON.parse(again.rows[0].setting_value).gstin, 'KEEP');
});
