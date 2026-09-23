const PLANS = {
  pdf: {
    id: "pdf",
    name: "Само PDF",
    stripeName: "652 комбинации — PDF",
    amount: 59900,
    price: 599,
    label: "599 ден.",
    physical: false
  },
  print: {
    id: "print",
    name: "Печатена верзија",
    stripeName: "652 комбинации — печатена верзија",
    amount: 99900,
    price: 999,
    label: "999 ден.",
    physical: true
  },
  komplet: {
    id: "komplet",
    name: "Дигитална + печатена",
    stripeName: "652 комбинации — PDF и печатена верзија",
    amount: 129900,
    price: 1299,
    label: "1.299 ден.",
    physical: true
  }
};

function json(res, code, payload) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 20000) reject(new Error("too-big"));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseOrder(body) {
  const plan = PLANS[body && body.plan];
  if (!plan) return { error: "Избери пакет." };
  const order = {
    plan: plan.id,
    planName: plan.name,
    label: plan.label,
    price: plan.price,
    name: clean(body.name, 80),
    phone: clean(body.phone, 30),
    email: clean(body.email, 120),
    city: clean(body.city, 60),
    address: clean(body.address, 160),
    note: clean(body.note, 500)
  };
  if (order.name.length < 3) return { error: "Напиши име и презиме." };
  if (order.phone.replace(/\D/g, "").length < 8) return { error: "Напиши телефон." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)) return { error: "Напиши исправна е-пошта." };
  if (plan.physical && (order.city.length < 2 || order.address.length < 4)) {
    return { error: "За печатената верзија ни треба град и адреса." };
  }
  if (body.company) return { error: "ignored", ignored: true };
  return { plan, order };
}

function allowedOrigin(origin) {
  if (!origin) return "";
  try {
    const url = new URL(origin);
    const host = url.hostname;
    const local = host === "localhost" || host === "127.0.0.1";
    const ours = host === "svetnadecata.com" || host === "www.svetnadecata.com" || host === "svet-na-decata.vercel.app" || host.endsWith(".vercel.app");
    if (url.protocol === "https:" && ours) return url.origin;
    if (url.protocol === "http:" && local) return url.origin;
  } catch (error) {
    return "";
  }
  return "";
}

function encodeForm(params) {
  return Object.keys(params).map((key) => {
    const value = String(params[key]);
    const token = "{CHECKOUT_SESSION_ID}";
    if (value.indexOf(token) !== -1) {
      const parts = value.split(token);
      return encodeURIComponent(key) + "=" + encodeURIComponent(parts[0]) + token + encodeURIComponent(parts[1] || "");
    }
    return encodeURIComponent(key) + "=" + encodeURIComponent(value);
  }).join("&");
}

async function stripeRequest(path, params, method) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    const error = new Error("missing-key");
    error.publicMessage = "Плаќањето со картичка сè уште не е вклучено.";
    throw error;
  }
  const response = await fetch("https://api.stripe.com/v1/" + path, {
    method: method || "POST",
    headers: {
      Authorization: "Bearer " + secret,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params ? encodeForm(params) : undefined
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error("stripe");
    error.publicMessage = (data.error && data.error.message) || "Stripe не ја прими уплатата.";
    throw error;
  }
  return data;
}

async function notifySeller(order) {
  const email = process.env.ORDER_EMAIL;
  if (!email || email.indexOf("@") < 0) return false;
  const response = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(email), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      _subject: "Нова нарачка: 652 комбинации — " + order.planName,
      _template: "table",
      _captcha: "false",
      _replyto: order.email,
      Пакет: order.planName,
      Цена: order.label,
      Плаќање: order.paymentLabel,
      Име: order.name,
      Телефон: order.phone,
      Епошта: order.email,
      Град: order.city || "—",
      Адреса: order.address || "—",
      Забелешка: order.note || "—",
      Напомена: order.notice || "—"
    })
  });
  return response.ok;
}

module.exports = {
  PLANS,
  json,
  readBody,
  parseOrder,
  allowedOrigin,
  stripeRequest,
  notifySeller
};
