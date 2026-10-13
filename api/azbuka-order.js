// Cash-on-delivery orders for Мојата прва азбука (svetnadecata.com/azbuka). PDF-only is paid by card on the azbuka page.
// Reuses the Svet na decata flow: seller e-mail, buyer confirmation, Alekston order (Svet na decata business).
const { json, readBody, cleanLanding, notifySeller } = require("../lib/orders");
const { pushAlekstonOrder } = require("../lib/alekston");
const { sendOrderConfirmation } = require("../lib/email");

const DELIVERY = 170; // paid by the buyer to the courier; not revenue, not cost
const PLANS = {
  print: { id: "print", name: "Печатена", price: 999, label: "999 ден.", productId: "cmv747dh900037zord7rz1q52" },
  komplet: { id: "komplet", name: "Печатена + PDF", price: 1199, label: "1.199 ден.", productId: "cmv747dly00057zorshkhcc1e" }
};
const clean = (v, max) => String(v || "").replace(/\s+/g, " ").trim().slice(0, max);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Методот не е дозволен." });
  try {
    const body = await readBody(req);
    const plan = PLANS[body && body.plan];
    if (!plan) return json(res, 400, { error: "Избери печатена или комплет." });
    if (body.company) return json(res, 200, { error: "ignored" });
    const order = {
      plan: plan.id, planName: plan.name, label: plan.label, price: plan.price,
      name: clean(body.name, 80), phone: clean(body.phone, 30), email: clean(body.email, 120),
      city: clean(body.city, 60), address: clean(body.address, 160), note: clean(body.note, 500)
    };
    if (order.name.length < 3) return json(res, 400, { error: "Напиши име и презиме." });
    if (order.phone.replace(/\D/g, "").length < 8) return json(res, 400, { error: "Напиши телефон." });
    if (order.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)) return json(res, 400, { error: "Напиши исправна е-пошта." });
    if (plan.id === "komplet" && !order.email) return json(res, 400, { error: "За PDF-от ни треба е-пошта." });
    if (order.city.length < 2 || order.address.length < 4) return json(res, 400, { error: "Напиши град и адреса за доставата." });
    if (body.dryRun === true || body.dryRun === "1") return json(res, 200, { ok: true, dryRun: true, price: plan.price, label: plan.label });
    const payload = Object.assign(order, {
      productTitle: "Мојата прва азбука и бројки",
      alekstonProductName: "Мојата прва азбука — " + plan.name,
      productId: plan.productId,
      landing: cleanLanding(body.landing),
      paymentLabel: "На врата",
      notice: (plan.id === "komplet" ? "PDF-от се испраќа на е-пошта. " : "") +
        "Плаќање на врата: " + plan.label + " + " + DELIVERY + " ден. достава (ја плаќате на курирот).",
      paid: false
    });
    const sent = await notifySeller(payload);
    await sendOrderConfirmation(payload);
    const alekston = await pushAlekstonOrder(payload);
    if (!alekston.ok && !alekston.skipped) return json(res, 502, { error: alekston.error || "Нарачката не се запиша." });
    if (!sent && !alekston.ok) return json(res, 503, { error: "Нарачките на врата моментално не се примаат." });
    return json(res, 200, { ok: true, price: plan.price, label: plan.label });
  } catch (error) {
    return json(res, 502, { error: "Нарачката не помина. Пробај повторно." });
  }
};
