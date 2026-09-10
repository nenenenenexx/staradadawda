export const plans = Object.freeze({
  monthly: { name: 'Strade Monthly', amount: 1000 },
  quarterly: { name: 'Strade Quarterly', amount: 2500 },
  lifetime: { name: 'Strade Lifetime', amount: 5500 },
  // $0.50 sanity-check tier. Reuses the monthly KeyAuth level so a test
  // purchase mints a real 30-day key end-to-end.
  test: { name: 'Strade Test', amount: 50, envPrefix: 'KEYAUTH_MONTHLY' }
});

export function setting(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
}

export function planForAmount(amount) {
  return Object.entries(plans).find(([, config]) => config.amount === amount)?.[0];
}

export function planConfig(id) {
  if (!Object.hasOwn(plans, id)) throw new Error('Unknown plan');
  const prefix = plans[id].envPrefix || `KEYAUTH_${id.toUpperCase()}`;
  const level = setting(`${prefix}_LEVEL`);
  const expiry = setting(`${prefix}_EXPIRY`);
  if (!/^\d+$/.test(level) || !/^\d+$/.test(expiry)) throw new Error('Invalid license configuration');
  return { ...plans[id], level, expiry };
}

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

export async function stripe(path, fields, idempotencyKey) {
  const headers = { Authorization: `Bearer ${setting('STRIPE_SECRET_KEY')}` };
  if (fields) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: fields ? 'POST' : 'GET', headers,
    body: fields ? new URLSearchParams(fields) : undefined, signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('Stripe request failed');
  return response.json();
}

export function validatePayment(session) {
  if (session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid' || session.currency !== 'usd') {
    throw new Error('Payment does not match order');
  }
  const plan = planForAmount(session.amount_total);
  if (!plan) throw new Error('Payment does not match order');
  return plan;
}

export async function createLicense({ sessionId, level, expiry }) {
  const url = new URL('https://keyauth.win/api/seller/');
  url.search = new URLSearchParams({ sellerkey: setting('KEYAUTH_SELLER_KEY'), type: 'add', format: 'json',
    amount: '1', expiry, level, mask: 'STRADE-*****-*****-*****-*****', note: `stripe:${sessionId}` }).toString();
  // Never log this URL: the Seller API authenticates in the query string.
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('License creation needs review');
  const result = await response.json();
  if (result.success !== true || typeof result.key !== 'string' || !result.key.trim()) throw new Error('License creation needs review');
  return result.key.trim();
}

// Persist the license on the Stripe session with a stable Idempotency-Key so
// concurrent fulfilment requests within Stripe's 24h dedupe window converge on
// the first write. A losing race leaves an orphan KeyAuth key with note
// stripe:{session_id} for manual reconciliation.
export async function markFulfilled(sessionId, license) {
  return stripe(`checkout/sessions/${encodeURIComponent(sessionId)}`, { 'metadata[license]': license }, `strade-fulfill-${sessionId}`);
}

export async function fulfill(session, { issue = createLicense, mark = markFulfilled } = {}) {
  const plan = validatePayment(session);
  if (typeof session.metadata?.license === 'string' && session.metadata.license) return session.metadata.license;
  const config = planConfig(plan);
  const license = await issue({ sessionId: session.id, level: config.level, expiry: config.expiry });
  const updated = await mark(session.id, license);
  const persisted = updated?.metadata?.license || license;
  session.metadata = { ...(session.metadata || {}), license: persisted };
  return persisted;
}
