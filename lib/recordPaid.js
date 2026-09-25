const { PLANS, stripeRequest, notifySeller } = require("./orders");
const { pushAlekstonOrder } = require("./alekston");

function payloadFromSession(session) {
  const plan = PLANS[session.metadata && session.metadata.plan] || null;
  if (!plan || session.payment_status !== "paid") return null;
  const meta = session.metadata || {};
  const email = session.customer_email || (session.customer_details && session.customer_details.email) || "";
  const address = meta.address || (plan.physical ? "" : "Дигитална нарачка");
  const city = meta.city || "";
  return {
    planName: plan.name,
    label: plan.label,
    price: plan.price,
    paymentLabel: "Платено со Stripe",
    name: meta.customer_name || "",
    phone: meta.phone || "",
    email: email,
    city: city,
    address: address,
    note: meta.note || "",
    paid: true,
    externalId: session.id,
    notice: plan.id === "pdf"
      ? "PDF се испраќа на е-пошта по уплатата."
      : plan.id === "komplet"
        ? "PDF се испраќа на е-пошта по уплатата. Печатената верзија се праќа на адреса."
        : "Печатената верзија се праќа на адреса."
  };
}

async function recordPaidSession(session) {
  const payload = payloadFromSession(session);
  if (!payload) return { ok: false, skipped: true };
  const meta = session.metadata || {};
  if (meta.seller_notified !== "1") {
    const sent = await notifySeller(payload);
    if (sent) {
      await stripeRequest("checkout/sessions/" + session.id, { "metadata[seller_notified]": "1" });
    }
  }
  if (meta.alekston_order_id) return { ok: true, id: meta.alekston_order_id, already: true };
  const alekston = await pushAlekstonOrder(payload);
  if (alekston.ok && alekston.id) {
    await stripeRequest("checkout/sessions/" + session.id, { "metadata[alekston_order_id]": alekston.id });
  }
  return alekston;
}

module.exports = { payloadFromSession, recordPaidSession };
