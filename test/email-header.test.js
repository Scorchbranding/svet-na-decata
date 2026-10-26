const test = require("node:test");
const assert = require("node:assert");
const { buildMessage, formatAddress, DEFAULT_FROM } = require("../lib/email");

function headers(msg) { return msg.split("\r\n\r\n")[0]; }

test("From header with Cyrillic name is RFC 2047 encoded and ASCII-only", () => {
  const msg = buildMessage({ from: DEFAULT_FROM, to: "a@yahoo.com", subject: "Потврда", html: "<p>Здраво</p>", msgId: "x@svetnadecata.com" });
  const h = headers(msg);
  assert.ok(/^[\x00-\x7f]*$/.test(h), "headers must be pure ASCII");
  const from = h.split("\r\n").find((l) => l.startsWith("From: "));
  assert.match(from, /^From: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <radost@svetnadecata\.com>$/);
  const word = from.match(/\?B\?([^?]+)\?=/)[1];
  assert.strictEqual(Buffer.from(word, "base64").toString("utf8"), "Свет на децата");
  assert.match(h, /\r\nSubject: =\?UTF-8\?B\?/);
  assert.match(h, /\r\nTo: <a@yahoo\.com>/);
});

test("ASCII and quoted / bare forms are normalised", () => {
  assert.strictEqual(formatAddress("Svet na decata <radost@svetnadecata.com>"), "\"Svet na decata\" <radost@svetnadecata.com>");
  assert.strictEqual(formatAddress("\"Svet na decata\" <radost@svetnadecata.com>"), "\"Svet na decata\" <radost@svetnadecata.com>");
  assert.strictEqual(formatAddress("radost@svetnadecata.com"), "<radost@svetnadecata.com>");
  assert.match(formatAddress("\"Свет на децата\" <radost@svetnadecata.com>"), /^=\?UTF-8\?B\?.+\?= <radost@svetnadecata\.com>$/);
});

test("admin resend builds azbuka mail with link, masks email", () => {
  const { buildResend, mask } = require("../api/admin-resend");
  const m = buildResend({ id: "cs_live_abc", payment_status: "paid", amount_total: 59900, metadata: { product: "mk-azbuka-brojki" }, customer_details: { email: "ana@yahoo.com", name: "Ана" } }, "Извинете");
  assert.strictEqual(m.link, "https://svetnadecata.com/azbuka/api/download?session_id=cs_live_abc");
  assert.ok(m.html.includes("Извинете"));
  assert.strictEqual(mask("ana@yahoo.com"), "a***@yahoo.com");
  assert.strictEqual(buildResend({ id: "cs_live_x", payment_status: "unpaid", metadata: {} }).error, "not-paid");
});
