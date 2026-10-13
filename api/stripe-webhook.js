const { json, readBody, stripeRequest, isForeignSession } = require("../lib/orders");
const { recordPaidSession } = require("../lib/recordPaid");
const { recordInvoice, subMeta, SUB_PRODUCT } = require("../lib/subscription");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Методот не е дозволен." });
  try {
    const event = await readBody(req);
    const type = event && event.type;
    const objectId = event && event.data && event.data.object && event.data.object.id;
    if (type === "invoice.paid" || type === "invoice.payment_succeeded") {
      const m = subMeta(event.data.object);
      if (m.product !== SUB_PRODUCT || !/^in_[A-Za-z0-9]+$/.test(objectId || "")) return json(res, 200, { received: true });
      const r = await recordInvoice(objectId); // re-fetched from Stripe; never trusts the payload
      return json(res, r.ok || r.already || r.skipped ? 200 : 500, { received: true });
    }
    if (type !== "checkout.session.completed" || !/^cs_[A-Za-z0-9_]+$/.test(objectId || "")) {
      return json(res, 200, { received: true });
    }
    // Another site's session on the shared Stripe account: no order, no email, no metadata write-back.
    if (isForeignSession(event.data.object)) return json(res, 200, { received: true, skipped: "other site" });
    const session = await stripeRequest("checkout/sessions/" + objectId, null, "GET");
    if (isForeignSession(session)) return json(res, 200, { received: true, skipped: "other site" });
    const recorded = await recordPaidSession(session);
    return json(res, recorded.ok || recorded.skipped || recorded.already ? 200 : 500, {
      received: true,
      ok: Boolean(recorded.ok || recorded.already)
    });
  } catch (error) {
    return json(res, 500, { error: error.publicMessage || "Webhook не помина." });
  }
};
