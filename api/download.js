const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { json, stripeRequest, PLANS, isForeignSession } = require("../lib/orders");
const { verifyCodToken, verifyShareToken } = require("../lib/pdf-tokens");
const { validOrderId } = require("../lib/cod-pdf");

const BLOB_URL = "https://axnyvclgzhkyx3k6.private.blob.vercel-storage.com/652-kombinacii.pdf";

function queryValue(req, key) {
  if (req.query && req.query[key] != null && req.query[key] !== "") {
    const value = req.query[key];
    return String(Array.isArray(value) ? value[0] : value);
  }
  try {
    return new URL(req.url, "https://svetnadecata.com").searchParams.get(key) || "";
  } catch (error) {
    return "";
  }
}

function sessionId(req) {
  const fromQuery = req.query && req.query.session_id;
  if (fromQuery) return String(fromQuery);
  try {
    return new URL(req.url, "https://svetnadecata.com").searchParams.get("session_id") || "";
  } catch (error) {
    return "";
  }
}

async function streamPdf(res) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return json(res, 503, { error: "PDF-от сè уште не е подготвен." });
  const upstream = await fetch(BLOB_URL, { headers: { Authorization: "Bearer " + token } });
  if (!upstream.ok || !upstream.body) return json(res, 502, { error: "PDF-от не може да се отвори. Пробај повторно." });
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=\"652-kombinacii.pdf\"");
  res.setHeader("Cache-Control", "private, no-store");
  const length = upstream.headers.get("content-length");
  if (length) res.setHeader("Content-Length", length);
  await pipeline(Readable.fromWeb(upstream.body), res);
}

async function shareDownload(res, token) {
  res.setHeader("Cache-Control", "private, no-store");
  const secret = process.env.PDF_SHARE_SECRET;
  if (!secret) return json(res, 503, { error: "PDF-от сè уште не е подготвен." });
  const verdict = verifyShareToken(secret, token, {
    now: Math.floor(Date.now() / 1000),
    revoked: process.env.PDF_SHARE_REVOKED
  });
  if (!verdict.ok) {
    const message = verdict.reason === "expired"
      ? "Линкот истече."
      : verdict.reason === "revoked"
        ? "Линкот е повлечен."
        : "Овој линк не важи.";
    return json(res, 403, { error: message });
  }
  try {
    await streamPdf(res);
  } catch (error) {
    if (!res.headersSent) return json(res, 502, { error: "PDF-от не може да се отвори. Пробај повторно." });
  }
}

async function codDownload(res, orderId, token) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!validOrderId(orderId) || !token) return json(res, 400, { error: "Нема нарачка за овој PDF." });
  const secret = process.env.PDF_LINK_SECRET;
  if (!secret) return json(res, 503, { error: "PDF-от сè уште не е подготвен." });
  if (!verifyCodToken(secret, orderId, token)) return json(res, 403, { error: "Овој линк не важи." });
  try {
    await streamPdf(res);
  } catch (error) {
    if (!res.headersSent) return json(res, 502, { error: "PDF-от не може да се отвори. Пробај повторно." });
  }
}

async function stripeDownload(req, res) {
  const id = sessionId(req);
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json(res, 400, { error: "Нема нарачка за овој PDF." });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return json(res, 503, { error: "PDF-от сè уште не е подготвен." });

  try {
    const session = await stripeRequest("checkout/sessions/" + id, null, "GET");
    const plan = isForeignSession(session) ? null : PLANS[session.metadata && session.metadata.plan] || null;
    const digital = plan && (plan.id === "pdf" || plan.id === "komplet");
    if (session.payment_status !== "paid" || !digital) {
      return json(res, 403, { error: "Овој PDF е достапен по платена нарачка за дигитална верзија." });
    }
    await streamPdf(res);
  } catch (error) {
    if (!res.headersSent) return json(res, 502, { error: "PDF-от не може да се отвори. Пробај повторно." });
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Методот не е дозволен." });
  const share = queryValue(req, "share");
  const order = queryValue(req, "order");
  const token = queryValue(req, "t");
  if (share) return shareDownload(res, share);
  if (order || token) return codDownload(res, order, token);
  return stripeDownload(req, res);
};
