import { fulfill, json, stripe } from '../lib/store.js';

export async function POST(request) {
  try {
    const { session } = await request.json();
    if (typeof session !== 'string' || !/^cs_[a-zA-Z0-9_]{20,200}$/.test(session)) return json({ error: 'Invalid order link.' }, 400);
    const found = await stripe(`checkout/sessions/${encodeURIComponent(session)}`);
    if (found.payment_status !== 'paid') return json({ status: 'pending' });
    const license = await fulfill(found);
    return json({ status: 'fulfilled', key: license });
  } catch (error) {
    console.error('order failed:', error?.message || error);
    return json({ error: 'Unable to prepare your key. Please retry.' }, 503);
  }
}
