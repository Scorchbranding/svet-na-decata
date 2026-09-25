const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { json, stripeRequest, PLANS } = require("../lib/orders");

const BLOB_URL = "https://axnyvclgzhkyx3k6.private.blob.vercel-storage.com/652-kombinacii.pdf";

function sessionId(req) {
  const fromQuery = req.query && req.query.session_id;
  if (fromQuery) return String(fromQuery);
  try {
    return new URL(req.url, "https://svetnadecata.com").searchParams.get("session_id") || "";
  } catch (error) {
    return "";
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Методот не е дозволен." });
  const id = sessionId(req);
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json(res, 400, { error: "Нема нарачка за овој PDF." });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return json(res, 503, { error: "PDF-от сè уште не е подготвен." });

  try {
    const session = await stripeRequest("checkout/sessions/" + id, null, "GET");
    const plan = PLANS[session.metadata && session.metadata.plan] || null;
    const digital = plan && (plan.id === "pdf" || plan.id === "komplet");
    if (session.payment_status !== "paid" || !digital) {
      return json(res, 403, { error: "Овој PDF е достапен по платена нарачка за дигитална верзија." });
    }
    const upstream = await fetch(BLOB_URL, { headers: { Authorization: "Bearer " + token } });
    if (!upstream.ok || !upstream.body) return json(res, 502, { error: "PDF-от не може да се отвори. Пробај повторно." });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=\"652-kombinacii.pdf\"");
    res.setHeader("Cache-Control", "private, no-store");
    const length = upstream.headers.get("content-length");
    if (length) res.setHeader("Content-Length", length);
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    if (!res.headersSent) return json(res, 502, { error: "PDF-от не може да се отвори. Пробај повторно." });
  }
};
