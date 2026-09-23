const { json, PLANS, stripeRequest, notifySeller } = require("../lib/orders");
const { pushAlekstonOrder } = require("../lib/alekston");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Методот не е дозволен." });
  const url = new URL(req.url, "https://svet-na-decata.vercel.app");
  const id = url.searchParams.get("session_id") || "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json(res, 400, { error: "Нема уплата за приказ." });

  try {
    const session = await stripeRequest("checkout/sessions/" + id, null, "GET");
    const plan = PLANS[session.metadata && session.metadata.plan] || null;
    const paid = session.payment_status === "paid";
    const name = (session.metadata && session.metadata.customer_name) || "";
    if (paid && plan) {
      const meta = session.metadata || {};
      const email = session.customer_email || (session.customer_details && session.customer_details.email) || "";
      const payload = {
        planName: plan.name,
        label: plan.label,
        price: plan.price,
        paymentLabel: "Платено со Stripe",
        name: name,
        phone: meta.phone || "",
        email: email,
        city: meta.city || "",
        address: meta.address || "",
        note: meta.note || "",
        paid: true,
        externalId: session.id,
        notice: plan.id === "pdf"
          ? "PDF се испраќа на е-пошта по уплатата."
          : plan.id === "komplet"
            ? "PDF се испраќа на е-пошта по уплатата. Печатената книшка се праќа на адреса."
            : "Печатената книшка се праќа на адреса."
      };
      if (meta.seller_notified !== "1") {
        const sent = await notifySeller(payload);
        if (sent) {
          await stripeRequest("checkout/sessions/" + id, { "metadata[seller_notified]": "1" });
        }
      }
      if (!meta.alekston_order_id) {
        const alekston = await pushAlekstonOrder(payload);
        if (alekston.ok && alekston.id) {
          await stripeRequest("checkout/sessions/" + id, { "metadata[alekston_order_id]": alekston.id });
        }
      }
    }
    return json(res, 200, {
      paid: paid,
      plan: plan ? plan.id : "",
      name: plan ? plan.name : "",
      label: plan ? plan.label : "",
      price: plan ? plan.price : 0,
      buyer: name.split(" ")[0] || ""
    });
  } catch (error) {
    return json(res, 502, { error: error.publicMessage || "Не можеме да ја провериме уплатата." });
  }
};
