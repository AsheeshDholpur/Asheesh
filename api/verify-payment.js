// api/verify-payment.js
// ─────────────────────────────────────────────────────────────
// Verifies Razorpay payment signature AFTER checkout completes.
// Always verify before granting Pro access to the user.
// ─────────────────────────────────────────────────────────────

const crypto = require("crypto");

module.exports = function handler(req, res) {
  // ── CORS headers ───────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin",  "https://www.asheesh.in");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ verified: false, error: "Missing fields" });
  }

  // Razorpay signature = HMAC-SHA256(order_id + "|" + payment_id, secret)
  const body     = razorpay_order_id + "|" + razorpay_payment_id;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET)
    .update(body)
    .digest("hex");

  if (expected === razorpay_signature) {
    // ✅ Payment is genuine
    // TODO: Mark user as Pro in your database (Firestore, etc.)
    return res.status(200).json({ verified: true });
  } else {
    // ⛔ Signature mismatch — do NOT grant access
    return res.status(400).json({ verified: false, error: "Invalid signature" });
  }
};
