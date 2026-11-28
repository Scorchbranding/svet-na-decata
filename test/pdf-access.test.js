const test = require("node:test");
const assert = require("node:assert");
const { Writable } = require("node:stream");
const {
  codToken,
  verifyCodToken,
  signShareToken,
  verifyShareToken
} = require("../lib/pdf-tokens");
const {
  buyerEmail,
  classify,
  claimOrder,
  releaseClaim,
  claimPath,
  downloadLink,
  maskEmail
} = require("../lib/cod-pdf");
const { deliveryPdfBody, DEFAULT_FROM, DELIVERY_SUBJECT } = require("../lib/email");

const SECRET = "link-secret";
const SHARE = "share-secret";
const NOW = 1_700_000_000;

function memoryBlob() {
  const files = new Map();
  const puts = [];
  return {
    files: files,
    puts: puts,
    async put(pathname, body, opts) {
      puts.push({ pathname: pathname, opts: opts });
      if (opts && opts.allowOverwrite === false && files.has(pathname)) {
        const error = new Error("The blob already exists");
        error.status = 409;
        throw error;
      }
      files.set(pathname, String(body));
      return { url: "https://example.private.blob.vercel-storage.com/" + pathname, pathname: pathname };
    },
    async del(target) {
      const path = String(target).replace(/^https?:\/\/[^/]+\//, "");
      files.delete(path);
    },
    async head(pathname) {
      if (!files.has(pathname)) {
        const error = new Error("The requested blob does not exist");
        throw error;
      }
      return { pathname: pathname };
    }
  };
}

function order(extra) {
  return Object.assign({
    id: "cmueorder0001komplet01",
    productName: "652 комбинации — PDF + Печатена",
    status: "PENDING",
    createdAt: "2026-11-01T10:00:00.000Z",
    customerName: "Ана Петровска",
    fields: { "Пакет": "Дигитална + печатена", "Плаќање": "На врата", "Е-пошта": "ana@example.com" },
    customFields: { __elsStatus: "испорачана", __courierDeliveredAt: "" }
  }, extra);
}

test("COD token signs and verifies, and rejects a tampered or foreign token", () => {
  const token = codToken(SECRET, "cmueorder0001komplet01");
  assert.strictEqual(token.length, 64);
  assert.strictEqual(verifyCodToken(SECRET, "cmueorder0001komplet01", token), true);
  assert.strictEqual(verifyCodToken("other", "cmueorder0001komplet01", token), false);
  assert.strictEqual(verifyCodToken(SECRET, "cmueorder0001komplet02", token), false);
  assert.strictEqual(verifyCodToken(SECRET, "cmueorder0001komplet01", token.slice(0, -1) + (token.endsWith("a") ? "b" : "a")), false);
  assert.strictEqual(verifyCodToken(SECRET, "cmueorder0001komplet01", "short"), false);
  assert.strictEqual(verifyCodToken(SECRET, "cmueorder0001komplet01", ""), false);
  assert.match(downloadLink("cmueorder0001komplet01", SECRET), /^https:\/\/svetnadecata\.com\/preuzmi\.html\?order=cmueorder0001komplet01&t=[a-f0-9]{64}$/);
});

test("share token carries id, label and expiry, and dies on expiry, revocation or a rotated secret", () => {
  const signed = signShareToken(SHARE, { id: "ab12cd34", label: "тетка Ана", exp: NOW + 3600 });
  assert.strictEqual(signed.token.includes("~"), true);
  const ok = verifyShareToken(SHARE, signed.token, { now: NOW, revoked: "" });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.id, "ab12cd34");
  assert.strictEqual(ok.label, "тетка Ана");
  assert.strictEqual(ok.exp, NOW + 3600);
  assert.strictEqual(verifyShareToken(SHARE, signed.token, { now: NOW + 3600, revoked: "" }).reason, "expired");
  assert.strictEqual(verifyShareToken(SHARE, signed.token, { now: NOW + 3599, revoked: "" }).ok, true);
  assert.strictEqual(verifyShareToken(SHARE, signed.token, { now: NOW, revoked: "other, ab12cd34" }).reason, "revoked");
  assert.strictEqual(verifyShareToken(SHARE, signed.token, { now: NOW, revoked: " ab12cd34 " }).reason, "revoked");
  assert.strictEqual(verifyShareToken("rotated-secret", signed.token, { now: NOW, revoked: "" }).reason, "bad-signature");
  const flipped = signed.token.slice(0, -1) + (signed.token.endsWith("a") ? "b" : "a");
  assert.strictEqual(verifyShareToken(SHARE, flipped, { now: NOW }).reason, "bad-signature");
  assert.strictEqual(verifyShareToken(SHARE, "not-a-token", { now: NOW }).reason, "malformed");
});

test("buyer email is read from fields or customFields, by label or fieldKey", () => {
  assert.strictEqual(buyerEmail(order()), "ana@example.com");
  assert.strictEqual(buyerEmail(order({
    fields: { "Пакет": "Дигитална + печатена" },
    customFields: { "Е-пошта": "door@example.com", __elsStatus: "испорачана" }
  })), "door@example.com");
  assert.strictEqual(buyerEmail(order({
    fields: [{ label: "Е-пошта", fieldKey: "w__f_mail" }],
    customFields: { w__f_mail: "key@example.com", __elsStatus: "испорачана" }
  })), "key@example.com");
  assert.strictEqual(buyerEmail(order({
    fields: [{ label: "Email", fieldKey: "w__f_mail", value: "—" }],
    customFields: { Email: "not-an-email", __elsStatus: "испорачана" }
  })), "");
  assert.strictEqual(maskEmail("ana@example.com"), "a***@example.com");
});

test("only delivered komplet or BF door orders qualify", () => {
  assert.strictEqual(classify(order()).plan, "komplet");
  assert.strictEqual(classify(order({
    productName: "652 комбинации — PDF + Печатена (BF 999)",
    fields: { "Пакет": "Дигитална + печатена", "Плаќање": "На врата", "Понуда": "BF 999", "Е-пошта": "bf@example.com" }
  })).plan, "bf");
  assert.strictEqual(classify(order({ customFields: { __elsStatus: "во транспорт" } })).reason, "not-delivered");
  assert.strictEqual(classify(order({ customFields: { __courierDeliveredAt: "2026-11-20T12:00:00.000Z", __elsStatus: "" } })).ok, true);
  assert.strictEqual(classify(order({ customFields: { __elsStatus: "вратена", __courierDeliveredAt: "2026-11-20" } })).reason, "returned");
  assert.strictEqual(classify(order({ status: "CANCELLED", cancelledAt: "2026-11-21T00:00:00.000Z" })).reason, "cancelled");
  assert.strictEqual(classify(order({
    productName: "652 комбинации — Печатена",
    fields: { "Пакет": "Печатена верзија", "Плаќање": "На врата", "Е-пошта": "ana@example.com" }
  })).reason, "plan");
  assert.strictEqual(classify(order({
    fields: { "Пакет": "Дигитална + печатена", "Плаќање": "Платено со Stripe", "Е-пошта": "ana@example.com" }
  })).reason, "payment");
  assert.strictEqual(classify(order({
    productName: "Мојата прва азбука — PDF + Печатена",
    fields: { "Пакет": "Мојата прва азбука — PDF + Печатена", "Плаќање": "На врата", "Е-пошта": "ana@example.com" }
  })).reason, "plan");
  assert.strictEqual(classify(order({ fields: { "Пакет": "Дигитална + печатена", "Плаќање": "На врата" } })).reason, "email");
});

test("a claim is written once with allowOverwrite false and released when asked", async () => {
  const store = memoryBlob();
  const first = await claimOrder(store, "cmueorder0001komplet01", { orderId: "cmueorder0001komplet01" });
  assert.strictEqual(first.claimed, true);
  assert.strictEqual(store.puts[0].opts.allowOverwrite, false);
  assert.strictEqual(store.puts[0].opts.addRandomSuffix, false);
  assert.strictEqual(store.files.has(claimPath("cmueorder0001komplet01")), true);
  const second = await claimOrder(store, "cmueorder0001komplet01", { orderId: "cmueorder0001komplet01" });
  assert.strictEqual(second.claimed, false);
  assert.strictEqual(second.reason, "exists");
  await releaseClaim(store, first);
  assert.strictEqual(store.files.size, 0);
  const third = await claimOrder(store, "cmueorder0001komplet01", { orderId: "cmueorder0001komplet01" });
  assert.strictEqual(third.claimed, true);
});

test("an unknown put error is 'exists' only when the blob is already there", async () => {
  const store = memoryBlob();
  store.put = async function () {
    throw new Error("Unknown error, please visit https://vercel.com/help.");
  };
  await assert.rejects(() => claimOrder(store, "cmueorder0001komplet01", {}), /Unknown error/);
  store.files.set(claimPath("cmueorder0001komplet01"), "{}");
  const dup = await claimOrder(store, "cmueorder0001komplet01", {});
  assert.strictEqual(dup.claimed, false);
  assert.strictEqual(dup.reason, "exists");
});

function alekstonFetch(rows) {
  return async function (url) {
    const href = String(url);
    assert.match(href, /\/api\/v1\/orders\?/);
    assert.match(href, /source=WEBSITE/);
    assert.match(href, /since=/);
    assert.match(href, /envelope=1/);
    return { ok: true, json: async function () { return { orders: rows, hasMore: false, nextCursor: null }; } };
  };
}

test("dry-run lists masked emails and sends nothing", async () => {
  const { runCodPdfSync } = require("../api/cod-pdf-sync");
  const store = memoryBlob();
  const sends = [];
  const result = await runCodPdfSync({
    env: { ALEKSTON_API_TOKEN: "atk", BLOB_READ_WRITE_TOKEN: "blob", COD_PDF_AUTOSEND: "" },
    fetchImpl: alekstonFetch([
      order(),
      order({ id: "cmueorder0002print0001", productName: "652 комбинации — Печатена", fields: { "Пакет": "Печатена верзија", "Плаќање": "На врата", "Е-пошта": "skip@example.com" } })
    ]),
    now: new Date("2026-11-28T08:45:00.000Z"),
    blob: store,
    send: async function (msg) { sends.push(msg); }
  });
  assert.strictEqual(result.dryRun, true);
  assert.deepStrictEqual(result.orders, [{ id: "cmueorder0001komplet01", email: "a***@example.com" }]);
  assert.strictEqual(sends.length, 0);
  assert.strictEqual(store.files.size, 0);
});

test("autosend claims, mails once, and a failed send releases the claim", async () => {
  const { runCodPdfSync } = require("../api/cod-pdf-sync");
  const env = {
    ALEKSTON_API_TOKEN: "atk",
    BLOB_READ_WRITE_TOKEN: "blob",
    PDF_LINK_SECRET: SECRET,
    COD_PDF_AUTOSEND: "1",
    EMAIL_HOST: "smtp.example",
    EMAIL_USER: "radost@svetnadecata.com",
    EMAIL_PASSWORD: "secret"
  };
  const rows = [order()];
  const store = memoryBlob();
  const sends = [];
  const sent = await runCodPdfSync({
    env: env,
    fetchImpl: alekstonFetch(rows),
    now: new Date("2026-11-28T08:45:00.000Z"),
    blob: store,
    send: async function (msg) { sends.push(msg); }
  });
  assert.strictEqual(sent.dryRun, false);
  assert.strictEqual(sent.sent.length, 1);
  assert.strictEqual(sent.sent[0].email, "a***@example.com");
  assert.strictEqual(sends[0].from, DEFAULT_FROM);
  assert.strictEqual(sends[0].to, "ana@example.com");
  assert.strictEqual(sends[0].subject, DELIVERY_SUBJECT);
  assert.match(sends[0].html, /Пратката за 652 комбинации е испорачана/);
  assert.match(sends[0].html, /Симни го PDF-от/);
  assert.match(sends[0].text, /preuzmi\.html\?order=cmueorder0001komplet01&t=[a-f0-9]{64}/);
  const body = deliveryPdfBody({ name: "Ана", downloadUrl: "https://svetnadecata.com/preuzmi.html?order=x&t=y" });
  assert.match(body.text, /Здраво Ана,/);
  assert.match(body.text, /Свет на децата/);

  const again = await runCodPdfSync({
    env: env,
    fetchImpl: alekstonFetch(rows),
    now: new Date("2026-11-29T08:45:00.000Z"),
    blob: store,
    send: async function () { throw new Error("should not send"); }
  });
  assert.strictEqual(again.sent.length, 0);
  assert.strictEqual(again.skipped, 1);

  await releaseClaim(store, { orderId: "cmueorder0001komplet01", url: "https://example.private.blob.vercel-storage.com/" + claimPath("cmueorder0001komplet01") });
  let fail = true;
  const broken = await runCodPdfSync({
    env: env,
    fetchImpl: alekstonFetch(rows),
    now: new Date("2026-11-30T08:45:00.000Z"),
    blob: store,
    send: async function () {
      if (fail) throw new Error("smtp down");
    }
  });
  assert.strictEqual(broken.failed[0].claim, "released");
  assert.strictEqual(store.files.size, 0);
  const retry = await runCodPdfSync({
    env: env,
    fetchImpl: alekstonFetch(rows),
    now: new Date("2026-12-01T08:45:00.000Z"),
    blob: store,
    send: async function () { return "ok"; }
  });
  assert.strictEqual(retry.sent.length, 1);
});

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name] = value; },
    end(payload) {
      this.body = payload;
      try { this.json = JSON.parse(payload); } catch (error) { this.json = null; }
    }
  };
}

function pdfResponse() {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("%PDF-1.4 test"));
      controller.close();
    }
  });
  return {
    ok: true,
    headers: { get: (name) => name === "content-length" ? "12" : null },
    body: stream
  };
}

function streamRes() {
  const chunks = [];
  const res = new Writable({
    write(chunk, enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    }
  });
  res.statusCode = 0;
  res.headers = {};
  res.headersSent = false;
  res.setHeader = function (name, value) {
    this.headers[name] = value;
    if (name === "Content-Type") this.headersSent = false;
  };
  res.getBody = function () { return Buffer.concat(chunks).toString("utf8"); };
  return res;
}

test("download accepts a COD token and a share token, and still checks Stripe for session_id", async () => {
  const handler = require("../api/download");
  const prev = global.fetch;
  const env = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    PDF_LINK_SECRET: process.env.PDF_LINK_SECRET,
    PDF_SHARE_SECRET: process.env.PDF_SHARE_SECRET,
    PDF_SHARE_REVOKED: process.env.PDF_SHARE_REVOKED
  };
  process.env.BLOB_READ_WRITE_TOKEN = "blob-token";
  process.env.PDF_LINK_SECRET = SECRET;
  process.env.PDF_SHARE_SECRET = SHARE;
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  delete process.env.PDF_SHARE_REVOKED;
  const calls = [];
  global.fetch = async function (url) {
    calls.push(String(url));
    if (String(url).indexOf("api.stripe.com") !== -1) {
      return { ok: true, json: async function () { return { payment_status: "unpaid", metadata: { plan: "pdf" } }; } };
    }
    return pdfResponse();
  };
  try {
    const unpaid = mockRes();
    await handler({ method: "GET", query: { session_id: "cs_test_abc" }, url: "/api/download?session_id=cs_test_abc" }, unpaid);
    assert.strictEqual(unpaid.statusCode, 403);
    assert.match(unpaid.json.error, /платена нарачка/);
    assert.ok(calls.some((url) => url.indexOf("checkout/sessions/cs_test_abc") !== -1));

    calls.length = 0;
    const bad = mockRes();
    await handler({ method: "GET", query: { order: "cmueorder0001komplet01", t: "ab" }, url: "/api/download?order=cmueorder0001komplet01&t=ab" }, bad);
    assert.strictEqual(bad.statusCode, 403);
    assert.strictEqual(calls.length, 0);

    const cod = streamRes();
    const token = codToken(SECRET, "cmueorder0001komplet01");
    await handler({ method: "GET", query: { order: "cmueorder0001komplet01", t: token }, url: "/api/download?order=cmueorder0001komplet01&t=" + token }, cod);
    assert.strictEqual(cod.statusCode, 200);
    assert.match(cod.headers["Content-Disposition"], /652-kombinacii\.pdf/);
    assert.strictEqual(cod.getBody(), "%PDF-1.4 test");
    assert.ok(calls.every((url) => url.indexOf("api.stripe.com") === -1));

    const signed = signShareToken(SHARE, { id: "shareid01", label: "тест", exp: Math.floor(Date.now() / 1000) + 60 });
    const share = streamRes();
    await handler({ method: "GET", query: { share: signed.token }, url: "/api/download?share=" + encodeURIComponent(signed.token) }, share);
    assert.strictEqual(share.statusCode, 200);

    const expired = signShareToken(SHARE, { id: "oldid0001", label: "стар", exp: NOW });
    const gone = mockRes();
    await handler({ method: "GET", query: { share: expired.token } }, gone);
    assert.strictEqual(gone.statusCode, 403);
    assert.strictEqual(gone.json.error, "Линкот истече.");

    process.env.PDF_SHARE_REVOKED = "shareid01";
    const revoked = mockRes();
    await handler({ method: "GET", query: { share: signed.token } }, revoked);
    assert.strictEqual(revoked.statusCode, 403);
    assert.strictEqual(revoked.json.error, "Линкот е повлечен.");
  } finally {
    global.fetch = prev;
    for (const key of Object.keys(env)) {
      if (env[key] == null) delete process.env[key];
      else process.env[key] = env[key];
    }
  }
});

test("pdf-link requires the admin secret and returns a canonical /pdf URL", async () => {
  const handler = require("../api/pdf-link");
  const prevAdmin = process.env.PDF_ADMIN_SECRET;
  const prevShare = process.env.PDF_SHARE_SECRET;
  process.env.PDF_ADMIN_SECRET = "admin-secret";
  process.env.PDF_SHARE_SECRET = SHARE;
  try {
    const denied = mockRes();
    await handler({ method: "POST", headers: { authorization: "Bearer nope" }, body: { label: "Ана", days: 3 } }, denied);
    assert.strictEqual(denied.statusCode, 401);
    const res = mockRes();
    await handler({ method: "POST", headers: { authorization: "Bearer admin-secret" }, body: { label: "Ана", days: 3 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.match(res.json.url, /^https:\/\/svetnadecata\.com\/pdf\/.+~.+$/);
    assert.strictEqual(res.json.path, "/pdf/" + res.json.token);
    const verdict = verifyShareToken(SHARE, res.json.token, { now: Math.floor(Date.now() / 1000), revoked: "" });
    assert.strictEqual(verdict.ok, true);
    assert.strictEqual(verdict.label, "Ана");
    const bad = mockRes();
    await handler({ method: "POST", headers: { authorization: "Bearer admin-secret" }, body: { label: "Ана", days: 0 } }, bad);
    assert.strictEqual(bad.statusCode, 400);
  } finally {
    if (prevAdmin == null) delete process.env.PDF_ADMIN_SECRET; else process.env.PDF_ADMIN_SECRET = prevAdmin;
    if (prevShare == null) delete process.env.PDF_SHARE_SECRET; else process.env.PDF_SHARE_SECRET = prevShare;
  }
});

test("already-sent orders do not consume the daily send limit", async () => {
  const { runCodPdfSync, SEND_LIMIT } = require("../api/cod-pdf-sync");
  const env = {
    ALEKSTON_API_TOKEN: "atk",
    BLOB_READ_WRITE_TOKEN: "blob",
    PDF_LINK_SECRET: SECRET,
    COD_PDF_AUTOSEND: "1",
    EMAIL_HOST: "smtp.example",
    EMAIL_USER: "radost@svetnadecata.com",
    EMAIL_PASSWORD: "secret"
  };
  const store = memoryBlob();
  const rows = [];
  for (let i = 0; i < SEND_LIMIT; i++) {
    const id = "cmueold" + String(i).padStart(4, "0") + "xxxx";
    rows.push(order({ id: id, createdAt: "2026-11-01T00:00:00.000Z" }));
    store.files.set(claimPath(id), "{}");
  }
  rows.push(order({
    id: "cmuenew0001komplet01",
    createdAt: "2026-11-20T00:00:00.000Z",
    fields: { "Пакет": "Дигитална + печатена", "Плаќање": "На врата", "Е-пошта": "new@example.com" }
  }));
  const sends = [];
  const result = await runCodPdfSync({
    env: env,
    fetchImpl: alekstonFetch(rows),
    now: new Date("2026-11-28T08:45:00.000Z"),
    blob: store,
    send: async function (msg) { sends.push(msg); }
  });
  assert.strictEqual(result.skipped, SEND_LIMIT);
  assert.strictEqual(result.remaining, 0);
  assert.deepStrictEqual(result.sent, [{ id: "cmuenew0001komplet01", email: "n***@example.com" }]);
  assert.strictEqual(sends.length, 1);
  assert.strictEqual(sends[0].to, "new@example.com");
});

test("cod cron rejects a missing bearer secret", async () => {
  const handler = require("../api/cod-pdf-sync");
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "cron-secret";
  try {
    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    assert.strictEqual(res.statusCode, 401);
    const ok = mockRes();
    const prevFetch = global.fetch;
    const prevAlek = process.env.ALEKSTON_API_TOKEN;
    delete process.env.ALEKSTON_API_TOKEN;
    global.fetch = async function () { throw new Error("should not list"); };
    try {
      await handler({ method: "GET", headers: { authorization: "Bearer cron-secret" } }, ok);
      assert.strictEqual(ok.statusCode, 503);
      assert.strictEqual(ok.json.error, "missing-alekston");
    } finally {
      global.fetch = prevFetch;
      if (prevAlek == null) delete process.env.ALEKSTON_API_TOKEN;
      else process.env.ALEKSTON_API_TOKEN = prevAlek;
    }
  } finally {
    if (prev == null) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prev;
  }
});
