import { json, setting, stripe, validatePayment } from '../lib/store.js';

export async function GET(request) {
  try {
    const session = new URL(request.url).searchParams.get('session');
    if (typeof session !== 'string' || !/^cs_[a-zA-Z0-9_]{20,200}$/.test(session)) return json({ error: 'Invalid download link.' }, 400);
    const found = await stripe(`checkout/sessions/${encodeURIComponent(session)}`);
    try { validatePayment(found); } catch { return json({ error: 'This link is not tied to a completed purchase.' }, 403); }
    if (typeof found.metadata?.license !== 'string' || !found.metadata.license) {
      return json({ error: 'Your key is still being prepared. Open the confirmation page first.' }, 409);
    }
    const source = new URL(setting('LOADER_URL'));
    if (source.protocol !== 'https:' || source.username || source.password) throw new Error('Invalid loader source');
    const headers = {};
    if (process.env.LOADER_BEARER_TOKEN) headers.Authorization = `Bearer ${process.env.LOADER_BEARER_TOKEN}`;
    // Fetch from the storage URL server-side, never redirect the customer to the source.
    const file = await fetch(source, { headers, redirect: source.hostname === 'github.com' ? 'follow' : 'error', signal: AbortSignal.timeout(45000) });
    if (!file.ok || !file.body) throw new Error('Loader unavailable');
    const filename = (process.env.LOADER_FILENAME || 'Strade.exe').replace(/[^a-zA-Z0-9._-]/g, '_');
    return new Response(file.body, { headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    } });
  } catch {
    return json({ error: 'Downloads are temporarily unavailable. Please try again shortly.' }, 503);
  }
}
