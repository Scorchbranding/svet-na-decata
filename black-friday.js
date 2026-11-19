(function () {
  var CONTENT_NAME = "652 комбинации — PDF + Печатена (BF 999)";
  var offer = null;
  var viewSent = false;
  var countTimer = null;

  function captureLanding() {
    try {
      var q = new URLSearchParams(location.search);
      var fresh = {
        host: location.hostname,
        path: "/black-friday",
        url: location.href.slice(0, 400)
      };
      var hasCampaign = false;
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"].forEach(function (key) {
        var value = q.get(key);
        if (value) {
          fresh[key] = value.slice(0, 200);
          hasCampaign = true;
        }
      });
      if (document.referrer) fresh.referrer = document.referrer.slice(0, 300);
      var prev = {};
      try { prev = JSON.parse(sessionStorage.getItem("svet_landing") || "{}") || {}; } catch (error) { prev = {}; }
      var stored = hasCampaign ? fresh : Object.assign({}, prev, fresh);
      if (!hasCampaign) {
        ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "referrer"].forEach(function (key) {
          if (prev[key] && !fresh[key]) stored[key] = prev[key];
        });
        if (prev.url && !hasCampaign) stored.url = fresh.url;
      }
      stored.host = location.hostname;
      stored.path = "/black-friday";
      stored.orderPath = "/black-friday";
      sessionStorage.setItem("svet_landing", JSON.stringify(stored));
    } catch (error) {}
  }

  function landingPayload() {
    var stored = {};
    try { stored = JSON.parse(sessionStorage.getItem("svet_landing") || "{}") || {}; } catch (error) { stored = {}; }
    var q = new URLSearchParams(location.search);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"].forEach(function (key) {
      var value = q.get(key);
      if (value) stored[key] = value.slice(0, 200);
    });
    stored.host = location.hostname;
    stored.path = "/black-friday";
    stored.orderPath = "/black-friday";
    stored.url = location.href.slice(0, 400);
    if (document.referrer && !stored.referrer) stored.referrer = document.referrer.slice(0, 300);
    return stored;
  }

  function regularHref() {
    return "/" + (location.search || "") + "#naracka";
  }

  function cookieValue(name) {
    try {
      var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
      return match ? decodeURIComponent(match[1]) : "";
    } catch (error) { return ""; }
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
    } catch (error) {}
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

  function productParams(selling) {
    if (selling) {
      return {
        content_name: CONTENT_NAME,
        content_ids: ["bf"],
        content_type: "product",
        value: offer && offer.price ? offer.price : 999,
        currency: "MKD"
      };
    }
    return {
      content_name: "652 комбинации — PDF + Печатена",
      content_ids: ["komplet"],
      content_type: "product",
      value: offer && offer.regularPrice ? offer.regularPrice : 1299,
      currency: "MKD"
    };
  }

  function setGroup(name, value) {
    document.querySelectorAll('[data-bf="' + name + '"]').forEach(function (el) {
      el.textContent = value;
    });
  }

  function unitLabel(n, one, other) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    return other;
  }

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function applyOffer(data) {
    offer = data;
    if (data.bannerText) setGroup("banner", data.bannerText);
    if (data.priceLabel) setGroup("price", data.priceLabel);
    if (data.regularLabel) setGroup("regular", data.regularLabel);
    if (data.deliveryLabel) setGroup("delivery", data.deliveryLabel);
    if (data.totalLabel) setGroup("total", data.totalLabel);
    if (data.discountLabel) setGroup("discount", data.discountLabel);
    if (data.deadlineText) setGroup("deadline", data.deadlineText);
    if (data.price != null) setGroup("amount", String(data.price));
    var barShip = document.querySelector(".mobile-bar .bf-sale");
    if (barShip && data.delivery != null && barShip.tagName !== "A") {
      barShip.textContent = "+ " + data.delivery + " достава";
    }
    document.querySelectorAll('[data-bf="cta"]').forEach(function (el) {
      var inBar = el.parentElement && el.parentElement.classList.contains("mobile-bar");
      if (data.selling) {
        el.textContent = inBar ? "Нарачај" : (data.ctaLabel || "Нарачај за 999 ден.");
        el.setAttribute("href", "#naracka");
      } else if (!el.classList.contains("bf-sale")) {
        el.href = regularHref();
        el.textContent = data.closedCta || "Кон редовната понуда";
      }
    });
    var submit = document.getElementById("submit-btn");
    if (submit && data.selling && data.ctaLabel) submit.textContent = data.ctaLabel;
    document.querySelectorAll(".bf-sale").forEach(function (el) {
      el.classList.toggle("hidden", !data.selling);
    });
    document.querySelectorAll(".bf-offer-closed").forEach(function (el) {
      el.classList.toggle("hidden", Boolean(data.selling));
    });
    if (!data.selling) {
      if (data.regularLabel) setGroup("price", data.regularLabel);
      setGroup("closed-title", data.closedTitle || "Понудата заврши.");
      setGroup("closed-copy", data.closedCopy || "");
      var href = regularHref();
      document.querySelectorAll('[data-bf="regular-link"]').forEach(function (el) {
        el.href = href;
        var inBar = el.parentElement && el.parentElement.classList.contains("mobile-bar");
        if (!inBar) el.textContent = data.closedCta || "Кон редовната понуда";
      });
    }
    startCountdown(data);
  }

  function startCountdown(data) {
    if (countTimer) clearInterval(countTimer);
    var root = document.getElementById("bf-countdown");
    var live = document.getElementById("bf-count-live");
    if (!root) return;
    if (!data.selling || !data.endsAtMs) {
      root.classList.add("hidden");
      if (live) live.textContent = "";
      return;
    }
    root.classList.remove("hidden");
    var receivedAt = Date.now();
    var serverNow = Number(data.serverNowMs) || receivedAt;
    var lastMinute = -1;
    function tick() {
      var now = serverNow + (Date.now() - receivedAt);
      var ms = data.endsAtMs - now;
      if (ms < 0) ms = 0;
      var total = Math.floor(ms / 1000);
      var days = Math.floor(total / 86400);
      var hours = Math.floor((total % 86400) / 3600);
      var minutes = Math.floor((total % 3600) / 60);
      var seconds = total % 60;
      var map = { days: days, hours: hours, minutes: minutes, seconds: seconds };
      Object.keys(map).forEach(function (key) {
        var node = root.querySelector('[data-unit="' + key + '"]');
        if (node) node.textContent = pad(map[key]);
      });
      var labels = {
        days: unitLabel(days, "ден", "дена"),
        hours: unitLabel(hours, "час", "часа"),
        minutes: unitLabel(minutes, "минута", "минути"),
        seconds: unitLabel(seconds, "секунда", "секунди")
      };
      Object.keys(labels).forEach(function (key) {
        var node = root.querySelector('[data-unit-label="' + key + '"]');
        if (node) node.textContent = labels[key];
      });
      if (live && minutes !== lastMinute) {
        lastMinute = minutes;
        live.textContent = "Уште " + days + " " + labels.days + ", " + hours + " " + labels.hours + " и " + minutes + " " + labels.minutes + ".";
      }
      if (ms === 0) {
        clearInterval(countTimer);
        applyOffer(Object.assign({}, data, {
          selling: false,
          phase: "ended",
          closedTitle: "Понудата заврши.",
          closedCopy: data.closedCopy || "Понудата за Black Friday заврши. Печатената книга + PDF сега е по редовна цена на почетната.",
          closedCta: data.closedCta || "Кон редовната понуда"
        }));
      }
    }
    tick();
    countTimer = setInterval(tick, 1000);
  }

  function showError(message) {
    var box = document.getElementById("form-error");
    if (!box) return;
    box.textContent = message;
    box.classList.toggle("hidden", !message);
    if (message) box.scrollIntoView({ block: "center" });
  }

  captureLanding();

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  var header = document.querySelector(".site-header");
  window.addEventListener("scroll", function () {
    if (header) header.classList.toggle("scrolled", window.scrollY > 8);
  }, { passive: true });

  fetch("/api/black-friday", { headers: { Accept: "application/json" } })
    .then(function (response) { return response.json(); })
    .then(function (data) {
      if (!data || typeof data.selling !== "boolean") throw new Error("offer");
      applyOffer(data);
      if (!viewSent) {
        viewSent = true;
        track("ViewContent", productParams(data.selling), "vc-bf-" + Date.now());
      }
    })
    .catch(function () {
      if (!viewSent) {
        viewSent = true;
        track("ViewContent", productParams(true), "vc-bf-" + Date.now());
      }
    });

  var form = document.getElementById("order-form");
  if (!form) return;

  form.addEventListener("input", function () { showError(""); });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    showError("");
    if (offer && offer.selling === false) {
      showError(offer.closedCopy || "Понудата за Black Friday не е активна.");
      return;
    }
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
    if (data.name.length < 3) return showError("Напиши име и презиме.");
    if (data.phone.replace(/\D/g, "").length < 8) return showError("Напиши телефон за да ја потврдиме нарачката.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return showError("Напиши е-пошта — на неа стигнува потврдата.");
    if (data.city.length < 2 || data.address.length < 4) return showError("За печатената верзија ни треба град и адреса.");

    var button = document.getElementById("submit-btn");
    var buttonLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Се испраќа...";

    var eventStamp = "bf-" + Date.now();
    var checkoutEventId = "ic-" + eventStamp;
    var params = productParams(true);
    track("InitiateCheckout", params, checkoutEventId);

    var payload = {
      plan: "bf",
      name: data.name,
      phone: data.phone,
      email: data.email,
      city: data.city,
      address: data.address,
      note: data.note,
      company: honey ? honey.value : "",
      origin: location.origin,
      eventId: "door-" + eventStamp,
      sourceUrl: location.href,
      landing: landingPayload()
    };

    fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) throw new Error(body.error || "Нарачката не помина.");
        return body;
      });
    }).then(function (body) {
      track("AddToCart", params, "atc-door-" + eventStamp);
      window.setTimeout(function () {
        var eventId = (body && body.eventId) || ("door-" + eventStamp);
        var purchase = productParams(true);
        if (body && body.price) purchase.value = body.price;
        track("Purchase", purchase, eventId);
        try {
          sessionStorage.setItem("order", JSON.stringify({
            id: "bf",
            name: "PDF + Печатена (BF 999)",
            price: body && body.price ? body.price : 999,
            label: body && body.label ? body.label : "999 ден.",
            buyer: data.name.split(" ")[0],
            pay: "door",
            eventId: eventId,
            back: "/black-friday" + (location.search || "")
          }));
          sessionStorage.setItem("purchaseSent", eventId);
        } catch (error) {}
        window.location.href = "/thanks.html";
      }, 300);
    }).catch(function (error) {
      button.disabled = false;
      button.textContent = buttonLabel;
      showError(error.message || "Нарачката не помина. Пробај повторно.");
    });
  });
})();
