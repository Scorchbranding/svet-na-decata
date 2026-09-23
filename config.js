/**
 * pixelId — бројот од Meta Events Manager → Datasets / Pixels
 *
 * Stripe и нарачките не се тука. Во Vercel стави:
 * STRIPE_SECRET_KEY — тајниот клуч од Stripe
 * ORDER_EMAIL — е-пошта каде стигнуваат нарачките
 */
window.SITE = {
  pixelId: "940198738676816",
  orderEmail: "",
  contactPhone: "",
  currency: "MKD",
  brand: "Свет на децата",
  product: "652 комбинации"
};

window.firePixel = function (eventName, params, eventId) {
  params = params || {};
  var parts = [
    "id=" + encodeURIComponent(window.SITE.pixelId),
    "ev=" + encodeURIComponent(eventName),
    "dl=" + encodeURIComponent(location.href),
    "rl=" + encodeURIComponent(document.referrer || ""),
    "if=false",
    "ts=" + Date.now()
  ];
  if (eventId) parts.push("eid=" + encodeURIComponent(eventId));
  Object.keys(params).forEach(function (key) {
    var value = params[key];
    if (value == null || value === "") return;
    if (Object.prototype.toString.call(value) === "[object Array]") value = value.join(",");
    parts.push("cd[" + key + "]=" + encodeURIComponent(String(value)));
  });
  var img = new Image();
  img.src = "https://www.facebook.com/tr/?" + parts.join("&");
};
