// GET /api/pretplata?src=svet|azbuka&email=..&ref=..  → 303 to Stripe Checkout (mode=subscription).
// GET /api/pretplata?info=1 → { priceId }.
const { json } = require("../lib/orders");
const { createSubscriptionCheckout, ensurePrice } = require("../lib/subscription");
module.exports = async function handler(req, res) {
  const q = req.query || {};
  try {
    if (q.info) return json(res, 200, { priceId: await ensurePrice(), amount: 490, currency: "MKD", interval: "month" });
    const { url } = await createSubscriptionCheckout({ source: q.src, email: q.email, ref: q.ref });
    res.statusCode = 303; res.setHeader("Location", url); res.setHeader("Cache-Control", "no-store"); return res.end();
  } catch (e) {
    console.error("pretplata error", e.publicMessage || e.message);
    return json(res, 502, { error: "Не успеавме да ја отвориме претплатата. Обидете се повторно." });
  }
};
