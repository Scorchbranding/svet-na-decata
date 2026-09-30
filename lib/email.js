function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function confirmationBody(order) {
  const lines = [
    "Здраво " + (order.name || "") + ",",
    "",
    "Ја примивме нарачката за 652 комбинации.",
    "Пакет: " + order.planName,
    "Цена: " + order.label,
    "Плаќање: " + (order.paymentLabel || "")
  ];
  if (order.downloadUrl) {
    lines.push(
      "",
      "Линкот за симнување останува активен. Ако не го симнеш PDF-от веднаш, отвори го повторно:",
      order.downloadUrl
    );
  }
  if (order.notice) lines.push("", order.notice);
  lines.push("", "Свет на децата");
  const text = lines.join("\n");
  const html = [
    "<p>Здраво " + escapeHtml(order.name) + ",</p>",
    "<p>Ја примивме нарачката за 652 комбинации.</p>",
    "<p><strong>Пакет:</strong> " + escapeHtml(order.planName) + "<br>",
    "<strong>Цена:</strong> " + escapeHtml(order.label) + "<br>",
    "<strong>Плаќање:</strong> " + escapeHtml(order.paymentLabel) + "</p>"
  ];
  if (order.downloadUrl) {
    html.push(
      "<p>Линкот за симнување останува активен. Ако не го симнеш PDF-от веднаш, отвори го повторно:</p>",
      "<p><a href=\"" + escapeHtml(order.downloadUrl) + "\">Симни го PDF-от</a></p>"
    );
  }
  if (order.notice) html.push("<p>" + escapeHtml(order.notice) + "</p>");
  html.push("<p>Свет на децата</p>");
  return { text, html: html.join("") };
}

function openSmtp() {
  const tls = require("tls");
  const host = process.env.EMAIL_HOST || "smtpout.secureserver.net";
  const port = Number(process.env.EMAIL_PORT || 465);
  const socket = tls.connect({ host: host, port: port, servername: host });
  let buffer = "";
  const waiters = [];
  const pending = [];
  function pump() {
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (/^\d{3} /.test(line)) pending.push(line);
    }
    while (pending.length && waiters.length) {
      const line = pending.shift();
      const waiter = waiters.shift();
      const code = Number(line.slice(0, 3));
      if (code >= 400) waiter.reject(new Error(line));
      else waiter.resolve(line);
    }
  }
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    pump();
  });
  function read() {
    return new Promise((resolve, reject) => {
      waiters.push({ resolve: resolve, reject: reject });
      socket.once("error", reject);
      pump();
    });
  }
  function write(line) {
    socket.write(line + "\r\n");
  }
  return { socket: socket, read: read, write: write };
}

async function sendViaSmtp({ from, to, subject, text, html }) {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;
  const smtp = openSmtp();
  await new Promise((resolve, reject) => {
    smtp.socket.once("secureConnect", resolve);
    smtp.socket.once("error", reject);
  });
  await smtp.read();
  smtp.write("EHLO svetnadecata.com");
  await smtp.read();
  smtp.write("AUTH LOGIN");
  await smtp.read();
  smtp.write(Buffer.from(user).toString("base64"));
  await smtp.read();
  smtp.write(Buffer.from(pass).toString("base64"));
  await smtp.read();
  const fromAddress = (from.match(/<([^>]+)>/) || [null, from])[1];
  smtp.write("MAIL FROM:<" + fromAddress + ">");
  await smtp.read();
  smtp.write("RCPT TO:<" + to + ">");
  await smtp.read();
  smtp.write("DATA");
  await smtp.read();
  const encodedSubject = "=?UTF-8?B?" + Buffer.from(subject).toString("base64") + "?=";
  const payload = Buffer.from(html || text).toString("base64").replace(/(.{1,76})/g, "$1\r\n");
  const message = [
    "From: " + from,
    "To: " + to,
    "Subject: " + encodedSubject,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    payload
  ].join("\r\n").replace(/^\./gm, "..");
  smtp.socket.write(message + "\r\n.\r\n");
  await smtp.read();
  smtp.write("QUIT");
  smtp.socket.end();
}

async function sendOrderConfirmation(order) {
  const to = order && order.email;
  if (!to) return { ok: false, skipped: true };
  const from = process.env.ORDER_FROM || "Свет на децата <radost@svetnadecata.com>";
  const body = confirmationBody(order);
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    try {
      await sendViaSmtp({
        from: from,
        to: to,
        subject: "Потврда за нарачка — 652 комбинации",
        text: body.text,
        html: body.html
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || "Е-поштата не се испрати." };
    }
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: true };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: from,
      to: [to],
      subject: "Потврда за нарачка — 652 комбинации",
      text: body.text,
      html: body.html
    })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return { ok: false, error: (data && data.message) || "Е-поштата не се испрати." };
  }
  return { ok: true };
}

module.exports = { sendOrderConfirmation };
