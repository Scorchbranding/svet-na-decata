(function () {
  try {
    if (sessionStorage.getItem("svet_landing")) return;
    var q = new URLSearchParams(location.search), l = { host: location.hostname, path: location.pathname || "/", url: location.href.slice(0, 400) };
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"].forEach(function (k) { var v = q.get(k); if (v) l[k] = v.slice(0, 200); });
    if (document.referrer) l.referrer = document.referrer.slice(0, 300);
    sessionStorage.setItem("svet_landing", JSON.stringify(l));
  } catch (e) {}
})();
(function () {
  var DELIVERY = 170;
  var PLANS = {
    pdf: {
      id: "pdf",
      name: "PDF",
      price: 599,
      label: "599 ден.",
      copy: "Се плаќа само со картичка. По уплатата добиваш потврда и линк за симнување на е-пошта. Линкот останува активен."
    },
    print: {
      id: "print",
      name: "Печатена",
      price: 999,
      label: "999 ден.",
      copy: "Печатена верзија на квалитетна хартија. Достава 170 ден. Можеш да платиш со картичка или на врата."
    },
    komplet: {
      id: "komplet",
      name: "PDF + Печатена",
      price: 1299,
      label: "1.299 ден.",
      copy: "PDF и печатена верзија на квалитетна хартија. Достава на печатената е 170 ден. Со картичка добиваш потврда и линк за симнување на е-пошта. На врата, линкот стигнува кога ќе ја подигнеш пратката."
    }
  };

  var selected = "pdf";

  function fmt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function totalLabel(plan) {
    if (!needsAddress(plan.id)) return plan.label;
    return fmt(plan.price) + " + " + DELIVERY + " достава = " + fmt(plan.price + DELIVERY) + " ден.";
  }

  function cookieValue(name) {
    try {
      var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
      return m ? decodeURIComponent(m[1]) : "";
    } catch (e) { return ""; }
  }

  function sendCapi(eventName, params, eventId) {
    try {
      fetch("/api/meta-event", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          eventName: eventName,
          eventId: eventId,
          sourceUrl: location.href,
          fbp: cookieValue("_fbp"),
          fbc: cookieValue("_fbc"),
          customData: params
        }),
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }

  function track(eventName, params, eventId) {
    if (typeof fbq === "function") {
      if (eventId) fbq("track", eventName, params, { eventID: eventId });
      else fbq("track", eventName, params);
    }
    if (typeof window.firePixel === "function") window.firePixel(eventName, params, eventId);
    if (eventId && (eventName === "InitiateCheckout" || eventName === "Purchase" || eventName === "AddToCart" || eventName === "ViewContent")) {
      sendCapi(eventName, params, eventId);
    }
  }

  function planParams(plan) {
    return {
      content_name: "652 комбинации — " + plan.name,
      content_ids: [plan.id],
      content_type: "product",
      value: plan.price,
      currency: "MKD"
    };
  }

  function needsAddress(id) {
    return id === "print" || id === "komplet";
  }

  function applyPlan(id) {
    var plan = PLANS[id] || PLANS.pdf;
    var comingFromPdf = selected === "pdf" && plan.id !== "pdf";
    selected = plan.id;
    document.querySelectorAll(".plan").forEach(function (el) {
      el.setAttribute("aria-pressed", el.getAttribute("data-plan") === plan.id ? "true" : "false");
    });
    var name = document.getElementById("summary-name");
    var copy = document.getElementById("summary-copy");
    var planName = document.getElementById("summary-plan");
    var price = document.getElementById("summary-price");
    var extra = document.getElementById("summary-extra");
    var barPrice = document.getElementById("bar-price");
    var barName = document.getElementById("bar-name");
    var delivery = document.getElementById("delivery-fields");
    var payMethods = document.getElementById("pay-methods");
    var ship = needsAddress(plan.id);
    var total = totalLabel(plan);
    if (name) name.textContent = plan.name;
    if (copy) copy.textContent = plan.copy;
    if (planName) planName.textContent = plan.name;
    if (price) price.textContent = total;
    if (barPrice) barPrice.textContent = total;
    if (barName) barName.textContent = plan.name;
    if (extra) {
      extra.textContent = ship
        ? "Печатената верзија оди на адреса. Достава 170 ден. Може со картичка или на врата."
        : "Само картичка. Нема адреса и нема достава — линкот за PDF стигнува на е-пошта.";
    }
    if (delivery) delivery.classList.toggle("hidden", !ship);
    if (payMethods) payMethods.classList.toggle("hidden", !ship);
    var city = document.querySelector('[name="city"]');
    var addr = document.querySelector('[name="address"]');
    if (city) city.required = ship;
    if (addr) addr.required = ship;
    var barBtn = document.getElementById("bar-btn");
    if (barBtn) barBtn.setAttribute("data-plan", plan.id);
    if (comingFromPdf) {
      var doorInput = document.querySelector('#pay-door-option input');
      if (doorInput) doorInput.checked = true;
    }
    try { sessionStorage.setItem("selectedPlan", plan.id); } catch (error) {}
    updatePayUI();
  }

  function currentPay() {
    if (selected === "pdf") return "stripe";
    var input = document.querySelector('input[name="pay"]:checked');
    return input ? input.value : "stripe";
  }

  function updatePayUI() {
    var plan = PLANS[selected] || PLANS.pdf;
    var pay = currentPay();
    var door = document.getElementById("pay-door-option");
    var note = document.getElementById("pay-note");
    var foot = document.getElementById("form-foot");
    var submit = document.getElementById("submit-btn");
    var stripeRadio = document.querySelector('input[name="pay"][value="stripe"]');
    var total = totalLabel(plan);
    if (selected === "pdf" && stripeRadio) stripeRadio.checked = true;
    if (door) {
      door.classList.toggle("hidden", selected === "pdf");
      var doorInput = door.querySelector("input");
      if (doorInput) doorInput.disabled = selected === "pdf";
    }
    if (submit) {
      submit.textContent = pay === "stripe"
        ? "Плати со картичка · " + total
        : "Нарачај на врата · " + total;
    }
    if (foot) {
      foot.textContent = selected === "pdf"
        ? "По уплатата со картичка добиваш линк за симнување на е-пошта. Не е замена за совет од педијатар."
        : "Дигиталната верзија се плаќа само со картичка. Кај печатената верзија и комплетот можеш да одбереш и плаќање на врата. Не е замена за совет од педијатар.";
    }
    try { sessionStorage.setItem("selectedPay", pay); } catch (error) {}
    if (!note) return;
    if (selected === "pdf") {
      note.textContent = "Дигиталната верзија се плаќа само со картичка. По уплатата на е-пошта стигнува потврда и линк за симнување. Линкот останува активен.";
      return;
    }
    if (pay === "door" && selected === "komplet") {
      note.textContent = "При плаќање на врата, дигиталната верзија се испраќа на твојата е-пошта кога ќе ја подигнеш пратката.";
      return;
    }
    if (pay === "door") {
      note.textContent = "Плаќаш при подигнување на пратката. Доставата е 170 ден.";
      return;
    }
    if (selected === "komplet") {
      note.textContent = "Плаќаш сега со картичка. Кликни за да го симнеш PDF-от, или провери ја е-поштата. Доставата за печатената верзија е 170 ден.";
      return;
    }
    note.textContent = "Плаќаш сега со картичка. Печатената верзија ја праќаме на адреса. Доставата е 170 ден.";
  }

  function showError(message) {
    var box = document.getElementById("form-error");
    if (!box) return;
    box.textContent = message;
    box.classList.toggle("hidden", !message);
    if (message) box.scrollIntoView({ block: "center" });
  }

  function isLocal() {
    return location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:";
  }

  document.querySelectorAll("[data-plan]").forEach(function (el) {
    el.addEventListener("click", function () {
      applyPlan(el.getAttribute("data-plan"));
      if (el.classList.contains("plan")) {
        var target = document.getElementById("naracka");
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  var header = document.querySelector(".site-header");
  window.addEventListener("scroll", function () {
    if (header) header.classList.toggle("scrolled", window.scrollY > 8);
  }, { passive: true });

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  var banner = document.getElementById("setup-banner");
  var pixelReady = window.SITE && /^\d{5,}$/.test(String(window.SITE.pixelId || ""));
  if (banner && isLocal() && !pixelReady) {
    banner.classList.remove("hidden");
    banner.innerHTML = "Тест на компјутер: Pixel ID се внесува во <code>config.js</code>. Stripe клучот и е-поштата за нарачки се во Vercel.";
  }

  track("ViewContent", {
    content_name: "652 комбинации — PDF",
    content_type: "product",
    content_ids: ["pdf"],
    value: 599,
    currency: "MKD"
  }, "vc-svet-" + Date.now());

  document.querySelectorAll('input[name="pay"]').forEach(function (input) {
    input.addEventListener("change", updatePayUI);
  });

  var initialPlan = "pdf";
  var savedPay = "";
  if (location.search.indexOf("payment=cancel") !== -1) {
    try {
      var savedPlan = sessionStorage.getItem("selectedPlan");
      if (PLANS[savedPlan]) initialPlan = savedPlan;
      savedPay = sessionStorage.getItem("selectedPay") || "";
    } catch (error) {}
  }
  applyPlan(initialPlan);

  if (location.search.indexOf("payment=cancel") !== -1) {
    var savedRadio = savedPay && document.querySelector('input[name="pay"][value="' + savedPay + '"]');
    if (savedRadio && !savedRadio.disabled) {
      savedRadio.checked = true;
      updatePayUI();
    }
    showError("Плаќањето е откажано. Можеш да пробаш повторно.");
    var checkout = document.getElementById("naracka");
    if (checkout) checkout.scrollIntoView();
  }

  var form = document.getElementById("order-form");
  if (!form) return;

  form.addEventListener("input", function () {
    showError("");
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    showError("");
    var honey = form.querySelector('[name="hp_leave_blank"]');
    if (honey && honey.value) return;

    function field(name) {
      var input = form.querySelector('[name="' + name + '"]');
      return input ? input.value.trim() : "";
    }

    var data = {
      name: field("name"),
      phone: field("phone"),
      email: field("email"),
      city: field("city"),
      address: field("address"),
      note: field("note")
    };
    var plan = PLANS[selected];

    if (data.name.length < 3) return showError("Напиши име и презиме.");
    if (data.phone.replace(/\D/g, "").length < 8) return showError("Напиши телефон за да ја потврдиме нарачката.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return showError("Напиши е-пошта — на неа стигнува PDF-от и потврдата.");
    if (!needsAddress(plan.id)) {
      data.city = "";
      data.address = "";
      data.note = "";
    } else if (data.city.length < 2 || data.address.length < 4) {
      return showError("За печатената верзија ни треба град и адреса.");
    }

    var pay = currentPay();
    if (plan.id === "pdf" && pay !== "stripe") {
      return showError("Дигиталната верзија се плаќа само со картичка.");
    }

    var button = document.getElementById("submit-btn");
    var buttonLabel = button.textContent;
    button.disabled = true;
    button.textContent = pay === "stripe" ? "Се отвора плаќањето..." : "Се испраќа...";

    var eventStamp = plan.id + "-" + Date.now();
    var checkoutEventId = "ic-" + eventStamp;
    track("InitiateCheckout", planParams(plan), checkoutEventId);

    function finishDoor(paid) {
      var eventId = (paid && paid.eventId) || ("door-" + plan.id + "-" + Date.now());
      sessionStorage.removeItem("purchaseSent");
      var purchaseParams = planParams(plan);
      if (paid && paid.price) purchaseParams.value = paid.price;
      track("Purchase", purchaseParams, eventId);
      sessionStorage.setItem("order", JSON.stringify({
        id: plan.id,
        name: plan.name,
        price: paid && paid.price ? paid.price : plan.price,
        label: paid && paid.label ? paid.label : plan.label,
        buyer: data.name.split(" ")[0],
        pay: "door",
        eventId: eventId
      }));
      sessionStorage.setItem("purchaseSent", eventId);
      window.location.href = "thanks.html";
    }

    function fail(message) {
      button.disabled = false;
      button.textContent = buttonLabel;
      showError(message);
    }

    var payload = {
      plan: plan.id,
      name: data.name,
      phone: data.phone,
      email: data.email,
      city: data.city,
      address: data.address,
      note: data.note,
      code: field("code"),
      origin: location.origin,
      eventId: pay === "door" ? ("door-" + eventStamp) : checkoutEventId,
      landing: (function () {
        var l = {};
        try { l = JSON.parse(sessionStorage.getItem("svet_landing") || "{}") || {}; } catch (e) {}
        l.host = l.host || location.hostname;
        l.path = l.path || location.pathname || "/";
        l.orderPath = location.pathname || "/";
        return l;
      })()
    };

    var endpoint = pay === "stripe" ? "/api/checkout" : "/api/order";
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) throw new Error(body.error || "Нарачката не помина.");
        return body;
      });
    }).then(function (body) {
      if (pay === "stripe") {
        if (!body.url) throw new Error("Не добивме линк за плаќање.");
        track("AddToCart", planParams(plan), "atc-" + eventStamp);
        window.setTimeout(function () {
          window.location.href = body.url;
        }, 300);
        return;
      }
      track("AddToCart", planParams(plan), "atc-door-" + eventStamp);
      window.setTimeout(function () {
        finishDoor(body);
      }, 300);
    }).catch(function (error) {
      if (isLocal() && pay === "door") {
        finishDoor();
        return;
      }
      fail(error.message || "Нарачката не помина. Пробај повторно.");
    });
  });
})();
