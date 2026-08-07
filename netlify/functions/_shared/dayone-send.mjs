const RESEND_ORIGIN = 'https://api.resend.com';

/**
 * Email a finished diary body to Day One via Resend.
 * Returns { sent: true } or { sent: false, reason }.
 * Never throws for expected misconfig / provider failures.
 */
export async function sendDiaryToDayOne({
  notes,
  date,
  env = process.env,
  fetchImpl = fetch
} = {}) {
  const body = typeof notes === 'string' ? notes.trim() : '';
  if (!body) return { sent: false, reason: 'empty_notes' };

  const apiKey = env.RESEND_API_KEY;
  const to = env.DAYONE_EMAIL;
  const from = env.RESEND_FROM || 'Life Hub <onboarding@resend.dev>';
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    return { sent: false, reason: 'not_configured' };
  }
  if (typeof to !== 'string' || to.length === 0) {
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const response = await fetchImpl(`${RESEND_ORIGIN}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: typeof date === 'string' && date ? date : 'Diary',
        text: body
      })
    });
    if (!response.ok) {
      return { sent: false, reason: `resend_${response.status}` };
    }
    return { sent: true };
  } catch {
    return { sent: false, reason: 'resend_unavailable' };
  }
}
