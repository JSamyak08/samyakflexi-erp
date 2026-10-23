export async function readCompanySenderName(service) {
  if (!service?.from) {
    const error = new Error('Company profile name is not configured. Set it before sending mail.');
    error.status = 500;
    throw error;
  }
  const result = await service
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', 'company_profile')
    .maybeSingle();
  if (result?.error) {
    const error = new Error('Company profile could not be read for the mail From name.');
    error.status = 500;
    throw error;
  }
  let profile = result?.data?.setting_value;
  if (typeof profile === 'string') {
    try {
      profile = JSON.parse(profile);
    } catch {
      profile = null;
    }
  }
  const name = String(profile?.name || '').trim();
  if (!name) {
    const error = new Error('Company profile name is not configured. Set it before sending mail.');
    error.status = 500;
    throw error;
  }
  return name.replace(/["\\]/g, '');
}

export function quotedFrom(name, mailbox) {
  return `"${name}" <${mailbox}>`;
}
