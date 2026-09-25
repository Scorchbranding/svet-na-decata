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

async function sendOrderConfirmation(order) {
  const key = process.env.RESEND_API_KEY;
  const to = order && order.email;
  if (!key || !to) return { ok: false, skipped: true };
  const from = process.env.ORDER_FROM || "Свет на децата <naracki@svetnadecata.com>";
  const body = confirmationBody(order);
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
