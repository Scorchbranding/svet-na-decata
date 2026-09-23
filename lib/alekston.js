async function pushAlekstonOrder(order) {
  const token = process.env.ALEKSTON_API_TOKEN;
  if (!token) return { ok: false, skipped: true };
  const base = (process.env.ALEKSTON_API_URL || "https://alekston-all-in-one-management.vercel.app").replace(/\/$/, "");
  const notes = [order.notice, order.note].filter(Boolean).join("\n");
  const response = await fetch(base + "/api/v1/orders", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      productName: "652 комбинации — " + order.planName,
      quantity: 1,
      unitPrice: order.price,
      totalRevenue: order.price,
      currency: "MKD",
      customerName: order.name,
      customerPhone: order.phone || null,
      customerCity: order.city || null,
      status: order.paid ? "CONFIRMED" : "PENDING",
      notes: notes || null,
      externalId: order.externalId || null,
      customFields: {
        "Име": order.name,
        "Име и презиме": order.name,
        "Телефон": order.phone || "",
        "Број": order.phone || "",
        "Е-пошта": order.email || "",
        "е-пошта": order.email || "",
        "Епошта": order.email || "",
        "епошта": order.email || "",
        "Email": order.email || "",
        "Град": order.city || "",
        "Адреса": order.address || "",
        "Пакет": order.planName,
        "Производ": order.planName,
        "Плаќање": order.paymentLabel || "",
        "Цена": String(order.price ?? ""),
        "Сума": String(order.price ?? ""),
        "сума": String(order.price ?? ""),
        "Вкупно": String(order.price ?? ""),
        "Износ": String(order.price ?? ""),
        "Количина": "1",
        "Забелешка": notes
      }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: data.error || "Alekston не ја прими нарачката." };
  }
  return { ok: true, id: data.id || "" };
}

module.exports = { pushAlekstonOrder };
