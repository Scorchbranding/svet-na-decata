const { json, readBody, stripeRequest } = require("../lib/orders");
const { recordPaidSession } = require("../lib/recordPaid");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Методот не е дозволен." });
  try {
    const event = await readBody(req);
    const type = event && event.type;
    const objectId = event && event.data && event.data.object && event.data.object.id;
    if (type !== "checkout.session.completed" || !/^cs_[A-Za-z0-9_]+$/.test(objectId || "")) {
      return json(res, 200, { received: true });
    }
    const session = await stripeRequest("checkout/sessions/" + objectId, null, "GET");
    const recorded = await recordPaidSession(session);
    return json(res, recorded.ok || recorded.skipped || recorded.already ? 200 : 500, {
      received: true,
      ok: Boolean(recorded.ok || recorded.already)
    });
  } catch (error) {
    return json(res, 500, { error: error.publicMessage || "Webhook не помина." });
  }
};
