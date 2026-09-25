const { json, stripeRequest } = require("../lib/orders");
const { recordPaidSession } = require("../lib/recordPaid");

const WEBHOOK_URL = "https://svetnadecata.com/api/stripe-webhook";

async function ensureWebhook() {
  const existing = await stripeRequest("webhook_endpoints?limit=20", null, "GET");
  const found = (existing.data || []).some((hook) => hook.url === WEBHOOK_URL && hook.status !== "disabled");
  if (found) return "exists";
  await stripeRequest("webhook_endpoints", {
    url: WEBHOOK_URL,
    "enabled_events[0]": "checkout.session.completed"
  });
  return "created";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Методот не е дозволен." });
  try {
    const listed = await stripeRequest("checkout/sessions?limit=20", null, "GET");
    const rows = [];
    for (const session of listed.data || []) {
      if (session.payment_status !== "paid") continue;
      const recorded = await recordPaidSession(session);
      rows.push({
        id: session.id.slice(-8),
        plan: (session.metadata && session.metadata.plan) || "",
        ok: Boolean(recorded.ok || recorded.already),
        already: Boolean(recorded.already),
        error: recorded.error || ""
      });
    }
    const webhook = await ensureWebhook().catch((error) => error.publicMessage || "webhook-failed");
    return json(res, 200, { count: rows.length, rows, webhook });
  } catch (error) {
    return json(res, 502, { error: error.publicMessage || "Синхронот не помина." });
  }
};
