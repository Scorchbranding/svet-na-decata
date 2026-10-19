// Catalog product for 652 комбинации. Sent explicitly so cost auto-fill keeps working now that
// Svet na decata also sells Мојата прва азбука (several catalog products in one business).
const SVET_PRODUCT_ID = "cmuejivr40005t45pzb9f7k6e";

async function pushAlekstonOrder(order) {
  const token = process.env.ALEKSTON_API_TOKEN;
  if (!token) return { ok: false, skipped: true };
  const base = (process.env.ALEKSTON_API_URL || "https://alekston-all-in-one-management.vercel.app").replace(/\/$/, "");
  const discountNote = order.discountPercent && order.fullPrice
    ? ("Попуст " + order.discountPercent + "% (" + order.fullPrice + " → " + order.price + ")")
    : "";
  const notes = [
    order.printer ? "Печатница: " + order.printer : "",
    order.notice,
    order.note,
    discountNote
  ].filter(Boolean).join("\n");
  // For 652: alekstonProductLabel must be the catalog variant ("Само PDF" / …) so cost auto-fill works.
  const paket = order.alekstonProductLabel || order.planName;
  const response = await fetch(base + "/api/v1/orders", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      productName: order.alekstonProductName || ("652 комбинации — " + order.planName),
      productId: order.productId || SVET_PRODUCT_ID,
      quantity: 1,
      unitPrice: order.price,
      totalRevenue: order.price,
      currency: "MKD",
      channel: "Website",
      customerName: order.name,
      customerPhone: order.phone || null,
      customerCity: order.city || null,
      status: order.paid ? "CONFIRMED" : "PENDING",
      notes: notes || null,
      externalId: order.externalId || null,
      landing: order.landing || null,
      utm_source: (order.landing && order.landing.utm_source) || null,
      utm_campaign: (order.landing && order.landing.utm_campaign) || null,
      customFields: {
        "Канал": "Website",
        "utm_source": (order.landing && order.landing.utm_source) || "",
        "utm_campaign": (order.landing && order.landing.utm_campaign) || "",
        "Име": order.name,
        "Име и презиме": order.name,
        "Телефон": order.phone || "",
        "Број": order.phone || "",
        "Е-пошта": order.email || "",
        "е-пошта": order.email || "",
        "Епошта": order.email || "",
        "епошта": order.email || "—",
        "Email": order.email || "",
        "Град": order.city || "",
        "Адреса": order.address || "",
        // Full product name for products without catalog variants (азбука, претплата);
        // 652 комбинации keeps the catalog variant label so the model cost match keeps working.
        "Пакет": paket,
        "Производ": paket,
        "Плаќање": order.paymentLabel || "",
        "Цена": String(order.price ?? ""),
        "Сума": String(order.price ?? ""),
        "сума": String(order.price ?? ""),
        "Вкупно": String(order.price ?? ""),
        "Износ": String(order.price ?? ""),
        "Количина": "1",
        "Забелешка": notes,
        ...(discountNote ? { "Попуст": discountNote } : {}),
        ...(order.printer ? { "Печатница": order.printer } : {}),
        ...(order.extraFields || {})
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
