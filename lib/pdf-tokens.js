const crypto = require("crypto");

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

// Per-order COD link: HMAC-SHA256(PDF_LINK_SECRET, "cod:" + orderId), hex.
function codToken(secret, orderId) {
  return crypto.createHmac("sha256", String(secret)).update("cod:" + String(orderId)).digest("hex");
}

function verifyCodToken(secret, orderId, token) {
  if (!secret || !orderId || !token) return false;
  if (!/^[a-f0-9]{64}$/.test(String(token))) return false;
  return safeEqual(codToken(secret, orderId), String(token));
}

// Share link: base64url(JSON {id, label, exp}) + "~" + base64url(HMAC).
// "~" is not in the base64url alphabet, so the token is one path segment without a file extension.
function signShareToken(secret, input) {
  const id = input && input.id ? String(input.id) : crypto.randomBytes(9).toString("base64url");
  const label = String(input && input.label || "").slice(0, 80);
  const exp = Number(input && input.exp);
  const payload = { id: id, label: label, exp: exp };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", String(secret)).update(body).digest("base64url");
  return { token: body + "~" + sig, id: id, label: label, exp: exp };
}

function revokedSet(raw) {
  return new Set(String(raw || "").split(",").map((part) => part.trim()).filter(Boolean));
}

function verifyShareToken(secret, token, options) {
  const now = options && options.now != null ? Number(options.now) : Math.floor(Date.now() / 1000);
  if (!secret || !token) return { ok: false, reason: "missing" };
  const parts = String(token).split("~");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const expected = crypto.createHmac("sha256", String(secret)).update(parts[0]).digest("base64url");
  if (!safeEqual(expected, parts[1])) return { ok: false, reason: "bad-signature" };
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch (error) {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || typeof payload.id !== "string" || !payload.id || !Number.isFinite(Number(payload.exp))) {
    return { ok: false, reason: "malformed" };
  }
  if (Number(payload.exp) <= now) return { ok: false, reason: "expired" };
  if (revokedSet(options && options.revoked).has(payload.id)) return { ok: false, reason: "revoked" };
  return { ok: true, id: payload.id, label: payload.label || "", exp: Number(payload.exp) };
}

function authorizedBearer(header, secret) {
  const expected = String(secret || "").trim();
  if (!expected) return false;
  const match = /^Bearer\s+(\S+)\s*$/.exec(String(header || ""));
  if (!match) return false;
  return safeEqual(match[1], expected);
}

module.exports = {
  safeEqual,
  codToken,
  verifyCodToken,
  signShareToken,
  verifyShareToken,
  revokedSet,
  authorizedBearer
};
