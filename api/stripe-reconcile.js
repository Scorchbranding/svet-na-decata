// Daily safety net: paid Checkout Sessions from the last 48h (svetnadecata or Azbuka PDF)
// that still lack metadata.alekston_order_id → push to Alekston via recordPaidSession.
// Idempotent. Auth: Authorization Bearer CRON_SECRET (same as pretplata-sync).
const { json, stripeRequest, SITE_TAG } = require("../lib/orders");
const { recordPaidSession, isAzbukaSession, AZBUKA_PRODUCT } = require("../lib/recordPaid");

function ours(session) {
  const meta = (session && session.metadata) || {};
  if (meta.site === SITE_TAG) return true;
  if (meta.product === AZBUKA_PRODUCT || isAzbukaSession(session)) return true;
  // Untagged 652 sessions from before site tagging — only if plan is a known 652 plan.
  if (!meta.site && !meta.app && !meta.product && (meta.plan === "pdf" || meta.plan === "print" || meta.plan === "komplet")) {
    return true;
  }
  return false;
}

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== "Bearer " + secret) return json(res, 401, { error: "auth" });

  const since = Math.floor(Date.now() / 1000) - 48 * 3600;
  let list;
  try {
    list = await stripeRequest(
      "checkout/sessions?limit=100&status=complete&created[gte]=" + since,
      null,
      "GET"
    );
  } catch (error) {
    return json(res, 502, { error: error.publicMessage || "stripe-list-failed" });
  }

  const out = [];
  let sent = 0;
  let already = 0;
  let skipped = 0;
  for (const session of list.data || []) {
    if (!ours(session)) { skipped += 1; continue; }
    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
      skipped += 1;
      continue;
    }
    if (session.metadata && session.metadata.alekston_order_id) {
      already += 1;
      continue;
    }
    try {
      const r = await recordPaidSession(session);
      if (r.ok || r.already) {
        if (r.already) already += 1;
        else sent += 1;
        out.push({ id: session.id, ok: true, already: !!r.already, azbuka: isAzbukaSession(session) });
      } else if (r.skipped) {
        skipped += 1;
      } else {
        out.push({ id: session.id, ok: false, error: r.error || "failed" });
      }
    } catch (e) {
      out.push({ id: session.id, ok: false, error: e.message || "error" });
    }
  }

  console.log("stripe-reconcile", {
    checked: (list.data || []).length,
    sent: sent,
    already: already,
    skipped: skipped,
    missingLogged: out.length
  });

  return json(res, 200, {
    checked: (list.data || []).length,
    sent: sent,
    already: already,
    skipped: skipped,
    recorded: out
  });
};
