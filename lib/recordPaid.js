const { cleanLanding, PLANS, ALEKSTON_VARIANTS, stripeRequest, notifySeller, denarLabel, isForeignSession, SITE_TAG } = require("./orders");
const { pushAlekstonOrder } = require("./alekston");
const { sendOrderConfirmation } = require("./email");
const { sendMetaEvent } = require("./meta");

const AZBUKA_PRODUCT = "mk-azbuka-brojki";
const AZBUKA_PLAN = "azbuka-pdf";
const AZBUKA_PDF_NAME = "Мојата прва азбука — PDF";

function isAzbukaSession(session) {
  const meta = (session && session.metadata) || {};
  return meta.product === AZBUKA_PRODUCT || meta.plan === AZBUKA_PLAN;
}

function azbukaLanding(meta) {
  const landing = { host: "svetnadecata.com", path: meta.l_path || "/azbuka" };
  [["l_us", "utm_source"], ["l_um", "utm_medium"], ["l_uc", "utm_campaign"], ["l_uct", "utm_content"], ["l_ut", "utm_term"], ["l_fb", "fbclid"]].forEach(function (p) {
    if (meta[p[0]]) landing[p[1]] = String(meta[p[0]]).slice(0, 200);
  });
  if (/blagodarime|pristap|thanks/i.test(landing.path)) landing.path = "/azbuka";
  return landing;
}

function payloadFromAzbukaSession(session) {
  if (!session || session.payment_status !== "paid") return null;
  const meta = session.metadata || {};
  const email = session.customer_email || (session.customer_details && session.customer_details.email) || "";
  const name = meta.customer_name || (session.customer_details && session.customer_details.name) || "";
  const paidPrice = session.amount_total != null ? Math.round(Number(session.amount_total) / 100) : 490;
  return {
    planName: "PDF",
    productTitle: "Мојата прва азбука и бројки",
    alekstonProductName: AZBUKA_PDF_NAME,
    alekstonProductLabel: AZBUKA_PDF_NAME,
    productId: process.env.ALEKSTON_AZBUKA_PDF_PRODUCT_ID || "cmv747dc500017zor6qikkvd3",
    label: denarLabel(paidPrice),
    price: paidPrice,
    paymentLabel: "Платено со Stripe",
    name: name,
    phone: meta.phone || (session.customer_details && session.customer_details.phone) || "",
    email: email,
    city: "",
    address: "Дигитална нарачка",
    note: meta.note || "",
    paid: true,
    externalId: session.id,
    landing: azbukaLanding(meta),
    notice: "PDF линкот е во потврдата на е-пошта (азбука)."
  };
}

function payloadFromSession(session) {
  if (isForeignSession(session)) return null; // another site's session
  // Azbuka PDF must never be recorded as 652 комбинации (plan "pdf" collision).
  if (isAzbukaSession(session)) return payloadFromAzbukaSession(session);
  const plan = PLANS[session.metadata && session.metadata.plan] || null;
  if (!plan || session.payment_status !== "paid") return null;
  const meta = session.metadata || {};
  const email = session.customer_email || (session.customer_details && session.customer_details.email) || "";
  const address = meta.address || (plan.physical ? "" : "Дигитална нарачка");
  const city = meta.city || "";
  const paidPrice = session.amount_total != null ? Math.round(Number(session.amount_total) / 100) : plan.price;
  const variant = ALEKSTON_VARIANTS[plan.id] || plan.name;
  const payload = {
    planName: plan.name,
    alekstonProductLabel: variant,
    alekstonProductName: "652 комбинации — " + plan.name,
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
  if (meta.discount_percent) {
    const pct = Number(meta.discount_percent);
    const full = Number(meta.full_price || 599);
    if (Number.isFinite(pct) && pct > 0) {
      payload.discountPercent = pct;
      payload.fullPrice = Number.isFinite(full) && full > 0 ? full : 599;
    }
  }
  return payload;
}

async function recordPaidSession(session) {
  const payload = payloadFromSession(session);
  if (!payload) return { ok: false, skipped: true };
  const meta = session.metadata || {};
  const azbuka = isAzbukaSession(session);

  // Azbuka: moja-prva-azbuka already e-mails the buyer and syncs Alekston; we only
  // fill gaps (Meta + Alekston once via alekston_order_id). Never treat as 652.
  if (!azbuka) {
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
  }

  if (!meta.meta_purchase_sent) {
    const eventId = "stripe-" + session.id;
    const customData = azbuka
      ? {
          content_name: AZBUKA_PDF_NAME,
          content_ids: ["mk-azbuka-pdf"],
          content_type: "product",
          value: payload.price,
          currency: "MKD"
        }
      : {
          content_name: "652 комбинации — " + payload.planName,
          content_ids: [meta.plan || payload.planName],
          content_type: "product",
          value: payload.price,
          currency: "MKD"
        };
    const capi = await sendMetaEvent({
      eventName: "Purchase",
      eventId: eventId,
      sourceUrl: azbuka ? "https://svetnadecata.com/azbuka" : "https://svetnadecata.com/thanks.html",
      email: payload.email,
      phone: payload.phone,
      customData: customData
    });
    if (capi.ok || capi.skipped) {
      await stripeRequest("checkout/sessions/" + session.id, { "metadata[meta_purchase_sent]": "1" }).catch(function () {});
    }
  }
  if (meta.alekston_order_id) return { ok: true, id: meta.alekston_order_id, already: true };
  const alekston = await pushAlekstonOrder(payload);
  if (alekston.ok && alekston.id) {
    const stamp = { "metadata[alekston_order_id]": alekston.id };
    // Ensure Azbuka sessions are tagged so reconcile / foreign filters stay correct.
    if (azbuka) {
      if (!meta.site) stamp["metadata[site]"] = SITE_TAG;
      if (!meta.product) stamp["metadata[product]"] = AZBUKA_PRODUCT;
      if (!meta.plan || meta.plan === "pdf") stamp["metadata[plan]"] = AZBUKA_PLAN;
    }
    await stripeRequest("checkout/sessions/" + session.id, stamp);
  }
  return alekston;
}

module.exports = { payloadFromSession, recordPaidSession, isAzbukaSession, AZBUKA_PRODUCT, AZBUKA_PLAN };
