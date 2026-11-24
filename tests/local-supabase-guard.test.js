import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PRODUCTION_SUPABASE_HOST,
  TEST_SUPABASE_HOST,
  assertNotProductionSupabase,
  refuseProductionSupabasePlugin
} from '../src/utils/localSupabaseGuard.js';

test('the local server refuses to start against the production Supabase URL', () => {
  assert.doesNotThrow(() => assertNotProductionSupabase(''));
  assert.doesNotThrow(() => assertNotProductionSupabase(`https://${TEST_SUPABASE_HOST}`));
  assert.throws(
    () => assertNotProductionSupabase(`https://${PRODUCTION_SUPABASE_HOST}`),
    /production Supabase project/
  );
  const plugin = refuseProductionSupabasePlugin(`https://${PRODUCTION_SUPABASE_HOST}`);
  assert.equal(plugin.name, 'refuse-production-supabase');
  assert.throws(() => plugin.configureServer(), /Refusing to start/);
  const source = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.match(source, /refuseProductionSupabasePlugin/);
});
