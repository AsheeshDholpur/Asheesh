// api/create-order.js
const Razorpay = require("razorpay");

const rzp = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
});

// Allow both asheesh.in and www.asheesh.in
const ALLOWED_ORIGINS = [
  "https://asheesh.in",
  "https://www.asheesh.in"
];

module.exports = async function handler(req, res) {
  const origin = req.headers.origin;

  // Set CORS for whichever variant the browser sends
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");

  // Handle preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const order = await rzp.orders.create({
      amount:   49900,        // ₹499 in paise
      currency: "INR",
      receipt:  "rcpt_" + Date.now(),
    });

    return res.status(200).json({ order_id: order.id });

  } catch (err) {
    console.error("Razorpay order creation failed:", err);
    return res.status(500).json({ error: "Could not create order" });
  }
};
