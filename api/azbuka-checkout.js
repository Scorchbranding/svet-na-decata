// Stripe Checkout for Мојата прва азбука — PDF (490 ден.).
// Tags every session so svet-na-decata webhook/reconcile never treat it as 652 комбинации.
const { json, readBody, allowedOrigin, stripeRequest, SITE_TAG, cleanLanding } = require("../lib/orders");

const PRODUCT = "mk-azbuka-brojki";
const PLAN = "azbuka-pdf";
const AMOUNT = 49000; // 490 MKD — do not change
const PRODUCT_NAME = "Мојата прва азбука и бројки – 60 работни листови (PDF)";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Методот не е дозволен." });
  try {
    const body = await readBody(req);
    const headerOrigin = req.headers.origin || "";
    const referer = req.headers.referer || req.headers.referrer || "";
    let refererOrigin = "";
    try { if (referer) refererOrigin = new URL(referer).origin; } catch (e) {}
    const origin = allowedOrigin(body.origin) || allowedOrigin(headerOrigin) || allowedOrigin(refererOrigin) || allowedOrigin("https://svetnadecata.com");
    if (!origin) return json(res, 400, { error: "Плаќањето мора да започне од нашата страница." });

    const landing = cleanLanding(body.landing) || {};
    const lmeta = {};
    [["path", "l_path"], ["utm_source", "l_us"], ["utm_medium", "l_um"], ["utm_campaign", "l_uc"], ["utm_content", "l_uct"], ["utm_term", "l_ut"], ["fbclid", "l_fb"]].forEach(function (p) {
      const v = landing[p[0]] == null ? "" : String(landing[p[0]]).trim();
      if (v) lmeta[p[1]] = v.slice(0, p[0] === "fbclid" ? 450 : 200);
    });
    if (lmeta.l_path && !/^\/[\w\-\/.]*$/.test(lmeta.l_path)) delete lmeta.l_path;

    const metadata = Object.assign({
      site: SITE_TAG,
      product: PRODUCT,
      plan: PLAN
    }, lmeta);

    if (body && (body.dryRun === true || body.dryRun === "1")) {
      return json(res, 200, { ok: true, dryRun: true, metadata: metadata });
    }

    const priceId = process.env.STRIPE_AZBUKA_PRICE_ID || process.env.STRIPE_PRICE_ID || "";
    const params = {
      mode: "payment",
      locale: "auto",
      billing_address_collection: "auto",
      allow_promotion_codes: "true",
      submit_type: "pay",
      cancel_url: origin + "/azbuka?plakanje=otkazano#kupi",
      success_url: origin + "/azbuka/blagodarime.html?session_id={CHECKOUT_SESSION_ID}",
      "metadata[site]": metadata.site,
      "metadata[product]": metadata.product,
      "metadata[plan]": metadata.plan,
      "payment_intent_data[metadata][site]": SITE_TAG,
      "payment_intent_data[metadata][product]": PRODUCT,
      "payment_intent_data[metadata][plan]": PLAN,
      "payment_intent_data[description]": "Мојата прва азбука и бројки (PDF). Повторно преземање: " + origin + "/azbuka/pristap.html",
      "payment_intent_data[statement_descriptor_suffix]": "AZBUKA",
      "custom_text[submit][message]": "Веднаш по плаќањето ќе се отвори страница за преземање на PDF-от. Потврда (сметка) добивате и на е-пошта."
    };
    Object.keys(lmeta).forEach(function (k) {
      params["metadata[" + k + "]"] = lmeta[k];
    });
    if (priceId) {
      params["line_items[0][price]"] = priceId;
      params["line_items[0][quantity]"] = "1";
    } else {
      params["line_items[0][quantity]"] = "1";
      params["line_items[0][price_data][currency]"] = "mkd";
      params["line_items[0][price_data][unit_amount]"] = String(AMOUNT);
      params["line_items[0][price_data][product_data][name]"] = PRODUCT_NAME;
    }

    const session = await stripeRequest("checkout/sessions", params);
    if (!session.url) return json(res, 502, { error: "Stripe не врати страница за плаќање." });
    return json(res, 200, { url: session.url });
  } catch (error) {
    const message = error.publicMessage || "Не успеавме да го отвориме плаќањето. Обидете се повторно.";
    return json(res, error.publicMessage === "Плаќањето со картичка сè уште не е вклучено." ? 503 : 502, { error: message });
  }
};
