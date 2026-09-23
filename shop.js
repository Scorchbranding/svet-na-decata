(function () {
  var PLANS = {
    pdf: {
      id: "pdf",
      name: "Само PDF",
      price: 599,
      label: "599 ден.",
      copy: "Се плаќа само со картичка. PDF стигнува на е-пошта по уплатата."
    },
    print: {
      id: "print",
      name: "Печатена верзија",
      price: 999,
      label: "999 ден.",
      copy: "Печатена верзија на квалитетна хартија. Ја праќаме на адреса. Можеш да платиш со картичка или на врата."
    },
    komplet: {
      id: "komplet",
      name: "Дигитална + печатена",
      price: 1299,
      label: "1.299 ден.",
      copy: "PDF и печатена верзија на квалитетна хартија. Со картичка PDF-от стигнува по уплатата. На врата, PDF-от стигнува кога ќе ја подигнеш пратката."
    }
  };

  var selected = "komplet";
  var checkoutTracked = false;

  function track(eventName, params, eventId) {
    if (typeof fbq === "function") {
      if (eventId) fbq("track", eventName, params, { eventID: eventId });
      else fbq("track", eventName, params);
    }
    if (typeof window.firePixel === "function") window.firePixel(eventName, params, eventId);
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

  function applyPlan(id, fromClick) {
    var plan = PLANS[id] || PLANS.komplet;
    selected = plan.id;
    document.querySelectorAll(".plan").forEach(function (el) {
      el.setAttribute("aria-pressed", el.getAttribute("data-plan") === plan.id ? "true" : "false");
    });
    var name = document.getElementById("summary-name");
    var copy = document.getElementById("summary-copy");
    var planName = document.getElementById("summary-plan");
    var price = document.getElementById("summary-price");
    var submit = document.getElementById("submit-btn");
    var address = document.getElementById("address-fields");
    var barPrice = document.getElementById("bar-price");
    var barName = document.getElementById("bar-name");
    if (name) name.textContent = plan.name;
    if (copy) copy.textContent = plan.copy;
    if (planName) planName.textContent = plan.name;
    if (price) price.textContent = plan.label;
    if (submit) submit.textContent = "Нарачај за " + plan.label;
    if (barPrice) barPrice.textContent = plan.label;
    if (barName) barName.textContent = plan.name;
    if (address) address.classList.toggle("hidden", !needsAddress(plan.id));
    var city = document.querySelector('[name="city"]');
    var addr = document.querySelector('[name="address"]');
    if (city) city.required = needsAddress(plan.id);
    if (addr) addr.required = needsAddress(plan.id);
    var barBtn = document.getElementById("bar-btn");
    if (barBtn) barBtn.setAttribute("data-plan", plan.id);
    updatePayUI();
    if (fromClick) {
      track("AddToCart", planParams(plan));
      if (!checkoutTracked) {
        checkoutTracked = true;
        track("InitiateCheckout", planParams(plan));
      }
    }
  }

  function currentPay() {
    if (selected === "pdf") return "stripe";
    var input = document.querySelector('input[name="pay"]:checked');
    return input ? input.value : "stripe";
  }

  function updatePayUI() {
    var plan = PLANS[selected] || PLANS.komplet;
    var pay = currentPay();
    var door = document.getElementById("pay-door-option");
    var note = document.getElementById("pay-note");
    var submit = document.getElementById("submit-btn");
    var stripeRadio = document.querySelector('input[name="pay"][value="stripe"]');
    if (selected === "pdf" && stripeRadio) stripeRadio.checked = true;
    if (door) {
      door.classList.toggle("hidden", selected === "pdf");
      var doorInput = door.querySelector("input");
      if (doorInput) doorInput.disabled = selected === "pdf";
    }
    if (submit) {
      submit.textContent = pay === "stripe"
        ? "Плати со картичка · " + plan.label
        : "Нарачај на врата · " + plan.label;
    }
    if (!note) return;
    if (selected === "pdf") {
      note.textContent = "Дигиталната верзија се плаќа само со картичка. PDF стигнува на е-пошта по успешна уплата.";
      return;
    }
    if (pay === "door" && selected === "komplet") {
      note.textContent = "При плаќање на врата, дигиталната верзија се испраќа на твојата е-пошта кога ќе ја подигнеш пратката.";
      return;
    }
    if (pay === "door") {
      note.textContent = "Плаќаш при подигнување на пратката.";
      return;
    }
    if (selected === "komplet") {
      note.textContent = "Плаќаш сега со картичка. PDF стигнува на е-пошта по уплатата, а печатената верзија на адреса.";
      return;
    }
    note.textContent = "Плаќаш сега со картичка. Печатената верзија ја праќаме на адресата.";
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
      applyPlan(el.getAttribute("data-plan"), true);
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
    content_name: "652 комбинации",
    content_type: "product",
    content_ids: ["pdf", "print", "komplet"],
    value: 1299,
    currency: "MKD"
  });

  document.querySelectorAll('input[name="pay"]').forEach(function (input) {
    input.addEventListener("change", updatePayUI);
  });

  if (location.search.indexOf("payment=cancel") !== -1) {
    showError("Плаќањето е откажано. Можеш да пробаш повторно.");
    var checkout = document.getElementById("naracka");
    if (checkout) checkout.scrollIntoView();
  }

  applyPlan("komplet", false);

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
    if (needsAddress(plan.id) && (data.city.length < 2 || data.address.length < 4)) {
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

    function finishDoor() {
      var eventId = "door-" + plan.id + "-" + Date.now();
      sessionStorage.removeItem("purchaseSent");
      sessionStorage.setItem("order", JSON.stringify({
        id: plan.id,
        name: plan.name,
        price: plan.price,
        label: plan.label,
        buyer: data.name.split(" ")[0],
        pay: "door",
        eventId: eventId
      }));
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
      origin: location.origin
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
        track("InitiateCheckout", planParams(plan));
        window.location.href = body.url;
        return;
      }
      finishDoor();
    }).catch(function (error) {
      if (isLocal() && pay === "door") {
        finishDoor();
        return;
      }
      fail(error.message || "Нарачката не помина. Пробај повторно.");
    });
  });
})();
