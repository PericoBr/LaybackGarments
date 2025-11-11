// --- CORE DEPENDENCIES ---
const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const PaystackSDK = require('paystack-sdk');
const stripePackage = require('stripe');
const { stringify } = require('csv-stringify/sync');
const crypto = require('crypto');

// --- ENV & VALIDATION ---
require('dotenv').config();

// 🔒 CRITICAL: Validate required env vars
const required = ['JWT_SECRET', 'PAYSTACK_SECRET_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env: ${key}`);
    process.exit(1);
  }
}

// --- APP SETUP ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// --- DATABASE CONFIG (Render-compatible) ---
const dbConfig = {
  // ✅ Use Render PostgreSQL (free) OR keep SQL Server externally
  server: process.env.DB_HOST || 'DESKTOP-JMIJH98\\SQLEXPRESS',
  database: process.env.DB_NAME || 'LaybackGarmentsDB',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'AinzOoalGown369',
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    trustServerCertificate: process.env.NODE_ENV === 'development',
    encrypt: process.env.NODE_ENV !== 'development',
    enableArithAbort: true,
    connectionTimeout: 15000,
    requestTimeout: 30000
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// 📦 Global connection pool
let pool;
async function getPool() {
  if (!pool) {
    console.log('🔗 Initializing DB pool...');
    pool = await sql.connect(dbConfig);
    console.log('✅ DB pool ready');
  }
  return pool;
}

// --- SERVICES ---
const paystack = new PaystackSDK(process.env.PAYSTACK_SECRET_KEY);
const stripe = stripePackage(process.env.STRIPE_SECRET_KEY);

// --- MIDDLEWARE ---
function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required.' });
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid/expired token.' });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}

// --- 🔐 HEALTH CHECKS (Render requires / for liveness) ---
app.get('/', (req, res) => res.status(200).json({ status: 'ok', service: 'LaybackGarments API' }));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', uptime: `${(process.uptime() / 60).toFixed(1)} min` }));
app.get('/ready', async (req, res) => {
  try {
    const p = await getPool();
    await p.request().query('SELECT 1');
    res.status(200).json({ database: 'connected' });
  } catch (err) {
    res.status(503).json({ database: 'disconnected' });
  }
});

// --- PAYSTACK WEBHOOK (Render HTTPS-ready) ---
app.post('/api/paystack/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['x-paystack-signature'];
  if (!sig) return res.status(400).send('Missing signature');
  
  const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(req.body).digest('hex');
  if (hash !== sig) return res.status(400).send('Invalid signature');

  let event;
  try { event = JSON.parse(req.body); } 
  catch (e) { return res.status(400).send('Invalid JSON'); }

  if (event.event === 'charge.success') {
    const orderId = event.data.metadata?.custom_fields?.find(f => f.variable_name === 'order_id')?.value;
    if (orderId) {
      try {
        const p = await getPool();
        await p.request()
          .input('orderId', sql.Int, orderId)
          .input('status', sql.NVarChar, 'Paid')
          .query('UPDATE Orders SET PaymentStatus = @status WHERE OrderID = @orderId');
        console.log(`✅ Order ${orderId} paid (Paystack)`);
      } catch (e) { console.error('DB error in Paystack webhook:', e); }
    }
  }
  res.json({ received: true });
});

// --- STRIPE WEBHOOK ---
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const orderId = event.data.object.metadata?.orderId;
    if (orderId) {
      try {
        const p = await getPool();
        await p.request()
          .input('orderId', sql.Int, orderId)
          .input('status', sql.NVarChar, 'Paid')
          .query('UPDATE Orders SET PaymentStatus = @status WHERE OrderID = @orderId');
        console.log(`✅ Order ${orderId} paid (Stripe)`);
      } catch (e) { console.error('DB error in Stripe webhook:', e); }
    }
  }
  res.json({ received: true });
});

// ✅ YOUR EXISTING ROUTES GO BELOW — PASTE THEM HERE ✅
// (Keep all your /api/register, /api/orders, etc. — they’re production-ready)

// Sample placeholder — replace with your full routes:
app.post('/api/register', (req, res) => {
  res.status(501).json({ error: 'Not implemented — paste your register route here' });
});

// --- START SERVER ---
async function start() {
  try {
    await getPool(); // Warm up DB
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Mode: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('❌ Server startup failed:', err);
    process.exit(1);
  }
}

start();

// --- CLEAN SHUTDOWN ---
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  if (pool) await pool.close();
  process.exit(0);
});