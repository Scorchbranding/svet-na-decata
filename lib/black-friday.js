// Black Friday window for the printed book + PDF bundle.
// This is the only place the dates and the 999 price live.
// Regular plans in lib/orders.js stay 599 / 999 / 1.299.
//
// startsAt and endsAt are clock times in Europe/Skopje, not UTC.
// Orders at `price` are accepted from startsAt through endsAt (inclusive).
// Set allowBeforeStart to false to refuse 999 orders before startsAt.
// The end is always enforced. After endsAt the page shows the regular offer.
const { denarLabel, cleanLanding } = require("./orders");

const OFFER = {
  planId: "bf",
  startsAt: "2026-11-24T00:00:00",
  endsAt: "2026-12-01T23:59:59",
  timeZone: "Europe/Skopje",
  price: 999,
  regularPrice: 1299,
  delivery: 170,
  // Preview and an early launch can take 999 orders before startsAt.
  // The public campaign still runs 24.11–01.12. Flip to false to wait for startsAt.
  allowBeforeStart: true,
  tag: "BF 999"
};

const PLAN_NAME = "PDF + Печатена (" + OFFER.tag + ")";
const PRODUCT_NAME = "652 комбинации — " + PLAN_NAME;
// Catalog variant on the 652 product. Cost auto-fill matches this exact label.
const CATALOG_VARIANT = "Дигитална + печатена";

let nowFn = function () { return new Date(); };

function setNow(fn) {
  nowFn = typeof fn === "function" ? fn : function () { return new Date(); };
}

function currentTime() {
  return nowFn();
}

function zonedTimeToUtc(localIso, timeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(String(localIso || ""));
  if (!match) throw new Error("Неисправен датум за Black Friday.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const bag = {};
  dtf.formatToParts(new Date(utcGuess)).forEach(function (part) {
    if (part.type !== "literal") bag[part.type] = part.value;
  });
  let zonedHour = Number(bag.hour);
  if (zonedHour === 24) zonedHour = 0;
  const asUtc = Date.UTC(Number(bag.year), Number(bag.month) - 1, Number(bag.day), zonedHour, Number(bag.minute), Number(bag.second));
  return new Date(utcGuess - (asUtc - utcGuess));
}

function bounds() {
  return {
    start: zonedTimeToUtc(OFFER.startsAt, OFFER.timeZone),
    end: zonedTimeToUtc(OFFER.endsAt, OFFER.timeZone)
  };
}

function phaseOf(now) {
  const when = now instanceof Date ? now : new Date(now);
  const window = bounds();
  const t = when.getTime();
  if (t > window.end.getTime()) return "ended";
  if (t < window.start.getTime()) return "early";
  return "active";
}

function isSelling(now) {
  const phase = phaseOf(now || currentTime());
  if (phase === "active") return true;
  if (phase === "early" && OFFER.allowBeforeStart) return true;
  return false;
}

function partsInSkopje(ms, options) {
  const bag = {};
  new Intl.DateTimeFormat("mk", Object.assign({
    timeZone: OFFER.timeZone,
    hourCycle: "h23"
  }, options)).formatToParts(new Date(ms)).forEach(function (part) {
    if (part.type !== "literal") bag[part.type] = part.value;
  });
  return bag;
}

function numericDate(ms) {
  const bag = {};
  new Intl.DateTimeFormat("en-GB", {
    timeZone: OFFER.timeZone,
    day: "2-digit",
    month: "2-digit"
  }).formatToParts(new Date(ms)).forEach(function (part) {
    if (part.type !== "literal") bag[part.type] = part.value;
  });
  return bag.day + "." + bag.month;
}

function longWhen(ms) {
  const bag = partsInSkopje(ms, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  return bag.day + " " + bag.month + " " + bag.year + ", во " + bag.hour + ":" + bag.minute;
}

function deadlineText(ms) {
  const bag = partsInSkopje(ms, {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  });
  return "Понудата важи до " + bag.day + " " + bag.month + ", " + bag.hour + ":" + bag.minute + ".";
}

function describeOffer(now) {
  const when = now instanceof Date ? now : currentTime();
  const window = bounds();
  const phase = phaseOf(when);
  const selling = phase === "active" || (phase === "early" && OFFER.allowBeforeStart);
  const total = OFFER.price + OFFER.delivery;
  let closedTitle = "";
  let closedCopy = "";
  if (!selling && phase === "ended") {
    closedTitle = "Понудата заврши.";
    closedCopy = "Понудата за Black Friday заврши на " + deadlineText(window.end.getTime()).replace("Понудата важи до ", "").replace(/\.$/, "") + ". Печатената книга + PDF сега е " + denarLabel(OFFER.regularPrice) + ", плус достава " + OFFER.delivery + " ден. На почетната можеш да нарачаш со картичка или на врата.";
  } else if (!selling) {
    closedTitle = "Понудата сè уште не е почната.";
    closedCopy = "Понудата започнува на " + longWhen(window.start.getTime()) + ", време во Скопје. Дотогаш печатената книга + PDF е " + denarLabel(OFFER.regularPrice) + ", плус достава " + OFFER.delivery + " ден.";
  }
  return {
    phase: phase,
    selling: selling,
    planId: OFFER.planId,
    tag: OFFER.tag,
    price: OFFER.price,
    regularPrice: OFFER.regularPrice,
    delivery: OFFER.delivery,
    discount: OFFER.regularPrice - OFFER.price,
    total: total,
    priceLabel: denarLabel(OFFER.price),
    regularLabel: denarLabel(OFFER.regularPrice),
    deliveryLabel: "+" + OFFER.delivery + " ден.",
    totalLabel: denarLabel(total),
    discountLabel: denarLabel(OFFER.regularPrice - OFFER.price),
    startsAt: OFFER.startsAt,
    endsAt: OFFER.endsAt,
    timeZone: OFFER.timeZone,
    startsAtMs: window.start.getTime(),
    endsAtMs: window.end.getTime(),
    serverNowMs: when.getTime(),
    allowBeforeStart: Boolean(OFFER.allowBeforeStart),
    bannerText: "Black Friday · " + numericDate(window.start.getTime()) + "–" + numericDate(window.end.getTime()),
    deadlineText: deadlineText(window.end.getTime()),
    ctaLabel: "Нарачај за " + denarLabel(OFFER.price),
    closedTitle: closedTitle,
    closedCopy: closedCopy,
    closedCta: "Кон редовната понуда"
  };
}

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function isBlackFridayPlan(plan) {
  return clean(plan, 40) === OFFER.planId;
}

function doorNotice() {
  return "Плаќање на врата. Достава +" + OFFER.delivery + " ден. Вкупно при подигнување: " + denarLabel(OFFER.price + OFFER.delivery) + " Дигиталната верзија се испраќа на е-пошта при подигнување на пратката, не веднаш.";
}

function closedError(now) {
  const info = describeOffer(now || currentTime());
  if (info.phase === "ended") {
    return "Понудата за Black Friday заврши. Печатената книга + PDF сега е " + info.regularLabel + ", плус достава " + OFFER.delivery + " ден.";
  }
  return info.closedCopy || "Понудата за Black Friday не е активна.";
}

function parseBlackFridayOrder(body, now) {
  const when = now instanceof Date ? now : currentTime();
  if (!isSelling(when)) return { error: closedError(when) };
  if (body && (clean(body.company, 80) || clean(body.hp_leave_blank, 80))) {
    return { error: "ignored", ignored: true };
  }
  const order = {
    plan: OFFER.planId,
    planName: PLAN_NAME,
    label: denarLabel(OFFER.price),
    price: OFFER.price,
    fullPrice: OFFER.regularPrice,
    name: clean(body && body.name, 80),
    phone: clean(body && body.phone, 30),
    email: clean(body && body.email, 120),
    city: clean(body && body.city, 60),
    address: clean(body && body.address, 160),
    note: ""
  };
  const userNote = clean(body && body.note, 450);
  order.note = userNote ? OFFER.tag + " — " + userNote : OFFER.tag;
  if (order.name.length < 3) return { error: "Напиши име и презиме." };
  if (order.phone.replace(/\D/g, "").length < 8) return { error: "Напиши телефон." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)) return { error: "Напиши исправна е-пошта." };
  if (order.city.length < 2 || order.address.length < 4) {
    return { error: "За печатената верзија ни треба град и адреса." };
  }
  order.landing = cleanLanding(body && body.landing);
  const plan = {
    id: OFFER.planId,
    name: PLAN_NAME,
    price: OFFER.price,
    amount: OFFER.price * 100,
    label: order.label,
    physical: true
  };
  return { plan: plan, order: order };
}

function sourceUrlFrom(raw) {
  const fallback = "https://svetnadecata.com/black-friday";
  if (!raw) return fallback;
  try {
    const url = new URL(String(raw));
    const host = url.hostname;
    const local = host === "localhost" || host === "127.0.0.1";
    const ours = host === "svetnadecata.com" || host === "www.svetnadecata.com" || host.endsWith(".vercel.app") || local;
    const path = (url.pathname || "/").replace(/\/index\.html$/, "").replace(/\.html$/, "").replace(/\/$/, "") || "/";
    const secure = url.protocol === "https:" || (url.protocol === "http:" && local);
    if (!secure || !ours || path !== "/black-friday") return fallback;
    return url.href.slice(0, 900);
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  OFFER,
  PLAN_NAME,
  PRODUCT_NAME,
  CATALOG_VARIANT,
  setNow,
  currentTime,
  zonedTimeToUtc,
  phaseOf,
  isSelling,
  describeOffer,
  isBlackFridayPlan,
  parseBlackFridayOrder,
  doorNotice,
  sourceUrlFrom
};
