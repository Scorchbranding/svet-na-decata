// Admin-only: re-send the PDF download e-mail for one paid Stripe checkout session.
// Auth: header "Authorization: Bearer <CRON_SECRET>". Dry-run is the DEFAULT; pass "send": true to really send.
// Body: { session_id: "cs_live_...", send?: boolean, intro?: "plain text shown above the mail (e.g. apology)",
//         to?: "test@svetnadecata.com" (override recipient; only @svetnadecata.com allowed, for tests) }
// Ignores the customer_emailed / azbuka_email_id flags on purpose (Yahoo bounces happened AFTER SMTP accepted).
const { json, readBody, stripeRequest, PLANS, isForeignSession } = require("../lib/orders");
const { sendViaSmtp, escapeHtml, confirmationBody, DEFAULT_FROM } = require("../lib/email");
const { payloadFromSession } = require("../lib/recordPaid");
const azbuka = require("./azbuka-mail");

function mask(email) {
  const [u, d] = String(email || "").split("@");
  return d ? (u ? u[0] : "") + "***@" + d : "";
}

function buildResend(s, intro) {
  const id = s.id;
  const cd = s.customer_details || {};
  const paid = s.payment_status === "paid" || s.payment_status === "no_payment_required";
  if (!paid) return { error: "not-paid" };
  const introHtml = intro ? "<p>" + escapeHtml(intro).replace(/\n/g, "<br>") + "</p>" : "";
  if (s.metadata && s.metadata.product === azbuka.PRODUCT) {
    return {
      product: "azbuka", to: cd.email || "", subject: azbuka.SUBJECT,
      link: "https://svetnadecata.com/azbuka/api/download?session_id=" + encodeURIComponent(id),
      html: introHtml + azbuka.azbukaHtml(s, id)
    };
  }
  if (isForeignSession(s)) return { error: "foreign-session" };
  const plan = PLANS[s.metadata && s.metadata.plan];
  if (!plan || !(plan.id === "pdf" || plan.id === "komplet")) return { error: "not-digital" };
  const payload = payloadFromSession(s);
  if (!payload) return { error: "not-paid" };
  const link = "https://svetnadecata.com/preuzmi.html?session_id=" + id;
  const body = confirmationBody(Object.assign({}, payload, { downloadUrl: link }));
  return {
    product: "svet", to: payload.email, subject: "Потврда за нарачка — " + (payload.productTitle || "652 комбинации"),
    link, html: introHtml + body.html
  };
}

async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== "Bearer " + secret) return json(res, 401, { error: "unauthorized" });
  try {
    const body = await readBody(req);
    const id = String(body.session_id || "");
    if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id)) return json(res, 400, { error: "session" });
    const s = await stripeRequest("checkout/sessions/" + id, null, "GET");
    const mail = buildResend(s, body.intro ? String(body.intro).slice(0, 1000) : "");
    if (mail.error) return json(res, 422, { error: mail.error });
    let to = mail.to;
    if (body.to) {
      if (!/^[^@\s]+@svetnadecata\.com$/i.test(String(body.to))) return json(res, 400, { error: "override-only-own-domain" });
      to = String(body.to);
    }
    if (!to) return json(res, 422, { error: "no-email" });
    const info = { session_id: id, product: mail.product, to: body.to ? to : mask(to), link: mail.link, subject: mail.subject };
    if (body.send !== true) return json(res, 200, Object.assign({ dry_run: true }, info));
    const messageId = await sendViaSmtp({ from: process.env.ORDER_FROM || DEFAULT_FROM, to, subject: mail.subject, html: mail.html });
    if (!body.to) {
      await stripeRequest("checkout/sessions/" + id, { "metadata[resent_at]": new Date().toISOString() }).catch(() => {});
    }
    console.log("admin resend", id.slice(0, 14), mail.product, body.to ? "override" : "buyer");
    return json(res, 200, Object.assign({ sent: true, messageId: String(messageId).slice(0, 200) }, info));
  } catch (error) {
    console.error("admin resend error", error && (error.publicMessage || error.message));
    return json(res, 502, { error: "failed" });
  }
}

module.exports = handler;
module.exports.buildResend = buildResend;
module.exports.mask = mask;
