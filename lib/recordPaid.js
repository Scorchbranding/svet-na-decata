const { cleanLanding, PLANS, stripeRequest, notifySeller, denarLabel, isForeignSession } = require("./orders");
const { pushAlekstonOrder } = require("./alekston");
const { sendOrderConfirmation } = require("./email");
const { sendMetaEvent } = require("./meta");

function payloadFromSession(session) {
  if (isForeignSession(session)) return null; // another site's session
  const plan = PLANS[session.metadata && session.metadata.plan] || null;
  if (!plan || session.payment_status !== "paid") return null;
  const meta = session.metadata || {};
  const email = session.customer_email || (session.customer_details && session.customer_details.email) || "";
  const address = meta.address || (plan.physical ? "" : "Дигитална нарачка");
  const city = meta.city || "";
  const paidPrice = session.amount_total != null ? Math.round(Number(session.amount_total) / 100) : plan.price;
  return {
    planName: plan.name,
    label: denarLabel(paidPrice),
    price: paidPrice,
    paymentLabel: "Платено со Stripe",
    name: meta.customer_name || "",
    phone: meta.phone || "",
    email: email,
    city: city,
    address: address,
    note: meta.note || "",
    paid: true,
    externalId: session.id,
    landing: (function () { try { return cleanLanding(JSON.parse(meta.landing || "null")); } catch (e) { return null; } })(),
    notice: plan.id === "pdf"
      ? "Линкот за симнување е во потврдата на е-пошта и останува активен."
      : plan.id === "komplet"
        ? "Линкот за симнување е во потврдата на е-пошта. Печатената верзија се праќа на адреса."
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
  if (meta.customer_emailed !== "1" && payload.email) {
    const digital = meta.plan === "pdf" || meta.plan === "komplet";
    const mailed = await sendOrderConfirmation(Object.assign({}, payload, {
      downloadUrl: digital ? "https://svetnadecata.com/preuzmi.html?session_id=" + session.id : ""
    }));
    if (mailed.ok) {
      await stripeRequest("checkout/sessions/" + session.id, { "metadata[customer_emailed]": "1" });
    }
  }
  if (!meta.meta_purchase_sent) {
    const eventId = "stripe-" + session.id;
    const capi = await sendMetaEvent({
      eventName: "Purchase",
      eventId: eventId,
      sourceUrl: "https://svetnadecata.com/thanks.html",
      email: payload.email,
      phone: payload.phone,
      customData: {
        content_name: "652 комбинации — " + payload.planName,
        content_ids: [meta.plan || payload.planName],
        content_type: "product",
        value: payload.price,
        currency: "MKD"
      }
    });
    if (capi.ok || capi.skipped) {
      await stripeRequest("checkout/sessions/" + session.id, { "metadata[meta_purchase_sent]": "1" }).catch(function () {});
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
