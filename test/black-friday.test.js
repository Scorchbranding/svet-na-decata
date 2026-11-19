const test = require("node:test");
const assert = require("node:assert");
const {
  OFFER,
  PRODUCT_NAME,
  CATALOG_VARIANT,
  setNow,
  describeOffer,
  parseBlackFridayOrder,
  doorNotice,
  sourceUrlFrom,
  isSelling
} = require("../lib/black-friday");
const { PLANS, parseOrder } = require("../lib/orders");

const INSIDE = new Date("2026-11-26T12:00:00Z");
const BEFORE = new Date("2026-11-23T22:59:59Z");
const AT_START = new Date("2026-11-23T23:00:00Z");
const AT_END = new Date("2026-12-01T22:59:59Z");
const AFTER = new Date("2026-12-01T23:00:00Z");

function buyer(extra) {
  return Object.assign({
    plan: "bf",
    name: "Ана Петровска",
    phone: "070123456",
    email: "ana@example.com",
    city: "Скопје",
    address: "Улица 12",
    note: "кат 2",
    landing: {
      host: "svetnadecata.com",
      path: "/black-friday",
      orderPath: "/black-friday",
      utm_source: "meta",
      utm_medium: "paid",
      utm_campaign: "bf2026",
      utm_content: "1"
    }
  }, extra || {});
}

test("regular plan prices stay untouched", () => {
  assert.strictEqual(PLANS.pdf.price, 599);
  assert.strictEqual(PLANS.print.price, 999);
  assert.strictEqual(PLANS.komplet.price, 1299);
  assert.strictEqual(PLANS.komplet.name, "PDF + Печатена");
});

test("window bounds in Europe/Skopje", () => {
  const saved = OFFER.allowBeforeStart;
  OFFER.allowBeforeStart = false;
  try {
    assert.strictEqual(describeOffer(BEFORE).phase, "early");
    assert.strictEqual(describeOffer(BEFORE).selling, false);
    assert.strictEqual(describeOffer(AT_START).phase, "active");
    assert.strictEqual(describeOffer(AT_START).selling, true);
    assert.strictEqual(describeOffer(INSIDE).phase, "active");
    assert.strictEqual(describeOffer(AT_END).phase, "active");
    assert.strictEqual(describeOffer(AT_END).selling, true);
    assert.strictEqual(describeOffer(AFTER).phase, "ended");
    assert.strictEqual(describeOffer(AFTER).selling, false);
    assert.strictEqual(isSelling(AFTER), false);
  } finally {
    OFFER.allowBeforeStart = saved;
  }
});

test("public copy and price come from the one config", () => {
  const info = describeOffer(INSIDE);
  assert.strictEqual(info.price, 999);
  assert.strictEqual(info.regularPrice, 1299);
  assert.strictEqual(info.delivery, 170);
  assert.strictEqual(info.total, 1169);
  assert.strictEqual(info.priceLabel, "999 ден.");
  assert.strictEqual(info.regularLabel, "1.299 ден.");
  assert.strictEqual(info.deliveryLabel, "+170 ден.");
  assert.strictEqual(info.totalLabel, "1.169 ден.");
  assert.strictEqual(info.discountLabel, "300 ден.");
  assert.strictEqual(info.bannerText, "Black Friday · 24.11–01.12");
  assert.strictEqual(info.deadlineText, "Понудата важи до 1 декември, 23:59.");
  assert.strictEqual(info.ctaLabel, "Нарачај за 999 ден.");
  assert.strictEqual(info.selling, true);
  assert.match(doorNotice(), /\+170 ден/);
  assert.match(doorNotice(), /1\.169 ден/);
  assert.match(doorNotice(), /не веднаш/);
  assert.doesNotMatch(doorNotice(), /PDF веднаш/);
});

test("before the start, allowBeforeStart decides whether 999 can be ordered", () => {
  const saved = OFFER.allowBeforeStart;
  try {
    OFFER.allowBeforeStart = true;
    assert.strictEqual(describeOffer(BEFORE).selling, true);
    assert.strictEqual(parseBlackFridayOrder(buyer(), BEFORE).order.price, 999);
    OFFER.allowBeforeStart = false;
    const closed = parseBlackFridayOrder(buyer(), BEFORE);
    assert.ok(closed.error);
    assert.match(closed.error, /24 ноември 2026/);
    assert.strictEqual(describeOffer(BEFORE).selling, false);
  } finally {
    OFFER.allowBeforeStart = saved;
  }
});

test("after the end, 999 is refused even if early orders are allowed", () => {
  const saved = OFFER.allowBeforeStart;
  OFFER.allowBeforeStart = true;
  try {
    const closed = parseBlackFridayOrder(buyer(), AFTER);
    assert.match(closed.error, /заврши/);
    assert.match(describeOffer(AFTER).closedCopy, /1\.299 ден/);
    assert.match(describeOffer(AFTER).closedCopy, /170 ден/);
  } finally {
    OFFER.allowBeforeStart = saved;
  }
});

test("bf order is priced at 999, tagged BF 999, and keeps the catalog variant", () => {
  const parsed = parseBlackFridayOrder(buyer({ price: 1, code: "HALF" }), INSIDE);
  assert.strictEqual(parsed.order.price, 999);
  assert.strictEqual(parsed.order.label, "999 ден.");
  assert.strictEqual(parsed.order.fullPrice, 1299);
  assert.strictEqual(parsed.order.planName, "PDF + Печатена (BF 999)");
  assert.strictEqual(parsed.order.note, "BF 999 — кат 2");
  assert.strictEqual(parsed.order.landing.utm_source, "meta");
  assert.strictEqual(parsed.order.landing.utm_campaign, "bf2026");
  assert.strictEqual(PRODUCT_NAME, "652 комбинации — PDF + Печатена (BF 999)");
  assert.strictEqual(CATALOG_VARIANT, "Дигитална + печатена");
  assert.strictEqual(parseBlackFridayOrder({ plan: "bf", company: "bot" }, INSIDE).ignored, true);
  assert.match(parseBlackFridayOrder(buyer({ email: "nope" }), INSIDE).error, /е-пошта/);
  assert.match(parseBlackFridayOrder(buyer({ address: "1" }), INSIDE).error, /адреса/);
});

test("checkout cannot sell plan bf, and komplet parsing stays 1299", () => {
  assert.strictEqual(parseOrder({ plan: "bf" }).error, "Избери пакет.");
  const komplet = parseOrder({
    plan: "komplet",
    name: "Ана Петровска",
    phone: "070123456",
    email: "ana@example.com",
    city: "Скопје",
    address: "Улица 12"
  });
  assert.strictEqual(komplet.order.price, 1299);
  assert.strictEqual(komplet.plan.amount, 129900);
});

test("source URL stays on the black friday page", () => {
  assert.strictEqual(sourceUrlFrom(""), "https://svetnadecata.com/black-friday");
  assert.strictEqual(
    sourceUrlFrom("https://svetnadecata.com/black-friday?utm_source=meta&utm_campaign=bf2026"),
    "https://svetnadecata.com/black-friday?utm_source=meta&utm_campaign=bf2026"
  );
  assert.strictEqual(sourceUrlFrom("https://evil.example/black-friday"), "https://svetnadecata.com/black-friday");
  assert.match(sourceUrlFrom("https://svet-na-decata-git-preview.vercel.app/black-friday?utm_content=1"), /vercel\.app\/black-friday/);
});

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(key, value) { this.headers[key] = value; },
    end(payload) {
      this.body = payload;
      try { this.json = JSON.parse(payload); } catch (error) { this.json = null; }
    }
  };
}

test("door order posts 999 to Alekston as BF 999 and fires Purchase", async () => {
  const savedNow = OFFER.allowBeforeStart;
  const prevFetch = global.fetch;
  const env = {
    ALEKSTON_API_TOKEN: process.env.ALEKSTON_API_TOKEN,
    ORDER_EMAIL: process.env.ORDER_EMAIL,
    META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_HOST: process.env.EMAIL_HOST
  };
  const calls = [];
  setNow(function () { return INSIDE; });
  process.env.ALEKSTON_API_TOKEN = "test-token";
  process.env.ORDER_EMAIL = "orders@example.com";
  process.env.META_ACCESS_TOKEN = "meta-test";
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_HOST;
  global.fetch = async function (url, opts) {
    calls.push({ url: String(url), body: opts && opts.body, headers: opts && opts.headers });
    return {
      ok: true,
      json: async function () { return { id: "ord_bf_test", events_received: 1 }; }
    };
  };
  try {
    const handler = require("../api/order");
    const res = mockRes();
    await handler({
      method: "POST",
      headers: { "user-agent": "test", "x-forwarded-for": "203.0.113.8" },
      body: buyer({
        eventId: "door-bf-test",
        sourceUrl: "https://svetnadecata.com/black-friday?utm_source=meta&utm_campaign=bf2026",
        price: 1299
      })
    }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.price, 999);
    assert.strictEqual(res.json.label, "999 ден.");
    assert.strictEqual(res.json.eventId, "door-bf-test");

    const alek = calls.find(function (call) { return call.url.indexOf("/api/v1/orders") !== -1; });
    assert.ok(alek, "alekston was called");
    const order = JSON.parse(alek.body);
    assert.strictEqual(order.unitPrice, 999);
    assert.strictEqual(order.totalRevenue, 999);
    assert.strictEqual(order.currency, "MKD");
    assert.strictEqual(order.status, "PENDING");
    assert.strictEqual(order.productName, PRODUCT_NAME);
    assert.strictEqual(order.customFields["Пакет"], CATALOG_VARIANT);
    assert.strictEqual(order.customFields["Производ"], CATALOG_VARIANT);
    assert.strictEqual(order.customFields["Понуда"], "BF 999");
    assert.strictEqual(order.customFields["Достава"], "+170 ден.");
    assert.strictEqual(order.customFields["Плаќање"], "На врата");
    assert.strictEqual(order.customFields["Цена"], "999");
    assert.match(order.notes, /BF 999/);
    assert.match(order.notes, /\+170 ден/);
    assert.match(order.notes, /не веднаш/);
    assert.strictEqual(order.utm_source, "meta");
    assert.strictEqual(order.utm_campaign, "bf2026");
    assert.strictEqual(order.landing.utm_content, "1");

    const mail = calls.find(function (call) { return call.url.indexOf("formsubmit.co") !== -1; });
    const seller = JSON.parse(mail.body);
    assert.match(seller._subject, /BF 999/);
    assert.strictEqual(seller["Цена"], "999 ден.");
    assert.match(seller["Забелешка"], /BF 999/);

    const meta = calls.find(function (call) { return call.url.indexOf("graph.facebook.com") !== -1; });
    const event = JSON.parse(meta.body).data[0];
    assert.strictEqual(event.event_name, "Purchase");
    assert.strictEqual(event.event_id, "door-bf-test");
    assert.strictEqual(event.custom_data.value, 999);
    assert.strictEqual(event.custom_data.currency, "MKD");
    assert.deepStrictEqual(event.custom_data.content_ids, ["bf"]);
    assert.strictEqual(event.custom_data.content_name, PRODUCT_NAME);
    assert.match(event.event_source_url, /\/black-friday\?utm_source=meta/);
  } finally {
    setNow(null);
    OFFER.allowBeforeStart = savedNow;
    global.fetch = prevFetch;
    Object.keys(env).forEach(function (key) {
      if (env[key] == null) delete process.env[key];
      else process.env[key] = env[key];
    });
  }
});

test("regular komplet door order is still 1299 without a BF tag", async () => {
  const prevFetch = global.fetch;
  const envToken = process.env.ALEKSTON_API_TOKEN;
  const envMail = process.env.ORDER_EMAIL;
  const envMeta = process.env.META_ACCESS_TOKEN;
  const calls = [];
  process.env.ALEKSTON_API_TOKEN = "test-token";
  process.env.ORDER_EMAIL = "orders@example.com";
  process.env.META_ACCESS_TOKEN = "meta-test";
  global.fetch = async function (url, opts) {
    calls.push({ url: String(url), body: opts && opts.body });
    return { ok: true, json: async function () { return { id: "ord_reg", events_received: 1 }; } };
  };
  try {
    const handler = require("../api/order");
    const res = mockRes();
    await handler({
      method: "POST",
      headers: {},
      body: {
        plan: "komplet",
        name: "Ана Петровска",
        phone: "070123456",
        email: "ana@example.com",
        city: "Скопје",
        address: "Улица 12"
      }
    }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.json.price, 1299);
    const order = JSON.parse(calls.find(function (call) { return call.url.indexOf("/api/v1/orders") !== -1; }).body);
    assert.strictEqual(order.unitPrice, 1299);
    assert.strictEqual(order.productName, "652 комбинации — PDF + Печатена");
    assert.strictEqual(order.customFields["Пакет"], "Дигитална + печатена");
    assert.strictEqual(order.customFields["Понуда"], undefined);
    assert.doesNotMatch(order.notes || "", /BF 999/);
    const event = JSON.parse(calls.find(function (call) { return call.url.indexOf("graph.facebook.com") !== -1; }).body).data[0];
    assert.strictEqual(event.custom_data.value, 1299);
    assert.strictEqual(event.event_source_url, "https://svetnadecata.com/");
  } finally {
    global.fetch = prevFetch;
    if (envToken == null) delete process.env.ALEKSTON_API_TOKEN; else process.env.ALEKSTON_API_TOKEN = envToken;
    if (envMail == null) delete process.env.ORDER_EMAIL; else process.env.ORDER_EMAIL = envMail;
    if (envMeta == null) delete process.env.META_ACCESS_TOKEN; else process.env.META_ACCESS_TOKEN = envMeta;
  }
});

test("offer endpoint does not cache and reports the live window", async () => {
  setNow(function () { return INSIDE; });
  try {
    const handler = require("../api/black-friday");
    const res = mockRes();
    await handler({ method: "GET" }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers["Cache-Control"], "no-store");
    assert.strictEqual(res.json.selling, true);
    assert.strictEqual(res.json.price, 999);
    assert.strictEqual(res.json.delivery, 170);
    assert.strictEqual(res.json.deadlineText, "Понудата важи до 1 декември, 23:59.");
  } finally {
    setNow(null);
  }
});

test("page copy does not invent an instant PDF or the wrong verb", () => {
  const fs = require("node:fs");
  const html = fs.readFileSync(require("node:path").join(__dirname, "../black-friday/index.html"), "utf8");
  assert.doesNotMatch(html, /сготви/);
  assert.match(html, /зготвиш/);
  assert.doesNotMatch(html, /PDF веднаш/);
  assert.match(html, /не веднаш/);
  assert.match(html, /\+170/);
  assert.match(html, /999/);
  assert.match(html, /1\.299/);
  assert.match(html, /940198738676816/);
});
