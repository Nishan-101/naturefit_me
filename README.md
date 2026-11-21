# Nature Fit Restaurant — Website

Meal-plan site for **Nature Fit Restaurant**, Al Safa Complex, Dubai. The public pages are static HTML. Orders, prices, payments, and the staff dashboard are a Node.js/Express API with MySQL.

```
frontend/   HTML, CSS, JS, logo, and kitchen photos
backend/    Express API
```

## What is already live in this codebase

- Homepage, menu, about, delivery-app links, contact details, and the original email inquiry flow.
- Customer accounts with email and password.
- An 8-step meal-plan builder. Prices are read from the database. The page never decides the amount.
- Orders saved with a reference number. Delivery dates follow the selected weekdays and approved pauses.
- WhatsApp click-to-chat. This opens a draft the customer must send. It does not message anyone by itself.
- Optional WhatsApp Cloud API templates when the server has credentials and the customer opted in.
- Stripe Checkout when `STRIPE_SECRET_KEY` is set. Without it, card checkout is labeled not live and no payment is marked successful.
- A separate package order page at `/subscribe`. Official 1-day, 20-day, and 28-day prices live in `backend/config/packagePrices.js`. Any other length from 2 to 27 days is calculated from those prices. The older meal-plan builder is unchanged and still uses prices entered in the staff dashboard.
- UAE SMS verification through Twilio Verify. A real code is sent only when the Twilio keys are set. Production still requires that check before payment. A local development preview can open Stripe test checkout without a code until those keys are added.
- Customer dashboard and staff dashboard.
- The old inquiry form is still accepted by `POST /api/inquiries`.

## Run locally

```bash
cd backend
cp .env.example .env
npm install
npm test
npm run dev
```

Open `http://localhost:5000`. The API also serves the frontend.

## Staff setup before customers can pay

1. Open `/admin` and sign in with `ADMIN_PASSWORD`.
2. Add a price for each plan, meals-per-day, and duration you want to sell. Until a price exists, checkout says the kitchen must confirm it.
3. Set 1-meal and 2-meal calorie ranges if you want them shown. They start blank on purpose.
4. Confirm delivery times, the minimum number of days (starts at 5), the cut-off, and the WhatsApp number.
5. Turn on bank transfer or cash on delivery only if you want those methods.

## Package prices

The only official amounts are the 1-day, 20-day, and 28-day prices in `backend/config/packagePrices.js`. A custom length is calculated on the server:

- 1 day, 20 days, and 28 days use those amounts exactly.
- 2–19 days: `1-day price + (days − 1) × (20-day price − 1-day price) / 19`
- 21–27 days: `20-day price + (days − 20) × (28-day price − 20-day price) / 8`

The result is rounded to two decimal places. The browser never sends the amount Stripe charges. Checkout recomputes it from the plan, meals per day, and number of days.

Customers can choose any whole number of days from 1 to 28, any delivery weekdays (including all seven), and a start date. The end date is the last delivery day in that schedule.

## Going live with payments and WhatsApp

Start in Stripe test mode. Do not put a secret key in frontend code or in git.

1. In the Stripe Dashboard, stay in **Test mode**.
2. Open Developers → API keys and copy the secret key (`sk_test_...`).
3. On the server (Render), set `STRIPE_SECRET_KEY` to that value. Leave `STRIPE_LIVE_ENABLED` unset.
4. Open Developers → Webhooks → Add endpoint.
   - URL: `https://naturefit-me.onrender.com/api/payments/stripe/webhook`
   - Events: `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`
5. Copy the endpoint signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.
6. Set `PUBLIC_SITE_URL` to `https://naturefit.site`.
7. In Payment methods, enable Cards. Apple Pay and Google Pay are shown by Checkout when the Stripe account and the customer's device support them. Register `naturefit.site` if Stripe asks for a payment domain. Bank OTP checks are Stripe 3D Secure and run only when the card requires them.
8. Restart the server and place a test order. Use Stripe's test card `4242 4242 4242 4242`, any future expiry, and any CVC. The order page must stay unpaid until the webhook arrives, then show the booking confirmation.

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID` are required before a package order can send a real SMS code. The Verify service should use a 6-digit code.

Card numbers stay on Stripe. Opening `/order?ref=` does not mark an order paid. If the customer cancels or the card is declined, the saved order stays unpaid and **Proceed to Payment** starts checkout again without asking for the same details. A paid order cannot be charged a second time.

A subscription stays inactive until the payment row is paid and a staff member approves it. Approval builds the delivery calendar. The customer-facing booking confirmation appears only after the webhook marks the payment paid.
- WhatsApp click-to-chat needs only the business number in staff settings.
- Automatic customer WhatsApp needs `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_TEMPLATE_NAME`, plus a separate opt-in checkbox. The template body should use this variable order: name, order number, plan, meals per day, duration, start date, total, payment status.

## Before real payouts

Stripe test checkout can be reviewed locally. A test payment does not move money into a bank account.

The restaurant bank account is added in the Stripe Dashboard under bank accounts and payouts. That step is outside this website. Live charges stay off until that account is saved.

To switch from test payments to live payments, after a test webhook has marked an order paid:

1. In Stripe, turn **Test mode** off.
2. Add a new webhook for the same URL and the same three events, and copy the new live `whsec_...` secret. The test secret will not verify live events.
3. Set `STRIPE_SECRET_KEY` to the live secret key (`sk_live_...`).
4. Set `STRIPE_WEBHOOK_SECRET` to the live signing secret.
5. Set `STRIPE_LIVE_ENABLED=true`.
6. Restart the server. Until that flag is true, a live secret key is rejected and no charge is started.

## Deploy

Frontend: Vercel, root `frontend`. `/api` is rewritten to the Render service in `frontend/vercel.json`.

Backend: Render, root `backend`. Set every variable in `.env.example`. The database tables are created on startup. Existing contact, customer, and inquiry data is kept.
