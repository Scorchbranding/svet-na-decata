(function () {
  var PLANS = {
    pdf: {
      id: "pdf",
      name: "Само PDF",
      price: 599,
      label: "599 ден.",
      copy: "PDF се испраќа на е-поштата од нарачката. Нема достава."
    },
    print: {
      id: "print",
      name: "Печатена книшка",
      price: 999,
      label: "999 ден.",
      copy: "Печатената книшка ја праќаме на адреса. Те контактираме за достава."
    },
    komplet: {
      id: "komplet",
      name: "PDF + печатено",
      price: 1299,
      label: "1.299 ден.",
      copy: "PDF стигнува на е-пошта. Печатената книшка ја праќаме на адресата што ќе ја оставиш."
    }
  };

  var selected = "komplet";
  var checkoutTracked = false;

  function track(eventName, params) {
    if (typeof fbq === "function") fbq("track", eventName, params);
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
    if (fromClick) {
      track("AddToCart", planParams(plan));
      if (!checkoutTracked) {
        checkoutTracked = true;
        track("InitiateCheckout", planParams(plan));
      }
    }
  }

  function showError(message) {
    var box = document.getElementById("form-error");
    if (!box) return;
    box.textContent = message;
    box.classList.toggle("hidden", !message);
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
  var emailReady = window.SITE && window.SITE.orderEmail && window.SITE.orderEmail.indexOf("@") > 0;
  var pixelReady = window.SITE && /^\d{5,}$/.test(String(window.SITE.pixelId || ""));
  if (banner && isLocal() && (!emailReady || !pixelReady)) {
    banner.classList.remove("hidden");
    banner.innerHTML = "Тест на компјутер: пред објава внеси " +
      (pixelReady ? "" : "<code>pixelId</code> ") +
      (!pixelReady && !emailReady ? "и " : "") +
      (emailReady ? "" : "<code>orderEmail</code> ") +
      "во <code>config.js</code>. Нарачката локално се симулира ако нема е-пошта.";
  }

  track("ViewContent", {
    content_name: "652 комбинации",
    content_type: "product",
    content_ids: ["pdf", "print", "komplet"],
    value: 1299,
    currency: "MKD"
  });

  applyPlan("komplet", false);

  var form = document.getElementById("order-form");
  if (!form) return;

  form.addEventListener("input", function () {
    showError("");
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    showError("");
    var honey = form.querySelector('[name="_honey"]');
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
      return showError("За печатената книшка ни треба град и адреса.");
    }

    var button = document.getElementById("submit-btn");
    button.disabled = true;
    button.textContent = "Се испраќа...";

    var payload = {
      _subject: "Нова нарачка: 652 комбинации — " + plan.name,
      _template: "table",
      _captcha: "false",
      _replyto: data.email,
      Пакет: plan.name,
      Цена: plan.label,
      Име: data.name,
      Телефон: data.phone,
      Епошта: data.email,
      Град: data.city || "—",
      Адреса: data.address || "—",
      Забелешка: data.note || "—"
    };

    function finish() {
      sessionStorage.removeItem("purchaseTracked");
      sessionStorage.setItem("order", JSON.stringify({
        id: plan.id,
        name: plan.name,
        price: plan.price,
        label: plan.label,
        buyer: data.name.split(" ")[0]
      }));
      window.location.href = "thanks.html";
    }

    function fail(message) {
      button.disabled = false;
      button.textContent = "Нарачај за " + plan.label;
      showError(message);
    }

    if (!emailReady) {
      if (isLocal()) {
        finish();
        return;
      }
      fail("Нарачките моментално не се примаат. Обиди се повторно подоцна.");
      return;
    }

    fetch("https://formsubmit.co/ajax/" + encodeURIComponent(window.SITE.orderEmail), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (!response.ok) throw new Error("bad status");
      return response.json();
    }).then(function () {
      finish();
    }).catch(function () {
      fail("Нарачката не помина. Провери ја врската и пробај уште еднаш.");
    });
  });
})();
