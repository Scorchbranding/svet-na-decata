const { json, readBody, parseOrder, notifySeller } = require("../lib/orders");
const { pushAlekstonOrder } = require("../lib/alekston");
const { sendOrderConfirmation } = require("../lib/email");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Методот не е дозволен." });
  try {
    const body = await readBody(req);
    const parsed = parseOrder(body);
    if (parsed.error) return json(res, parsed.ignored ? 200 : 400, { error: parsed.error });
    if (parsed.plan.id === "pdf") {
      return json(res, 400, { error: "Дигиталната верзија се плаќа само со картичка." });
    }

    const notice = parsed.plan.id === "komplet"
      ? "Плаќање на врата. Дигиталната верзија се испраќа на е-пошта при подигнување на пратката."
      : "Плаќање на врата, при подигнување на пратката.";

    const payload = Object.assign({}, parsed.order, {
      paymentLabel: "На врата",
      notice: notice,
      paid: false
    });
    const sent = await notifySeller(payload);
    await sendOrderConfirmation(payload);
    const alekston = await pushAlekstonOrder(payload);
    if (!alekston.ok && !alekston.skipped) {
      return json(res, 502, { error: alekston.error || "Нарачката не се запиша во Alekston." });
    }
    if (!sent && !alekston.ok) {
      return json(res, 503, { error: "Нарачките на врата моментално не се примаат." });
    }
    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 502, { error: "Нарачката не помина. Пробај повторно." });
  }
};
