const { json, stripeRequest, PLANS } = require("../lib/orders");
const { recordPaidSession } = require("../lib/recordPaid");

function sessionId(req) {
  const fromQuery = req.query && (req.query.session_id || req.query.sessionId);
  if (fromQuery) return String(fromQuery);
  try {
    const url = new URL(req.url, "https://svetnadecata.com");
    return url.searchParams.get("session_id") || "";
  } catch (error) {
    return "";
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Методот не е дозволен." });
  const id = sessionId(req);
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json(res, 400, { error: "Нема уплата за приказ." });

  try {
    const session = await stripeRequest("checkout/sessions/" + id, null, "GET");
    const plan = PLANS[session.metadata && session.metadata.plan] || null;
    const paid = session.payment_status === "paid";
    const name = (session.metadata && session.metadata.customer_name) || "";
    let alekstonError = "";
    if (paid && plan) {
      const recorded = await recordPaidSession(session);
      if (!recorded.ok && !recorded.already) alekstonError = recorded.error || "Alekston не ја прими нарачката.";
    }
    return json(res, 200, {
      paid: paid,
      id: plan ? plan.id : "",
      plan: plan ? plan.id : "",
      name: plan ? plan.name : "",
      label: plan ? plan.label : "",
      price: plan ? plan.price : 0,
      buyer: name.split(" ")[0] || "",
      eventId: "stripe-" + id,
      alekston: alekstonError ? "failed" : "ok"
    });
  } catch (error) {
    return json(res, 502, { error: error.publicMessage || "Не можеме да ја провериме уплатата." });
  }
};
