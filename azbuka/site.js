(function () {
  var DELIVERY = 170;
  var PRICES = { print: 999, komplet: 1199 };

  function landingKeyGet() {
    try {
      var s = sessionStorage.getItem("alk_landing_azbuka");
      if (s) return s;
      return localStorage.getItem("alk_landing_azbuka") || "{}";
    } catch (e) { return "{}"; }
  }

  function landingKeySet(obj) {
    try {
      var raw = JSON.stringify(obj);
      sessionStorage.setItem("alk_landing_azbuka", raw);
    } catch (e) {}
  }

  function buyLanding() {
    var L = {};
    try { L = JSON.parse(landingKeyGet() || "{}") || {}; } catch (e) { L = {}; }
    var q = new URLSearchParams(location.search), hasUtm = false;
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"].forEach(function (k) {
      var v = q.get(k);
      if (v) { hasUtm = true; L[k] = v.slice(0, 200); }
    });
    if (!L.path || hasUtm) L.path = location.pathname;
    L.host = location.hostname;
    landingKeySet(L);
    return L;
  }

  function cookieValue(name) {
    try {
      var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
      return m ? decodeURIComponent(m[1]) : "";
    } catch (e) { return ""; }
  }

  function productParams(value, ids) {
    return {
      content_name: "Мојата прва азбука и бројки",
      content_ids: ids || ["mk-azbuka-brojki"],
      content_type: "product",
      value: value,
      currency: "MKD"
    };
  }

  function sendCapi(eventName, params, eventId, extra) {
    extra = extra || {};
    try {
      fetch("/api/meta-event", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          eventName: eventName,
          eventId: eventId,
          sourceUrl: location.href,
          email: extra.email || "",
          phone: extra.phone || "",
          fbp: cookieValue("_fbp"),
          fbc: cookieValue("_fbc"),
          customData: params
        }),
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }

  function track(eventName, params, eventId, extra) {
    if (window.fbq) {
      try {
        if (eventId) fbq("track", eventName, params, { eventID: eventId });
        else fbq("track", eventName, params);
      } catch (e) {}
    }
    if (eventId) sendCapi(eventName, params, eventId, extra);
  }

  // Persist UTMs into sessionStorage on load (also refreshed in buyLanding)
  buyLanding();

  function go(btn) {
    var errEl = document.getElementById("err-" + (btn.getAttribute("data-err") || "main"));
    var label = btn.innerHTML; btn.disabled = true; btn.innerHTML = "Се отвора безбедно плаќање…";
    var eventId = "ic-azbuka-pdf-" + Date.now();
    track("InitiateCheckout", productParams(490, ["mk-azbuka-pdf"]), eventId);
    // Local checkout tags metadata.site/product/plan so webhook + Alekston never treat this as 652.
    // No Payment Link fallback — that link had no metadata and never reached Alekston.
    fetch("/api/azbuka-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landing: buyLanding(), eventId: eventId, origin: location.origin })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.url) { location.href = d.url; return; } throw new Error((d && d.error) || "Грешка"); })
      .catch(function (e) {
        btn.disabled = false; btn.innerHTML = label; if (errEl) errEl.textContent = e.message + " Обидете се повторно.";
      });
  }
  document.querySelectorAll("[data-buy]").forEach(function (b) {
    b.addEventListener("click", function (ev) { ev.preventDefault(); go(b); });
  });
  if (/plakanje=otkazano/.test(location.search)) {
    var e = document.getElementById("err-buy");
    if (e) e.textContent = "Плаќањето е откажано – ништо не е наплатено. Можете да пробате повторно.";
  }

  var form = document.getElementById("naracka"), ok = document.getElementById("cod-ok");
  if (!form) return;

  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function plan() { var r = form.querySelector("input[name=plan]:checked"); return r ? r.value : "print"; }
  function sync() {
    var p = PRICES[plan()];
    var sum = document.getElementById("cod-sum");
    if (sum) sum.innerHTML = fmt(p) + " + " + DELIVERY + " достава = <b>" + fmt(p + DELIVERY) + " ден.</b>";
    var hint = document.getElementById("email-hint");
    if (hint) hint.textContent = plan() === "komplet" ? "(за PDF-от)" : "(по избор)";
  }
  form.querySelectorAll("input[name=plan]").forEach(function (r) { r.addEventListener("change", sync); });
  document.querySelectorAll("[data-cod]").forEach(function (b) {
    b.addEventListener("click", function (ev) {
      ev.preventDefault();
      var id = b.getAttribute("data-cod");
      var r = form.querySelector("input[name=plan][value=" + id + "]"); if (r) r.checked = true;
      form.hidden = false; sync(); form.scrollIntoView({ behavior: "smooth", block: "start" });
      var eventId = "ic-azbuka-" + id + "-" + Date.now();
      track("InitiateCheckout", productParams(PRICES[id], ["mk-azbuka-" + id]), eventId);
    });
  });
  sync();

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var err = document.getElementById("err-cod"), btn = form.querySelector("button[type=submit]"), label = btn.textContent;
    var f = form.elements, landing = buyLanding();
    landing.orderPath = location.pathname;
    var planId = plan();
    var eventId = "azbuka-cod-" + planId + "-" + Date.now();
    track("InitiateCheckout", productParams(PRICES[planId], ["mk-azbuka-" + planId]), "ic-" + eventId);
    var body = {
      plan: planId,
      name: f.name.value,
      phone: f.phone.value,
      city: f.city.value,
      address: f.address.value,
      email: f.email.value,
      note: f.note.value,
      hp_web: f.hp_web ? f.hp_web.value : "",
      landing: landing,
      eventId: eventId
    };
    err.textContent = ""; btn.disabled = true; btn.textContent = "Се испраќа…";
    fetch("/api/azbuka-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok || !d.ok) throw new Error(d.error || "Грешка"); return d; }); })
      .then(function (d) {
        var eid = d.eventId || eventId;
        track("Purchase", productParams(d.price, ["mk-azbuka-" + body.plan]), eid, { email: body.email, phone: body.phone });
        var sb = document.getElementById("sub-btn"); if (sb && body.email) sb.href += (sb.href.indexOf("?") >= 0 ? "&" : "?") + "email=" + encodeURIComponent(body.email);
        form.hidden = true; ok.hidden = false; ok.scrollIntoView({ behavior: "smooth", block: "center" });
      })
      .catch(function (e) { btn.disabled = false; btn.textContent = label; err.textContent = e.message + " Обидете се повторно."; });
  });
})();
