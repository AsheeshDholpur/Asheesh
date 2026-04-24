// api/create-order.js
// ─────────────────────────────────────────────────────────────
// Creates a Razorpay order server-side.
// The KEY SECRET never leaves this file / your server.
// ─────────────────────────────────────────────────────────────

const Razorpay = require("razorpay");

const rzp = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,     // set in Vercel dashboard
  key_secret: process.env.RAZORPAY_SECRET,     // set in Vercel dashboard
});

module.exports = async function handler(req, res) {
  // ── CORS headers (allow your domain only) ──────────────────
  res.setHeader("Access-Control-Allow-Origin",  "https://www.asheesh.in");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const order = await rzp.orders.create({
      amount:   49900,          // ₹499 in paise  ← change if price changes
      currency: "INR",
      receipt:  "rcpt_" + Date.now(),
    });

    return res.status(200).json({ order_id: order.id });

  } catch (err) {
    console.error("Razorpay order creation failed:", err);
    return res.status(500).json({ error: "Could not create order" });
  }
};
