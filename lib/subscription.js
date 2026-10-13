// Monthly "работни активности" subscription (490 ден./месец, Stripe mode=subscription).
// Post-purchase offer only: linked from thank-you pages and order e-mails of Svet na decata and /azbuka.
const { stripeRequest, SITE_TAG } = require("./orders");
const { pushAlekstonOrder } = require("./alekston");

const SUB_PRODUCT = "svet-aktivnosti";
const LOOKUP_KEY = "svet-aktivnosti-490-mkd-monthly";
const AMOUNT = 49000;
const PRICE = 490;
const NAME = "Месечни работни активности — Свет на децата";
const SITE = "https://svetnadecata.com";
const SOURCES = { svet: "Свет на децата (главна)", azbuka: "Мојата прва азбука (/azbuka)" };

async function ensurePrice() {
  if (process.env.STRIPE_SUB_PRICE_ID) return process.env.STRIPE_SUB_PRICE_ID;
  const found = await stripeRequest("prices?active=true&limit=1&lookup_keys[]=" + LOOKUP_KEY, null, "GET");
  if (found.data && found.data[0]) return found.data[0].id;
  const price = await stripeRequest("prices", {
    currency: "mkd", unit_amount: AMOUNT, "recurring[interval]": "month",
    "product_data[name]": NAME, "product_data[metadata][site]": SITE_TAG,
    lookup_key: LOOKUP_KEY, "metadata[site]": SITE_TAG, "metadata[product]": SUB_PRODUCT
  });
  return price.id;
}

function cleanSource(v) { return SOURCES[v] ? v : "svet"; }

async function createSubscriptionCheckout({ source, email, ref }) {
  const src = cleanSource(source);
  const priceId = await ensurePrice();
  const params = {
    mode: "subscription",
    locale: "auto",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: SITE + "/pretplata.html?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: SITE + (src === "azbuka" ? "/azbuka" : "/"),
    "metadata[site]": SITE_TAG, "metadata[product]": SUB_PRODUCT, "metadata[source]": src,
    "subscription_data[metadata][site]": SITE_TAG,
    "subscription_data[metadata][product]": SUB_PRODUCT,
    "subscription_data[metadata][source]": src,
    "subscription_data[description]": "Секој месец нов сет работни активности (PDF) на е-пошта. Откажување во секое време.",
    "custom_text[submit][message]": "490 ден. месечно, автоматски. Откажување во секое време — само одговорете на нашиот мејл."
  };
  if (ref) { params["metadata[related]"] = String(ref).slice(0, 100); params["subscription_data[metadata][related]"] = String(ref).slice(0, 100); }
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) params.customer_email = String(email).slice(0, 120);
  const s = await stripeRequest("checkout/sessions", params);
  return { url: s.url, priceId };
}

function subMeta(inv) {
  return (inv.parent && inv.parent.subscription_details && inv.parent.subscription_details.metadata)
    || (inv.subscription_details && inv.subscription_details.metadata) || {};
}

// One Alekston order per paid invoice (first month + every renewal). Idempotent via invoice metadata.
async function recordInvoice(invoiceOrId) {
  const inv = typeof invoiceOrId === "string" ? await stripeRequest("invoices/" + invoiceOrId, null, "GET") : invoiceOrId;
  const meta = subMeta(inv);
  if (meta.site !== SITE_TAG || meta.product !== SUB_PRODUCT) return { skipped: "other" };
  if (inv.status !== "paid") return { skipped: "unpaid" };
  if (!inv.livemode) return { skipped: "test" };
  if (inv.metadata && inv.metadata.alekston_order_id) return { already: true, id: inv.metadata.alekston_order_id };
  const price = Math.round(Number(inv.amount_paid || 0) / 100);
  const first = inv.billing_reason === "subscription_create";
  const subId = typeof inv.subscription === "string" ? inv.subscription
    : (inv.parent && inv.parent.subscription_details && inv.parent.subscription_details.subscription) || "";
  const src = cleanSource(meta.source);
  const name = inv.customer_name || inv.customer_email || "Претплатник";
  const r = await pushAlekstonOrder({
    alekstonProductName: "Месечни работни активности (претплата 490 ден.)" + (first ? "" : " — обновување"),
    productId: process.env.ALEKSTON_SUB_PRODUCT_ID || undefined,
    planName: "Претплата — работни активности",
    alekstonProductLabel: "Месечни работни активности (претплата 490 ден.)",
    price, paid: true, name, email: inv.customer_email || "", phone: "",
    paymentLabel: "Stripe претплата (автоматски)",
    externalId: inv.id,
    notice: (first ? "Нова претплата" : "Месечно обновување") + " · " + SOURCES[src] + " · " + subId + (meta.related ? "\nПоврзана нарачка: " + meta.related : ""),
    landing: { host: src === "azbuka" ? "svetnadecata.com" : "svetnadecata.com", path: src === "azbuka" ? "/azbuka" : "/", utm_source: "postpurchase", utm_campaign: "pretplata_" + src },
    extraFields: { __orderType: "SUBSCRIPTION", __subRef: "SUB-" + subId, __subSource: SOURCES[src],
      __subStart: new Date((inv.created || Date.now() / 1000) * 1000).toISOString().slice(0, 10), ...(meta.related ? { __subRelated: meta.related } : {}) }
  });
  if (r.ok && r.id) await stripeRequest("invoices/" + inv.id, { "metadata[alekston_order_id]": r.id }).catch(() => {});
  return r;
}

// Warm, simple post-purchase offer block for e-mails.
function offerHtml(source, email) {
  const url = SITE + "/api/pretplata?src=" + cleanSource(source) + (email ? "&email=" + encodeURIComponent(email) : "");
  return "<div style=\"margin:22px 0;padding:18px 20px;background:#fff7e6;border:2px dashed #ffb703;border-radius:16px;font-family:Arial,sans-serif;color:#1f2330\">"
    + "<p style=\"margin:0 0 6px;font-size:18px\"><strong>🎁 Подарок за нашите купувачи: нови активности секој месец</strong></p>"
    + "<p style=\"margin:0 0 12px;font-size:15px;line-height:1.5\">Бидејќи веќе сте дел од семејството на Свет на децата, можете секој месец да добивате нов сет работни листови (букви, бројки, боење, лавиринти) директно на е-пошта — само <strong>490 ден. месечно</strong>. Се плаќа автоматски, а откажувате кога сакате.</p>"
    + "<p style=\"margin:0\"><a href=\"" + url + "\" style=\"display:inline-block;background:#2a9d8f;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:12px\">Да, сакам секој месец 🙌</a></p></div>";
}
function offerText(source, email) {
  return "🎁 Нови работни активности секој месец за 490 ден. (автоматски, откажување во секое време): "
    + SITE + "/api/pretplata?src=" + cleanSource(source) + (email ? "&email=" + encodeURIComponent(email) : "");
}

module.exports = { ensurePrice, createSubscriptionCheckout, recordInvoice, subMeta, offerHtml, offerText, SUB_PRODUCT, LOOKUP_KEY, PRICE };
