// Buyer e-mail for Мојата прва азбука PDF (Stripe). Called by the azbuka site after payment and by its daily sync.
// Public but safe: only sends for a verified paid azbuka session, to that session's own buyer, once
// (idempotent via Stripe metadata azbuka_email_id).
const { json, readBody, stripeRequest } = require("../lib/orders");
const { sendViaSmtp, escapeHtml } = require("../lib/email");
const PRODUCT = "mk-azbuka-brojki";
const { offerHtml } = require("../lib/subscription");
const SITE = "https://svetnadecata.com/azbuka";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  try {
    const body = await readBody(req);
    const id = String(body.session_id || "");
    if (!/^cs_live_[A-Za-z0-9]+$/.test(id)) return json(res, 400, { error: "session" });
    const s = await stripeRequest("checkout/sessions/" + id, null, "GET");
    const paid = s.status === "complete" && (s.payment_status === "paid" || s.payment_status === "no_payment_required");
    if (!paid || !s.metadata || s.metadata.product !== PRODUCT) return json(res, 403, { error: "not-paid" });
    if (s.metadata.azbuka_email_id) return json(res, 200, { ok: true, already: true });
    const cd = s.customer_details || {};
    if (!cd.email) return json(res, 200, { ok: false, error: "no-email" });
    const first = String(cd.name || "").split(" ")[0];
    const page = SITE + "/blagodarime.html?session_id=" + encodeURIComponent(id);
    const direct = SITE + "/api/download?session_id=" + encodeURIComponent(id);
    const html = [
      "<div style=\"font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1f2330;max-width:560px\">",
      "<p>Здраво" + (first ? " " + escapeHtml(first) : "") + ",</p>",
      "<p>Ви благодариме за нарачката! Плаќањето е примено.</p>",
      "<p><strong>Производ:</strong> Мојата прва азбука и бројки – 60 работни листови (PDF)<br>",
      "<strong>Цена:</strong> " + Math.round((s.amount_total || 0) / 100) + " ден.</p>",
      "<p><a href=\"" + direct + "\" style=\"display:inline-block;background:#e63946;color:#fff;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:12px\">Преземи го PDF-от</a></p>",
      "<p>Линкот останува активен – зачувајте ја оваа порака. Ако копчето не работи, отворете ја страницата за преземање:<br><a href=\"" + page + "\">" + page + "</a></p>",
      "<p>Печатете на A4 колку пати сакате за вашето семејство. Прашања? Само одговорете на оваа порака.</p>",
      offerHtml("azbuka", cd.email),
      "<p>Свет на децата</p></div>"
    ].join("");
    const from = process.env.ORDER_FROM || "Свет на децата <radost@svetnadecata.com>";
    const messageId = await sendViaSmtp({ from, to: cd.email, subject: "Вашиот PDF: Мојата прва азбука и бројки", html });
    const mid = String(messageId || "sent").slice(0, 200);
    await stripeRequest("checkout/sessions/" + id, { "metadata[azbuka_email_id]": mid }).catch(() => {});
    console.log("azbuka mail sent", id.slice(0, 14), mid);
    return json(res, 200, { ok: true, messageId: mid });
  } catch (error) {
    console.error("azbuka mail error", error && (error.publicMessage || error.message));
    return json(res, 502, { error: "mail-failed" });
  }
};
