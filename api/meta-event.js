// Browser → Conversions API bridge for deduplicated InitiateCheckout / Purchase (and other) events.
const { json, readBody } = require("../lib/orders");
const { sendMetaEvent, clientIp, userAgent } = require("../lib/meta");

const ALLOWED = {
  PageView: true,
  ViewContent: true,
  InitiateCheckout: true,
  AddToCart: true,
  Purchase: true
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Методот не е дозволен." });
  try {
    const body = await readBody(req);
    const eventName = String((body && body.eventName) || "").trim();
    const eventId = String((body && body.eventId) || "").trim().slice(0, 100);
    if (!ALLOWED[eventName] || !eventId) return json(res, 400, { error: "Невалиден настан." });

    const customData = (body && body.customData) || {};
    const result = await sendMetaEvent({
      eventName: eventName,
      eventId: eventId,
      sourceUrl: body.sourceUrl || "",
      email: body.email,
      phone: body.phone,
      fbp: body.fbp,
      fbc: body.fbc,
      clientIp: clientIp(req),
      userAgent: userAgent(req),
      customData: {
        content_name: customData.content_name,
        content_ids: customData.content_ids,
        content_type: customData.content_type || "product",
        value: customData.value,
        currency: customData.currency || "MKD"
      }
    });
    return json(res, 200, { ok: true, skipped: Boolean(result.skipped) });
  } catch (error) {
    return json(res, 200, { ok: false });
  }
};
