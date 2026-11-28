// Owner-only: mint a private PDF share link. Authorization: Bearer PDF_ADMIN_SECRET.
// The token is HMAC-signed with PDF_SHARE_SECRET. Rotating that secret kills every share link.
// PDF_SHARE_REVOKED (comma-separated ids) kills individual links. The id is in the response.
const { json, readBody } = require("../lib/orders");
const { authorizedBearer, signShareToken } = require("../lib/pdf-tokens");

const MAX_DAYS = 3650;
const SITE = "https://svetnadecata.com";

function cleanLabel(value) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Методот не е дозволен." });
  res.setHeader("Cache-Control", "private, no-store");
  if (!process.env.PDF_ADMIN_SECRET || !process.env.PDF_SHARE_SECRET) {
    return json(res, 503, { error: "Линковите сè уште не се вклучени." });
  }
  if (!authorizedBearer(req.headers && req.headers.authorization, process.env.PDF_ADMIN_SECRET)) {
    return json(res, 401, { error: "Лозинката не е точна." });
  }
  try {
    const body = await readBody(req);
    const label = cleanLabel(body.label);
    const days = body.days;
    if (!label) return json(res, 400, { error: "Напиши ознака за линкот." });
    if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      return json(res, 400, { error: "Деновите треба да се цел број од 1 до " + MAX_DAYS + "." });
    }
    const exp = Math.floor(Date.now() / 1000) + days * 86400;
    const signed = signShareToken(process.env.PDF_SHARE_SECRET, { label: label, exp: exp });
    const path = "/pdf/" + signed.token;
    return json(res, 200, {
      ok: true,
      id: signed.id,
      label: signed.label,
      exp: signed.exp,
      days: days,
      token: signed.token,
      path: path,
      url: SITE + path
    });
  } catch (error) {
    return json(res, 400, { error: "Барањето не е исправно." });
  }
};
