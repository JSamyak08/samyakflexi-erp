/**
 * Client entry for direct roll slitting.
 * Posting and reversal go through one database function. This module does not
 * write inventory, ledger, or scrap rows itself, and it does not open a screen.
 */

import { assessDirectSlitting } from '../utils/directSlitting.js';

export { assessDirectSlitting };

function clientOf(supabase) {
  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new Error('Supabase is not available.');
  }
  return supabase;
}

export async function postDirectSlitting(supabase, document) {
  const { data, error } = await clientOf(supabase).rpc('post_roll_conversion', {
    p_doc: document || {}
  });
  if (error) throw error;
  return data;
}

export async function reverseDirectSlitting(supabase, conversionId, reason) {
  const { data, error } = await clientOf(supabase).rpc('reverse_roll_conversion', {
    p_id: conversionId,
    p_reason: reason
  });
  if (error) throw error;
  return data;
}
