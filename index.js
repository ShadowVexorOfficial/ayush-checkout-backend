/**
 * Order-logging backend for Ayush's book checkout — direct UPI, no gateway.
 *
 * WHY THIS EXISTS:
 * Direct UPI (paying straight to a personal/business UPI ID) has no
 * built-in way to tell your website "this payment succeeded" — that
 * kind of automatic confirmation only comes from a licensed payment
 * gateway (Razorpay, Cashfree, etc). Since you're going gateway-free,
 * the buyer pays via the UPI QR/link on the site, then submits their
 * UTR (transaction reference number). This server just logs that
 * submission so you can check it against your bank/UPI app and
 * manually mark the order fulfilled.
 *
 * ENDPOINTS:
 *   POST /api/submit-order    — buyer submits name, email, UTR, cart items
 *   GET  /api/orders          — you view pending orders (needs admin token)
 *   PATCH /api/orders/:id     — you mark an order verified/rejected
 *
 * SETUP:
 *   1. npm install
 *   2. cp .env.example .env   and set your own ADMIN_TOKEN
 *   3. npm start
 *   4. Deploy somewhere reachable (Render, Railway, Fly.io, a VPS, etc.)
 *      and point BACKEND_URL in the website's <script> to it.
 *
 * Orders are stored in a local JSON file (orders.json) for simplicity.
 * That's fine for a small personal store; swap in a real database
 * (Postgres, SQLite, etc.) if order volume grows.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());          // for production, restrict this to your actual site's domain
app.use(express.json());

const ORDERS_FILE = path.join(__dirname, 'orders.json');

function readOrders(){
  if (!fs.existsSync(ORDERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeOrders(orders){
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

/**
 * In a real store, prices should be looked up here from your own
 * database — never trust the price the browser sends you. This
 * mirrors the book list from the site so the demo is self-contained;
 * replace with a real DB lookup if book prices can change.
 */
const BOOK_PRICES = {
  'Before The Monsoon Ends': 499,
  'Before The Monsoon Ends — Signed': 499,
  'Salt & Marigold': 399,
  'The Quiet Hour': 349,
  'Small Weathers': 299
};

function calculateTrustedTotal(items){
  return items.reduce((sum, item) => {
    const trustedPrice = BOOK_PRICES[item.name];
    if (trustedPrice === undefined) return sum; // unknown item, ignore it
    const qty = Math.max(1, Math.min(20, Number(item.qty) || 1)); // sane bounds
    return sum + trustedPrice * qty;
  }, 0);
}

function requireAdmin(req, res, next){
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN){
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/* ---------- 1. Buyer submits an order after paying ---------- */
app.post('/api/submit-order', (req, res) => {
  const { name, email, utr, items } = req.body;

  if (!name || !email || !utr || !Array.isArray(items) || !items.length){
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const trustedAmount = calculateTrustedTotal(items);
  if (trustedAmount <= 0){
    return res.status(400).json({ error: 'Could not determine order total' });
  }

  const order = {
    id: 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString(),
    name: String(name).slice(0, 200),
    email: String(email).slice(0, 200),
    utr: String(utr).slice(0, 100),
    items,
    amount: trustedAmount,
    status: 'pending_verification' // you flip this to 'verified' or 'rejected' after checking your UPI app
  };

  const orders = readOrders();
  orders.push(order);
  writeOrders(orders);

  // TODO: notify yourself here too — e.g. send yourself an email or
  // a Slack/Telegram message so you don't have to poll GET /api/orders.

  res.json({ orderId: order.id });
});

/* ---------- 2. You check pending orders ---------- */
app.get('/api/orders', requireAdmin, (req, res) => {
  res.json(readOrders());
});

/* ---------- 3. You mark an order verified/rejected after checking your bank/UPI app ---------- */
app.patch('/api/orders/:id', requireAdmin, (req, res) => {
  const { status } = req.body; // 'verified' or 'rejected'
  if (!['verified', 'rejected'].includes(status)){
    return res.status(400).json({ error: 'status must be "verified" or "rejected"' });
  }

  const orders = readOrders();
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.status = status;
  writeOrders(orders);

  // TODO: if verified, this is a good place to trigger a shipping
  // workflow or a confirmation email to the buyer.

  res.json(order);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Ayush order-logging backend running on http://localhost:${PORT}`);
});
