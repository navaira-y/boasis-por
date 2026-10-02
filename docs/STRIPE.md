# Stripe setup (UAE cards + wallets → client's bank)

What Stripe gives us: UAE bank cards (Visa/Mastercard debit + credit),
Apple Pay / Google Pay / Samsung Pay (automatic inside Checkout, no extra
work), monthly recurring billing, and AED payouts to the client's UAE bank
account. Test mode needs no business verification — live mode does.

## A. Create the account (client, ~10 min)

1. Go to **stripe.com → Start now**, sign up with the client's business email.
2. Stay in **Test mode** (toggle, top right) for everything below.
3. **Developers → API keys → Reveal test key** → copy the **Secret key**
   (`sk_test_...`). This goes into YOUR OWN `apps/web/.env.local` as
   `STRIPE_SECRET_KEY`. Never into chat, never into git.

## B. Create the two prices (test mode, ~5 min)

Same two prices must exist in test mode now, and again in live mode at launch.
Code finds them by lookup key, so names/IDs don't matter — the lookup keys do.

1. **Product catalogue → + Create product**, twice:

   | | Solo | Trio |
   |---|---|---|
   | Name | Boasis Solo | Boasis Trio |
   | Price | AED 30.00 | AED 90.00 |
   | Billing period | Monthly, recurring | Monthly, recurring |
   | Lookup key (under Advanced) | `solo_monthly` | `trio_monthly` |

2. Copy-paste the lookup keys exactly — checkout fails loudly if they differ.

## C. Local webhook forwarding (~5 min, dev machine only)

Real Stripe events must reach your localhost. Install the CLI once:

```bash
# macOS
brew install stripe/stripe-cli/stripe
# Windows (Scoop)
scoop install stripe
# or download: https://stripe.com/docs/stripe-cli
```

Then in a second terminal (app running in the first):

```bash
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/billing/stripe
```

It prints `whsec_...` → paste into `.env.local` as `STRIPE_WEBHOOK_SECRET`,
restart `npm run dev`. Keep this terminal open while testing payments.

## D. Test card

Use `4242 4242 4242 4242`, any future expiry, any CVC, any name/ZIP.
More scenarios: https://stripe.com/docs/testing

## E. Go-live checklist (launch week, client does 1–2)

1. **Activate the account:** Stripe dashboard → Activate → business details +
   trade licence + owner ID (UAE verification, usually 1–3 days).
2. **Bank for payouts:** Settings → Payouts → Add bank account (UAE IBAN).
   Money lands automatically (daily by default, 2–7 days first payout).
3. **Repeat section B in Live mode** (toggle Test→Live, same lookup keys).
4. **Live webhook:** Developers → Webhooks → Add endpoint
   `https://<our-domain>/api/webhooks/billing/stripe`, events:
   `checkout.session.completed`, `invoice.payment_failed`,
   `customer.subscription.deleted` → copy the signing secret to production env.
5. Swap env to live keys (`sk_live_...`), `BILLING_PROVIDER=stripe`.

## How it maps to our system

- Checkout session carries `metadata { profileId, subscriptionId, planId }`.
- `checkout.session.completed` → the ONLY event that flips `pending → active`.
- `invoice.payment_failed` → `past_due` (portal locks until paid).
- `customer.subscription.deleted` → `canceled` (re-subscribe restarts pending).
- Every event is de-duplicated in `webhook_events` — retries are harmless.
- Apple Pay on the web in live mode: automatic with Checkout Sessions.
