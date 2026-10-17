(function () {
  var PAYMENT_LINK = document.documentElement.getAttribute("data-payment-link") || "";
  // Landing + ad tags travel with the Stripe session, so tracking survives in-app browsers / lost storage.
  function buyLanding() {
    var L = {};
    try { L = JSON.parse(localStorage.getItem("alk_landing_azbuka") || "{}") || {}; } catch (e) { L = {}; }
    var q = new URLSearchParams(location.search), hasUtm = false;
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"].forEach(function (k) { var v = q.get(k); if (v) { if (!hasUtm) { hasUtm = true; } L[k] = v.slice(0, 200); } });
    if (!L.path || hasUtm) L.path = location.pathname;
    L.host = location.hostname;
    return L;
  }
  function go(btn) {
    var errEl = document.getElementById("err-" + (btn.getAttribute("data-err") || "main"));
    var label = btn.innerHTML; btn.disabled = true; btn.innerHTML = "Се отвора безбедно плаќање…";
    if (window.fbq) try { fbq("track", "InitiateCheckout", { value: 490, currency: "MKD" }); } catch (e) {}
    fetch("/azbuka/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ landing: buyLanding() }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.url) { location.href = d.url; return; } throw new Error((d && d.error) || "Грешка"); })
      .catch(function (e) {
        if (PAYMENT_LINK) { location.href = PAYMENT_LINK; return; }
        btn.disabled = false; btn.innerHTML = label; if (errEl) errEl.textContent = e.message + " Обидете се повторно.";
      });
  }
  document.querySelectorAll("[data-buy]").forEach(function (b) { b.addEventListener("click", function (ev) { ev.preventDefault(); go(b); }); });
  if (/plakanje=otkazano/.test(location.search)) { var e = document.getElementById("err-buy"); if (e) e.textContent = "Плаќањето е откажано – ништо не е наплатено. Можете да пробате повторно."; }

  // Printed / combo: cash on delivery (order goes to Svet na decata: e-mail + Alekston)
  var PRICES = { print: 999, komplet: 1199 }, DELIVERY = 170;
  var form = document.getElementById("naracka"), ok = document.getElementById("cod-ok");
  if (!form) return;
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function plan() { var r = form.querySelector("input[name=plan]:checked"); return r ? r.value : "print"; }
  function sync() {
    var p = PRICES[plan()];
    document.getElementById("cod-sum").innerHTML = "Вкупно на врата: " + fmt(p) + " + " + DELIVERY + " ден достава = <b>" + fmt(p + DELIVERY) + " ден</b>";
    document.getElementById("email-hint").textContent = plan() === "komplet" ? "(за PDF-от)" : "(по избор)";
  }
  form.querySelectorAll("input[name=plan]").forEach(function (r) { r.addEventListener("change", sync); });
  document.querySelectorAll("[data-cod]").forEach(function (b) {
    b.addEventListener("click", function (ev) {
      ev.preventDefault();
      var r = form.querySelector("input[name=plan][value=" + b.getAttribute("data-cod") + "]"); if (r) r.checked = true;
      form.hidden = false; sync(); form.scrollIntoView({ behavior: "smooth", block: "start" });
      if (window.fbq) try { fbq("track", "InitiateCheckout", { value: PRICES[plan()], currency: "MKD" }); } catch (e) {}
    });
  });
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var err = document.getElementById("err-cod"), btn = form.querySelector("button[type=submit]"), label = btn.textContent;
    var f = form.elements, landing = {};
    try { landing = JSON.parse(localStorage.getItem("alk_landing_azbuka") || "{}") || {}; } catch (e) {}
    landing.orderPath = location.pathname;
    var body = { plan: plan(), name: f.name.value, phone: f.phone.value, city: f.city.value, address: f.address.value, email: f.email.value, note: f.note.value, hp_web: f.hp_web ? f.hp_web.value : "", landing: landing };
    err.textContent = ""; btn.disabled = true; btn.textContent = "Се испраќа…";
    fetch("/api/azbuka-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok || !d.ok) throw new Error(d.error || "Грешка"); return d; }); })
      .then(function (d) {
        if (window.fbq) try { fbq("track", "Purchase", { value: d.price, currency: "MKD", content_ids: ["mk-azbuka-" + body.plan], content_type: "product" }, { eventID: "azbuka-cod-" + Date.now() }); } catch (e) {}
        var sb = document.getElementById("sub-btn"); if (sb && body.email) sb.href += "&email=" + encodeURIComponent(body.email);
        form.hidden = true; ok.hidden = false; ok.scrollIntoView({ behavior: "smooth", block: "center" });
      })
      .catch(function (e) { btn.disabled = false; btn.textContent = label; err.textContent = e.message + " Обидете се повторно."; });
  });
})();
