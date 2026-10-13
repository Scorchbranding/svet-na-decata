// Thank-you page for the subscription: verifies the session and records the first paid invoice in Alekston.
const { json, stripeRequest } = require("../lib/orders");
const { recordInvoice, SUB_PRODUCT } = require("../lib/subscription");
module.exports = async function handler(req, res) {
  const id = String((req.query && req.query.session_id) || "");
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json(res, 400, { ok: false });
  try {
    const s = await stripeRequest("checkout/sessions/" + id, null, "GET");
    if (!s.metadata || s.metadata.product !== SUB_PRODUCT || s.mode !== "subscription") return json(res, 200, { ok: false });
    const sub = s.subscription ? await stripeRequest("subscriptions/" + s.subscription, null, "GET") : null;
    if (sub && sub.latest_invoice) await recordInvoice(sub.latest_invoice).catch((e) => console.error("sub record", e.message));
    const name = (s.customer_details && s.customer_details.name) || "";
    return json(res, 200, { ok: s.status === "complete", buyer: name.split(" ")[0] || "", email: (s.customer_details && s.customer_details.email) || "" });
  } catch (e) { return json(res, 502, { ok: false }); }
};
