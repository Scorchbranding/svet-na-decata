const { json, readBody, parseOrder, notifySeller } = require("../lib/orders");

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

    const sent = await notifySeller(Object.assign({}, parsed.order, {
      paymentLabel: "На врата",
      notice: notice
    }));
    if (!sent) {
      return json(res, 503, { error: "Нарачките на врата моментално не се примаат." });
    }
    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 502, { error: "Нарачката не помина. Пробај повторно." });
  }
};
