const { codToken } = require("./pdf-tokens");

const LOOKBACK_DAYS = 45;
const SITE = "https://svetnadecata.com";
const KOMPLET_PAKET = "Дигитална + печатена";

function norm(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().toLowerCase();
}

function customMap(order) {
  const cf = order && order.customFields;
  if (!cf || typeof cf !== "object" || Array.isArray(cf)) return {};
  return cf;
}

function validOrderId(id) {
  return /^[A-Za-z0-9_-]{8,80}$/.test(String(id || ""));
}

function claimPath(orderId) {
  return "cod-pdf/" + orderId + ".json";
}

function maskEmail(email) {
  const parts = String(email || "").split("@");
  const domain = parts[1];
  if (!domain) return "";
  const user = parts[0];
  return (user ? user[0] : "") + "***@" + domain;
}

function asEmail(value) {
  const text = String(value || "").trim();
  if (text.length > 120) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "";
  return text;
}

function isEmailLabel(key) {
  const n = norm(key);
  return n === "е-пошта" || n === "епошта" || n === "е пошта" || n === "email" || n === "e-mail" || n === "e-пошта";
}

// Alekston GET /orders returns `fields` (label → value, or a list of {label, fieldKey, value})
// and `customFields` (usually keyed by fieldKey). Check both, by label and by fieldKey.
function readField(order, labels) {
  const wanted = labels.map(norm);
  const cf = customMap(order);
  const fields = order && order.fields;
  function matches(key) {
    return wanted.indexOf(norm(key)) !== -1;
  }
  if (fields && !Array.isArray(fields) && typeof fields === "object") {
    for (const key of Object.keys(fields)) {
      if (matches(key) && String(fields[key] == null ? "" : fields[key]).trim()) return String(fields[key]).trim();
    }
  }
  const list = Array.isArray(fields) ? fields : [];
  for (const field of list) {
    if (!field || typeof field !== "object") continue;
    const label = field.label || field.name || "";
    const key = field.fieldKey || field.key || "";
    if (!matches(label) && !matches(key)) continue;
    const value = field.value != null ? field.value : (key && cf[key] != null ? cf[key] : cf[label]);
    if (value != null && String(value).trim()) return String(value).trim();
  }
  for (const key of Object.keys(cf)) {
    if (matches(key) && String(cf[key] == null ? "" : cf[key]).trim()) return String(cf[key]).trim();
  }
  return "";
}

function buyerEmail(order) {
  const cf = customMap(order);
  const fields = order && order.fields;
  const found = [];
  function push(value) {
    if (value != null) found.push(value);
  }
  if (fields && !Array.isArray(fields) && typeof fields === "object") {
    for (const key of Object.keys(fields)) {
      if (isEmailLabel(key)) push(fields[key]);
    }
  }
  const list = Array.isArray(fields) ? fields : [];
  for (const field of list) {
    if (!field || typeof field !== "object") continue;
    const label = field.label || field.name || "";
    const key = field.fieldKey || field.key || "";
    if (!isEmailLabel(label) && !isEmailLabel(key)) continue;
    if (field.value != null) push(field.value);
    else if (key && Object.prototype.hasOwnProperty.call(cf, key)) push(cf[key]);
    else if (label && Object.prototype.hasOwnProperty.call(cf, label)) push(cf[label]);
  }
  for (const key of Object.keys(cf)) {
    if (isEmailLabel(key)) push(cf[key]);
  }
  for (const value of found) {
    const email = asEmail(value);
    if (email) return email;
  }
  return "";
}

function buyerName(order) {
  const direct = String(order && order.customerName || "").replace(/\s+/g, " ").trim();
  if (direct) return direct.slice(0, 80);
  return readField(order, ["Име и презиме", "Име"]).slice(0, 80);
}

function isDoorPayment(order) {
  const pay = readField(order, ["Плаќање"]);
  if (pay) return norm(pay) === "на врата";
  const notes = String(order && order.notes || "");
  if (/stripe/i.test(notes)) return false;
  return /Плаќање на врата/.test(notes);
}

function planKind(order) {
  const product = String(order && order.productName || "");
  const paket = readField(order, ["Пакет", "Производ"]);
  const offer = readField(order, ["Понуда"]);
  const notes = String(order && order.notes || "");
  if (/азбука/i.test(product) || /азбука/i.test(paket)) return "";
  const isBf = /BF\s*999/i.test([product, paket, offer, notes].join("\n"));
  const isKomplet = norm(paket) === norm(KOMPLET_PAKET) || /652 комбинации — PDF \+ Печатена/.test(product);
  const looks652 = /652/.test(product) || /652/.test(notes) || norm(paket) === norm(KOMPLET_PAKET);
  if (!looks652) return "";
  if (isBf) return "bf";
  if (isKomplet) return "komplet";
  return "";
}

function elsStatus(order) {
  const cf = customMap(order);
  const raw = cf.__elsStatus != null && String(cf.__elsStatus).trim()
    ? cf.__elsStatus
    : readField(order, ["__elsStatus"]);
  return norm(raw);
}

function isCancelled(order) {
  if (order && order.cancelledAt) return true;
  const status = String(order && order.status || "").trim().toUpperCase();
  return status === "CANCELLED" || status === "CANCELED";
}

function isReturned(order) {
  if (elsStatus(order) === "вратена") return true;
  const status = norm(order && order.status);
  return status === "returned" || status === "вратена";
}

function isDelivered(order) {
  if (!order || isReturned(order) || isCancelled(order)) return false;
  const cf = customMap(order);
  if (String(cf.__courierDeliveredAt || "").trim()) return true;
  return elsStatus(order) === "испорачана";
}

function createdMs(order) {
  const t = Date.parse(order && (order.createdAt || order.orderedAt) || "");
  return Number.isNaN(t) ? 0 : t;
}

function classify(order) {
  const id = String(order && order.id || "");
  if (!validOrderId(id)) return { ok: false, reason: "id" };
  const plan = planKind(order);
  if (!plan) return { ok: false, reason: "plan" };
  if (!isDoorPayment(order)) return { ok: false, reason: "payment" };
  if (isCancelled(order)) return { ok: false, reason: "cancelled" };
  if (isReturned(order)) return { ok: false, reason: "returned" };
  if (!isDelivered(order)) return { ok: false, reason: "not-delivered" };
  const email = buyerEmail(order);
  if (!email) return { ok: false, reason: "email" };
  return { ok: true, id: id, plan: plan, email: email, name: buyerName(order), createdAt: createdMs(order) };
}

function selectCandidates(orders) {
  const ready = [];
  for (const order of orders || []) {
    const row = classify(order);
    if (row.ok) ready.push(row);
  }
  ready.sort((a, b) => a.createdAt - b.createdAt);
  return ready;
}

function downloadLink(orderId, secret) {
  const token = codToken(secret, orderId);
  return SITE + "/preuzmi.html?order=" + encodeURIComponent(orderId) + "&t=" + token;
}

function isExistsError(error) {
  if (!error) return false;
  const status = Number(error.status || error.statusCode || 0);
  if (status === 409) return true;
  const code = String(error.code || "").toLowerCase();
  if (code === "blob_already_exists" || code === "already_exists") return true;
  return String(error.message || "").toLowerCase().indexOf("already exists") !== -1;
}

// Claim with put({ allowOverwrite: false }). A lost race or an existing claim returns { claimed: false }.
async function claimOrder(store, orderId, record) {
  const pathname = claimPath(orderId);
  try {
    const created = await store.put(pathname, JSON.stringify(record), {
      access: "private",
      allowOverwrite: false,
      addRandomSuffix: false,
      contentType: "application/json"
    });
    return {
      claimed: true,
      pathname: pathname,
      url: created && created.url ? created.url : pathname,
      orderId: orderId
    };
  } catch (error) {
    if (isExistsError(error)) return { claimed: false, reason: "exists", orderId: orderId };
    if (store.head) {
      try {
        await store.head(pathname);
        return { claimed: false, reason: "exists", orderId: orderId };
      } catch (headError) {
        // Not stored, or the existence check itself failed. Surface the original put error.
      }
    }
    throw error;
  }
}

async function releaseClaim(store, claim) {
  const target = claim && claim.url ? claim.url : claimPath(claim && claim.orderId ? claim.orderId : claim);
  await store.del(target);
}

async function alreadyClaimed(store, orderId) {
  if (!store || typeof store.head !== "function") return false;
  try {
    await store.head(claimPath(orderId));
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  LOOKBACK_DAYS,
  SITE,
  claimPath,
  maskEmail,
  readField,
  buyerEmail,
  buyerName,
  isDoorPayment,
  planKind,
  elsStatus,
  isCancelled,
  isReturned,
  isDelivered,
  classify,
  selectCandidates,
  downloadLink,
  isExistsError,
  claimOrder,
  releaseClaim,
  alreadyClaimed,
  validOrderId
};
