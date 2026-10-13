// Daily safety net (Vercel cron): records any paid subscription invoices from the last 3 days
// that the webhook missed. Idempotent via invoice metadata.alekston_order_id.
const { json, stripeRequest } = require("../lib/orders");
const { recordInvoice } = require("../lib/subscription");
module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== "Bearer " + secret) return json(res, 401, { error: "auth" });
  const since = Math.floor(Date.now() / 1000) - 3 * 86400;
  const list = await stripeRequest("invoices?status=paid&limit=100&created[gte]=" + since, null, "GET");
  const out = [];
  for (const inv of list.data || []) {
    try { const r = await recordInvoice(inv); if (!r.skipped) out.push({ id: inv.id, ok: !!(r.ok || r.already) }); }
    catch (e) { out.push({ id: inv.id, error: e.message }); }
  }
  return json(res, 200, { checked: (list.data || []).length, recorded: out });
};
