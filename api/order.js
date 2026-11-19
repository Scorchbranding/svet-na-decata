const { json, readBody, parseOrder, notifySeller, ALEKSTON_VARIANTS } = require("../lib/orders");
const { pushAlekstonOrder } = require("../lib/alekston");
const { sendOrderConfirmation } = require("../lib/email");
const { sendMetaEvent, clientIp, userAgent } = require("../lib/meta");
const {
  parseBlackFridayOrder,
  isBlackFridayPlan,
  PRODUCT_NAME,
  CATALOG_VARIANT,
  doorNotice,
  sourceUrlFrom
} = require("../lib/black-friday");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Методот не е дозволен." });
  try {
    const body = await readBody(req);
    // plan "bf" is the Black Friday bundle only. pdf / print / komplet are unchanged.
    const bfOrder = isBlackFridayPlan(body && body.plan);
    const parsed = bfOrder ? parseBlackFridayOrder(body) : parseOrder(body);
    if (parsed.error) return json(res, parsed.ignored ? 200 : 400, { error: parsed.error });
    if (!bfOrder && parsed.plan.id === "pdf") {
      return json(res, 400, { error: "Дигиталната верзија се плаќа само со картичка." });
    }

    const notice = bfOrder
      ? doorNotice()
      : parsed.plan.id === "komplet"
        ? "Плаќање на врата. Дигиталната верзија се испраќа на е-пошта при подигнување на пратката."
        : "Плаќање на врата, при подигнување на пратката.";

    const eventId = String((body && body.eventId) || ("door-" + parsed.plan.id + "-" + Date.now())).slice(0, 100);
    const variant = bfOrder ? CATALOG_VARIANT : (ALEKSTON_VARIANTS[parsed.plan.id] || parsed.order.planName);
    const payload = Object.assign({}, parsed.order, {
      alekstonProductLabel: variant,
      alekstonProductName: bfOrder ? PRODUCT_NAME : ("652 комбинации — " + parsed.order.planName),
      paymentLabel: "На врата",
      notice: notice,
      paid: false,
      eventId: eventId
    });
    if (bfOrder) {
      payload.productTitle = "652 комбинации (BF 999)";
      payload.extraFields = { "Понуда": "BF 999", "Достава": "+170 ден." };
    }
    const sent = await notifySeller(payload);
    await sendOrderConfirmation(payload);
    const alekston = await pushAlekstonOrder(payload);
    await sendMetaEvent({
      eventName: "Purchase",
      eventId: eventId,
      sourceUrl: bfOrder ? sourceUrlFrom(body && body.sourceUrl) : "https://svetnadecata.com/",
      email: payload.email,
      phone: payload.phone,
      clientIp: clientIp(req),
      userAgent: userAgent(req),
      customData: {
        content_name: bfOrder ? PRODUCT_NAME : ("652 комбинации — " + payload.planName),
        content_ids: [payload.plan],
        content_type: "product",
        value: payload.price,
        currency: "MKD"
      }
    }).catch(function () {});
    if (!alekston.ok && !alekston.skipped) {
      return json(res, 502, { error: alekston.error || "Нарачката не се запиша во Alekston." });
    }
    if (!sent && !alekston.ok) {
      return json(res, 503, { error: "Нарачките на врата моментално не се примаат." });
    }
    return json(res, 200, { ok: true, price: payload.price, label: payload.label, eventId: eventId });
  } catch (error) {
    return json(res, 502, { error: "Нарачката не помина. Пробај повторно." });
  }
};
