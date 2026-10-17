// Uptime check for /azbuka (proxied landing). Vercel cron; emails ORDER_EMAIL on failure.
const { json } = require("../lib/orders");

const TARGET = process.env.AZBUKA_HEALTH_URL || "https://svetnadecata.com/azbuka";
const MUST_CONTAIN = ["data-buy", "data-cod", "940198738676816", "1.199"];

async function check() {
  const started = Date.now();
  const res = await fetch(TARGET, {
    redirect: "follow",
    headers: { "User-Agent": "svetnadecata-azbuka-health/1.0", Accept: "text/html" }
  });
  const text = await res.text();
  const missing = MUST_CONTAIN.filter((s) => !text.includes(s));
  return {
    ok: res.status === 200 && missing.length === 0,
    status: res.status,
    ms: Date.now() - started,
    bytes: text.length,
    missing,
    url: TARGET
  };
}

async function alertSeller(result) {
  const email = process.env.ORDER_EMAIL;
  if (!email || email.indexOf("@") < 0) return { sent: false, reason: "no-ORDER_EMAIL" };
  const subject = "ALERT: /azbuka is down or incomplete (" + result.status + ")";
  const body = {
    _subject: subject,
    _template: "table",
    _captcha: "false",
    URL: result.url,
    HTTP: String(result.status),
    Missing: (result.missing && result.missing.join(", ")) || "—",
    LatencyMs: String(result.ms),
    Note: "Ads still send traffic to /azbuka. Fix moja-prva-azbuka production or the svet-na-decata rewrite."
  };
  const response = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(email), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body)
  });
  return { sent: response.ok, status: response.status };
}

module.exports = async function handler(req, res) {
  // Cron + manual: allow GET. Optional ?key=CRON_SECRET when set.
  if (req.method !== "GET" && req.method !== "POST") return json(res, 405, { error: "method" });
  const secret = process.env.CRON_SECRET || process.env.AZBUKA_HEALTH_KEY || "";
  const auth = String(req.headers.authorization || "");
  const qkey = String((req.query && req.query.key) || "");
  if (secret && auth !== "Bearer " + secret && qkey !== secret) {
    return json(res, 401, { error: "unauthorized" });
  }
  try {
    const result = await check();
    let alert = null;
    if (!result.ok) alert = await alertSeller(result);
    return json(res, result.ok ? 200 : 503, Object.assign({ alert }, result));
  } catch (e) {
    const result = { ok: false, status: 0, error: String(e && e.message || e), url: TARGET, missing: MUST_CONTAIN, ms: 0 };
    const alert = await alertSeller(result);
    return json(res, 503, Object.assign({ alert }, result));
  }
};
