const query = new URLSearchParams(location.search);
const session = query.get('session_id') || query.get('session');
const heading = document.getElementById('heading');
const status = document.getElementById('status');
const retry = document.getElementById('retry');
const download = document.getElementById('download');
let attempts = 0;
let timer;

async function check() {
  retry.hidden = true;
  try {
    const response = await fetch('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not check this order.');
    if (data.status === 'fulfilled') {
      heading.textContent = 'Your key is ready';
      status.textContent = 'Payment confirmed. Copy your key and download the loader below.';
      document.getElementById('key').textContent = data.key;
      download.href = `/api/loader?session=${encodeURIComponent(session)}`;
      document.getElementById('delivery').hidden = false;
      return;
    }
    if (++attempts >= 30) {
      heading.textContent = 'Your order is being processed';
      status.textContent = 'Key delivery is taking longer than expected. Check again shortly or contact support with your order reference. Do not pay again.';
      retry.hidden = false;
      return;
    }
    timer = setTimeout(check, 3000);
  } catch (error) {
    status.textContent = error.message;
    retry.hidden = false;
  }
}

retry.addEventListener('click', () => { clearTimeout(timer); attempts = 0; check(); });
document.getElementById('copy').addEventListener('click', async event => {
  try { await navigator.clipboard.writeText(document.getElementById('key').textContent); event.target.textContent = 'Copied'; }
  catch { status.textContent = 'Select and copy the key above.'; }
});

if (/^cs_[a-zA-Z0-9_]{20,200}$/.test(session || '')) {
  document.getElementById('reference').textContent = `Order reference: ${session}`;
  check();
} else {
  heading.textContent = 'Open your order link';
  status.textContent = 'Use the private confirmation link shown after checkout to retrieve your key.';
}
