/**
 * The local dev server and live UI checks must not talk to production.
 * Production project: eamstsaqkbeiywfaanhi
 * Test project: awtjvrhpoyzjwrfumhip
 */

export const PRODUCTION_SUPABASE_HOST = 'eamstsaqkbeiywfaanhi.supabase.co';
export const TEST_SUPABASE_HOST = 'awtjvrhpoyzjwrfumhip.supabase.co';

export function assertNotProductionSupabase(url) {
  const value = String(url || '');
  if (value.includes(PRODUCTION_SUPABASE_HOST)) {
    throw new Error(
      'Refusing to start: VITE_SUPABASE_URL points at the production Supabase project (eamstsaqkbeiywfaanhi). Use the test project.'
    );
  }
}

export function refuseProductionSupabasePlugin(url) {
  return {
    name: 'refuse-production-supabase',
    configureServer() {
      assertNotProductionSupabase(url);
    }
  };
}
