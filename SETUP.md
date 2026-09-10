# Strade checkout on Vercel

The website uses three prebuilt Stripe **Payment Links**. When a customer pays,
Stripe redirects them to `/success.html?session_id={CHECKOUT_SESSION_ID}`. That
page asks the server to fetch the session from Stripe, mint a KeyAuth license
if one has not been minted yet, persist the license on the Checkout Session's
`metadata.license` field, and hand it back with a Download loader button. The
Download button hits `/api/loader?session=...`, which re-verifies the session
with Stripe and streams the loader binary from `LOADER_URL`.

No database, no webhook, no email, no Discord OAuth.

## 1. Configure the three Payment Links

The website links to these Payment Links (see `index.html`):

- Monthly · $10 · <https://buy.stripe.com/5kQ9ANd5n1OCddSdxO9oc01>
- Quarterly · $25 · <https://buy.stripe.com/8x2aER8P7dxk3DieBS9oc02>
- Lifetime · $55 · <https://buy.stripe.com/8x28wJghz50Oc9O1P69oc03>

In the Stripe Dashboard, edit each Payment Link and set **After payment →
Don't show confirmation page → Redirect customers to your website**:

`https://YOUR-DOMAIN/success.html?session_id={CHECKOUT_SESSION_ID}`

Stripe substitutes `{CHECKOUT_SESSION_ID}` with the real Checkout Session id.
The success page uses that id both to look up the license and to authorize
the loader download.

The site expects Payment Link prices of exactly $10, $25 and $55 USD (one-time,
`payment` mode). The order endpoint rejects any other amount with an error.

## 2. Configure environment variables

Under Vercel → Project → Settings → Environment Variables, add every variable
from `.env.example`. Never paste real keys into HTML, commit them to Git, or
send them in chat.

| Variable | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | Stripe **secret** key (start with `sk_test_...`, swap for `sk_live_...` after testing) |
| `KEYAUTH_SELLER_KEY` | KeyAuth Seller API key for your application |
| `KEYAUTH_MONTHLY_LEVEL` / `KEYAUTH_QUARTERLY_LEVEL` / `KEYAUTH_LIFETIME_LEVEL` | Your KeyAuth subscription level numbers |
| `KEYAUTH_MONTHLY_EXPIRY` / `KEYAUTH_QUARTERLY_EXPIRY` / `KEYAUTH_LIFETIME_EXPIRY` | KeyAuth expiry values; `30` and `90` are provided defaults for the shorter tiers, lifetime has no assumed default |
| `LOADER_URL` | HTTPS download URL for the loader binary. Server-fetched only. Use private storage with `LOADER_BEARER_TOKEN` in production. |
| `LOADER_BEARER_TOKEN` | Optional bearer token sent with the `LOADER_URL` fetch |
| `LOADER_FILENAME` | Filename presented to the browser download (e.g. `Strade.exe`) |

Redeploy after changing variables so they take effect.

## 3. Deploy on Vercel

Import this project into Vercel. Framework preset: **Other**. Build command
`npm run build`, output directory `public`, Node 24. The `api` directory
supplies the Vercel functions. `vercel.json` sets a 60s max duration on
functions so the loader download can stream large files.

## 4. Test a full purchase

1. In Stripe **test mode**, activate a temporary Payment Link (or use a test
   version of the live ones) that also points at
   `https://YOUR-DOMAIN/success.html?session_id={CHECKOUT_SESSION_ID}`.
2. Use test card `4242 4242 4242 4242`, any future expiry, any CVC.
3. After redirect, the success page should show your KeyAuth key and a working
   Download loader button.
4. Refresh the success page. The key stays the same. KeyAuth is only called
   the first time; subsequent hits read `session.metadata.license`.
5. Confirm the license appears in KeyAuth with note `stripe:cs_test_...`.

For live sale, swap `STRIPE_SECRET_KEY` for a live secret and confirm the
three real Payment Links redirect to the correct `success.html?session_id=...`
on the production domain.

## Concurrency and orphan licenses

If two success-page visits (or a visit + a refresh) race before Stripe has
recorded the `metadata.license` write, KeyAuth may mint two keys for the same
Checkout Session. The write itself uses a stable Stripe Idempotency-Key
(`strade-fulfill-{session_id}`), so only the first key is persisted; the second
becomes an orphan you can find in KeyAuth by searching for note
`stripe:cs_...`. Delete the extras when reconciling.

If KeyAuth ever fails to respond after possibly minting a key, the success
page shows an error. Do not retry blindly — search KeyAuth by that session id's
note first, and if a key exists, add it manually with:

```
POST https://api.stripe.com/v1/checkout/sessions/cs_...
metadata[license]=STRADE-XXXX-XXXX-XXXX-XXXX
```

## Local preview

```
cp .env.example .env.local
# fill in values, then
npm run dev
```

`http://localhost:3000` serves `index.html`, `success.html`, and the two
functions (`/api/order`, `/api/loader`). Local checkout still hits the live
Stripe Payment Links, so use test-mode keys or a throwaway test link.

## References

- [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment)
- [Stripe Payment Links](https://docs.stripe.com/payment-links)
- [Stripe redirect after payment](https://docs.stripe.com/payment-links/customize-behavior#redirect-customers-to-your-website)
- [KeyAuth license creation](https://keyauthdocs.apidog.io/sellerapi/licenses/create-new-license)
