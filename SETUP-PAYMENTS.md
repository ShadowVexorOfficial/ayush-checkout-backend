# Setting up direct UPI payments on Ayush's book site

This uses **direct UPI** — buyers pay straight to your own UPI ID, with no
payment gateway (and no gateway fees) in between. The tradeoff: there's no
automatic "payment succeeded" signal, so buyers submit their UTR
(transaction reference number) after paying, and you confirm it manually
against your bank/UPI app. This backend just logs those submissions so
you have one place to check them.

## How it fits together

```
Browser (website)                      Your backend (this folder)
─────────────────                      ───────────────────────────
"Checkout" clicked
   → shows UPI QR code + payment link   (generated entirely in the browser,
                                          no backend involved for this part)
buyer pays in their UPI app
buyer enters name/email/UTR, submits
   → POST /api/submit-order        ──────────────────────────────►
                                         order saved to orders.json
                                         status: "pending_verification"
   ◄──────────────────────────────── { orderId }

you check your bank/UPI app for the payment, then:
   GET /api/orders                 ──────────────────────────────►  (see pending orders)
   PATCH /api/orders/:id           ──────────────────────────────►  (mark verified/rejected)
```

## Steps

1. **Set your UPI ID in the website**
   In `ayush-author-website.html`, find these lines near the checkout code:
   ```js
   const UPI_VPA = 'ayush@upi';       // <-- your real UPI ID (e.g. ayush@oksbi)
   const UPI_PAYEE_NAME = 'Ayush';    // <-- your name or business name
   ```
   This is all that's needed to generate the QR code and payment link —
   no account signup, no approval process, works immediately.

2. **Set up the backend** (for logging submitted orders)
   ```
   cd server
   npm install
   cp .env.example .env
   # edit .env and set ADMIN_TOKEN to a long random string
   npm start
   ```
   Runs on `http://localhost:4000` by default.

3. **Deploy the backend somewhere reachable**
   Localhost only works while testing on your own machine. Deploy this
   folder to Render, Railway, Fly.io, or a small VPS — any of these are
   fine for something this size. Set `ADMIN_TOKEN` there too.

4. **Point the website at your deployed backend**
   In `ayush-author-website.html`:
   ```js
   const BACKEND_URL = 'https://your-backend.example.com';
   ```

5. **Checking and confirming orders**
   Orders land in `server/orders.json` with `status: "pending_verification"`.
   To review them:
   ```
   curl -H "x-admin-token: YOUR_ADMIN_TOKEN" https://your-backend.example.com/api/orders
   ```
   Match each order's UTR against your UPI app's transaction history,
   then mark it:
   ```
   curl -X PATCH https://your-backend.example.com/api/orders/ORDER_ID \
     -H "x-admin-token: YOUR_ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"status":"verified"}'
   ```
   A simple admin page that does this with buttons instead of curl is a
   natural next step if you want one — happy to build it.

## Things worth adding as this grows

- **A notification on new orders** — right now you have to poll
  `GET /api/orders`. Adding an email/Telegram/Slack ping in the
  `TODO` spot inside `index.js` means you find out immediately.
- **A real database** instead of `orders.json` — fine for a personal
  store's volume, but a JSON file won't scale indefinitely.
- **Buyer confirmation email** once you mark an order verified.
- **Restricting CORS** to only your actual website's domain, not `*`.
- **Fraud awareness**: because there's no gateway, a bad actor could
  submit a fake/random UTR. Always cross-check the UTR against your
  actual UPI app history before shipping anything — never ship on the
  submission alone.
