const { json, PLANS, stripeRequest, notifySeller } = require("../lib/orders");

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
    if (paid && plan && session.metadata.seller_notified !== "1") {
      const sent = await notifySeller({
        planName: plan.name,
        label: plan.label,
        paymentLabel: "Платено со Stripe",
        name: name,
        phone: session.metadata.phone || "",
        email: session.customer_email || session.customer_details && session.customer_details.email || "",
        city: session.metadata.city || "",
        address: session.metadata.address || "",
        note: session.metadata.note || "",
        notice: plan.id === "pdf"
          ? "PDF се испраќа на е-пошта по уплатата."
          : plan.id === "komplet"
            ? "PDF се испраќа на е-пошта по уплатата. Печатената книшка се праќа на адреса."
            : "Печатената книшка се праќа на адреса."
      });
      if (sent) {
        await stripeRequest("checkout/sessions/" + id, { "metadata[seller_notified]": "1" });
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
