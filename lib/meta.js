const crypto = require("crypto");

const PIXEL_ID = process.env.META_PIXEL_ID || "940198738676816";

function sha256(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return undefined;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function accessToken() {
  return process.env.META_ACCESS_TOKEN || process.env.META_CAPI_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN || "";
}

/**
 * Send a Meta Conversions API event with the same event_id used by the browser pixel
 * so Meta can deduplicate. No-ops when META_ACCESS_TOKEN is missing.
 */
async function sendMetaEvent(opts) {
  const token = accessToken();
  if (!token) return { ok: false, skipped: true };
  const eventName = opts && opts.eventName;
  const eventId = opts && opts.eventId;
  if (!eventName || !eventId) return { ok: false, error: "missing event" };

  const customData = Object.assign({}, opts.customData || {});
  if (customData.value != null) customData.value = Number(customData.value);
  if (!customData.currency) customData.currency = "MKD";

  const userData = Object.assign({}, opts.userData || {});
  if (opts.email) userData.em = sha256(opts.email);
  if (opts.phone) {
    const digits = String(opts.phone).replace(/\D/g, "");
    if (digits) userData.ph = sha256(digits);
  }
  if (opts.clientIp) userData.client_ip_address = opts.clientIp;
  if (opts.userAgent) userData.client_user_agent = opts.userAgent;
  if (opts.fbp) userData.fbp = opts.fbp;
  if (opts.fbc) userData.fbc = opts.fbc;

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: String(eventId).slice(0, 100),
    action_source: "website",
    event_source_url: (opts.sourceUrl || "https://svetnadecata.com").slice(0, 900),
    user_data: userData,
    custom_data: customData
  };

  const body = { data: [event] };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;

  try {
    const url = "https://graph.facebook.com/v19.0/" + PIXEL_ID + "/events?access_token=" + encodeURIComponent(token);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("meta capi error", response.status, data);
      return { ok: false, error: (data.error && data.error.message) || "capi failed" };
    }
    return { ok: true, events_received: data.events_received };
  } catch (error) {
    console.error("meta capi exception", error && error.message);
    return { ok: false, error: "capi exception" };
  }
}

function clientIp(req) {
  const xf = (req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"])) || "";
  return String(xf).split(",")[0].trim().slice(0, 64);
}

function userAgent(req) {
  return String((req.headers && req.headers["user-agent"]) || "").slice(0, 512);
}

module.exports = { sendMetaEvent, PIXEL_ID, clientIp, userAgent, sha256 };
