// Daily COD PDF mail. Schedule: vercel.json crons → /api/cod-pdf-sync (currently "45 8 * * *", 08:45 UTC).
// Hobby can only run a daily cron; change that one string to reschedule.
// Dry-run unless COD_PDF_AUTOSEND=1. Auth: Authorization: Bearer CRON_SECRET.
const { json } = require("../lib/orders");
const { sendViaSmtp, deliveryPdfBody, DELIVERY_SUBJECT, DEFAULT_FROM } = require("../lib/email");
const { authorizedBearer } = require("../lib/pdf-tokens");
const {
  LOOKBACK_DAYS,
  maskEmail,
  selectCandidates,
  downloadLink,
  claimOrder,
  releaseClaim,
  alreadyClaimed
} = require("../lib/cod-pdf");

const PAGE_LIMIT = 100;
const MAX_PAGES = 30;
// One Hobby invocation is 60s. Leave the rest for the next day; the claim stops a double send.
const SEND_LIMIT = 40;

function codeError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  return error;
}

function blobStore(env) {
  const { put, del, head } = require("@vercel/blob");
  const token = env.BLOB_READ_WRITE_TOKEN;
  return {
    put: (pathname, body, options) => put(pathname, body, Object.assign({ token: token }, options)),
    del: (url) => del(url, { token: token }),
    head: (pathname) => head(pathname, { token: token })
  };
}

async function listOrders({ base, token, since, fetchImpl }) {
  const orders = [];
  let cursor = "";
  const root = String(base || "https://alekston-all-in-one-management.vercel.app").replace(/\/$/, "");
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(root + "/api/v1/orders");
    url.searchParams.set("source", "WEBSITE");
    url.searchParams.set("since", since);
    url.searchParams.set("envelope", "1");
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetchImpl(url, { headers: { Authorization: "Bearer " + token } });
    if (!response.ok) throw codeError(502, "alekston-" + response.status);
    const data = await response.json();
    const batch = Array.isArray(data) ? data : (data && data.orders) || [];
    for (const row of batch) orders.push(row);
    if (Array.isArray(data) || !data || !data.hasMore || !data.nextCursor) return { orders: orders, truncated: false };
    cursor = String(data.nextCursor);
  }
  return { orders: orders, truncated: true };
}

async function runCodPdfSync(options) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now instanceof Date ? options.now : new Date();
  const autosend = String(env.COD_PDF_AUTOSEND || "") === "1";
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86400000).toISOString();
  if (!env.ALEKSTON_API_TOKEN) throw codeError(503, "missing-alekston");
  const listed = await listOrders({
    base: env.ALEKSTON_API_URL,
    token: env.ALEKSTON_API_TOKEN,
    since: since,
    fetchImpl: fetchImpl
  });
  const ready = selectCandidates(listed.orders);

  if (!autosend) {
    const canCheck = Boolean(options.blob && env.BLOB_READ_WRITE_TOKEN);
    const orders = [];
    for (const row of ready) {
      if (canCheck && await alreadyClaimed(options.blob, row.id)) continue;
      orders.push({ id: row.id, email: maskEmail(row.email) });
    }
    return {
      dryRun: true,
      since: since,
      checked: listed.orders.length,
      truncated: listed.truncated,
      claimsChecked: canCheck,
      orders: orders
    };
  }

  if (!env.PDF_LINK_SECRET) throw codeError(503, "missing-link-secret");
  if (!env.BLOB_READ_WRITE_TOKEN || !options.blob) throw codeError(503, "missing-blob");
  if (!env.EMAIL_HOST || !env.EMAIL_USER || !env.EMAIL_PASSWORD) throw codeError(503, "missing-smtp");

  const sent = [];
  const failed = [];
  let skipped = 0;
  let remaining = 0;
  let attempts = 0;
  for (const row of ready) {
    if (await alreadyClaimed(options.blob, row.id)) {
      skipped += 1;
      continue;
    }
    if (attempts >= SEND_LIMIT) {
      remaining += 1;
      continue;
    }
    attempts += 1;
    let claim;
    try {
      claim = await claimOrder(options.blob, row.id, {
        orderId: row.id,
        claimedAt: now.toISOString(),
        email: maskEmail(row.email)
      });
    } catch (error) {
      failed.push({ id: row.id, email: maskEmail(row.email), error: "claim-failed" });
      continue;
    }
    if (!claim.claimed) {
      skipped += 1;
      continue;
    }
    try {
      const body = deliveryPdfBody({ name: row.name, downloadUrl: downloadLink(row.id, env.PDF_LINK_SECRET) });
      await options.send({
        from: DEFAULT_FROM,
        to: row.email,
        subject: DELIVERY_SUBJECT,
        text: body.text,
        html: body.html
      });
      sent.push({ id: row.id, email: maskEmail(row.email) });
    } catch (error) {
      let claimState = "stuck";
      try {
        await releaseClaim(options.blob, claim);
        claimState = "released";
      } catch (releaseError) {
        claimState = "stuck";
      }
      failed.push({ id: row.id, email: maskEmail(row.email), error: "send-failed", claim: claimState });
    }
  }
  return {
    dryRun: false,
    since: since,
    checked: listed.orders.length,
    truncated: listed.truncated,
    sent: sent,
    failed: failed,
    skipped: skipped,
    remaining: remaining
  };
}

async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return json(res, 405, { error: "method" });
  if (!authorizedBearer(req.headers && req.headers.authorization, process.env.CRON_SECRET)) {
    return json(res, 401, { error: "unauthorized" });
  }
  try {
    const result = await runCodPdfSync({
      env: process.env,
      fetchImpl: fetch,
      now: new Date(),
      blob: process.env.BLOB_READ_WRITE_TOKEN ? blobStore(process.env) : null,
      send: sendViaSmtp
    });
    console.log("cod-pdf-sync", {
      dryRun: result.dryRun,
      checked: result.checked,
      listed: result.dryRun ? result.orders.length : result.sent.length
    });
    return json(res, 200, result);
  } catch (error) {
    console.error("cod-pdf-sync", error && error.message);
    return json(res, error.statusCode || 502, { error: error.publicMessage || "sync-failed" });
  }
}

module.exports = handler;
module.exports.runCodPdfSync = runCodPdfSync;
module.exports.SEND_LIMIT = SEND_LIMIT;
module.exports.LOOKBACK_DAYS = LOOKBACK_DAYS;
