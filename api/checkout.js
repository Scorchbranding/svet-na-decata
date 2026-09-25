const { json, readBody, parseOrder, allowedOrigin, stripeRequest } = require("../lib/orders");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Методот не е дозволен." });
  try {
    const body = await readBody(req);
    const parsed = parseOrder(body);
    if (parsed.error) return json(res, parsed.ignored ? 200 : 400, { error: parsed.error });
    const origin = allowedOrigin(body.origin);
    if (!origin) return json(res, 400, { error: "Нарачката мора да тргне од страницата." });

    const { plan, order } = parsed;
    const amount = Math.max(plan.amount, 5000);
    const params = {
      mode: "payment",
      locale: "auto",
      customer_email: order.email,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "mkd",
      "line_items[0][price_data][unit_amount]": String(amount),
      "line_items[0][price_data][product_data][name]": plan.stripeName,
      "metadata[plan]": plan.id,
      "metadata[customer_name]": order.name,
      "metadata[phone]": order.phone,
      "metadata[city]": order.city,
      "metadata[address]": order.address,
      "metadata[note]": order.note,
      cancel_url: origin + "/index.html?payment=cancel",
      success_url: origin + "/thanks.html?session_id={CHECKOUT_SESSION_ID}"
    };
    if (plan.physical) {
      params["payment_intent_data[shipping][name]"] = order.name;
      params["payment_intent_data[shipping][address][line1]"] = order.address;
      params["payment_intent_data[shipping][address][city]"] = order.city;
      params["payment_intent_data[shipping][address][country]"] = "MK";
    }

    const session = await stripeRequest("checkout/sessions", params);
    if (!session.url) return json(res, 502, { error: "Stripe не врати страница за плаќање." });
    return json(res, 200, { url: session.url });
  } catch (error) {
    const message = error.publicMessage || "Плаќањето не помина. Пробај повторно.";
    return json(res, error.publicMessage === "Плаќањето со картичка сè уште не е вклучено." ? 503 : 502, { error: message });
  }
};
