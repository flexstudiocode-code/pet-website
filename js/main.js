/* ==========================================================================
   Paw & Glow — Interactions
   ========================================================================== */

(function () {
  "use strict";

  var cfg = window.SITE_CONFIG || {};

  /* ---------- Apply configuration to the page ----------
     Any element with [data-config] gets its text replaced with the
     matching value from SITE_CONFIG. Links with data-tel / data-mailto
     get their hrefs built from the configured phone / email. */
  function applyConfig() {
    document.querySelectorAll("[data-config]").forEach(function (el) {
      var key = el.getAttribute("data-config");
      if (cfg[key] !== undefined) el.textContent = cfg[key];
    });

    document.querySelectorAll("[data-tel]").forEach(function (el) {
      if (cfg.whatsappNumber) {
        el.setAttribute("href", "tel:+" + cfg.whatsappNumber);
      }
    });

    document.querySelectorAll("[data-mailto]").forEach(function (el) {
      if (cfg.email) {
        var subject = el.getAttribute("data-subject") || "";
        var href = "mailto:" + cfg.email;
        if (subject) href += "?subject=" + encodeURIComponent(subject);
        el.setAttribute("href", href);
      }
    });

    /* Keep the search-engine structured data in sync */
    var ld = document.getElementById("schemaLocalBusiness");
    if (ld && cfg.schema) {
      try {
        var data = JSON.parse(ld.textContent);
        data.name = cfg.name;
        data.telephone = cfg.phoneDisplay;
        data.address.streetAddress = cfg.schema.streetAddress;
        data.address.addressLocality = cfg.schema.addressLocality;
        data.address.addressRegion = cfg.schema.addressRegion;
        data.address.postalCode = cfg.schema.postalCode;
        ld.textContent = JSON.stringify(data);
      } catch (e) { /* keep the original markup */ }
    }
  }

  applyConfig();

  var header = document.querySelector(".site-header");
  var navToggle = document.getElementById("navToggle");
  var navMenu = document.getElementById("navMenu");

  /* ---------- Sticky header state ---------- */
  function onScroll() {
    if (window.scrollY > 8) {
      header.classList.add("is-scrolled");
    } else {
      header.classList.remove("is-scrolled");
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile nav ---------- */
  navToggle.addEventListener("click", function () {
    var open = navMenu.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });

  navMenu.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      navMenu.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });

  /* ---------- Base / Pro website tiers ----------
     Mirrors the Clinic demo-toggle system: elements marked
     data-tier="pro" are hidden on the Base version and revealed
     on the Pro version. */
  var demoMode = cfg.demoMode !== false;
  var activeTier = cfg.tier || "base";

  function revealForce(container) {
    container.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  function applyTier() {
    var tier = activeTier;
    document.querySelectorAll("[data-tier]").forEach(function (el) {
      var show = el.getAttribute("data-tier") === tier;
      if (demoMode) {
        /* In demo mode: hide/show so the toggle can restore them */
        el.style.display = show ? "" : "none";
        if (show) revealForce(el);
      } else if (show) {
        el.style.display = "";
      } else {
        el.parentNode.removeChild(el);
      }
    });
  }

  function syncDemoButtons() {
    var toggle = document.getElementById("demoToggle");
    if (!toggle) return;
    var active = activeTier;
    toggle.querySelectorAll("[data-demo-tier]").forEach(function (btn) {
      btn.classList.toggle(
        "active",
        btn.getAttribute("data-demo-tier") === active
      );
    });
  }

  function setTier(tier) {
    activeTier = tier;
    applyTier();
    syncDemoButtons();
  }

  function initDemoToggle() {
    var toggle = document.getElementById("demoToggle");
    if (!demoMode || !toggle) return;
    toggle.style.display = "flex";
    toggle.querySelectorAll("[data-demo-tier]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTier(btn.getAttribute("data-demo-tier"));
      });
    });
    syncDemoButtons();
    applyTier();
  }

  initDemoToggle();

  /* ---------- Reveal on scroll ---------- */
  document.body.classList.add("js-reveal");
  var revealEls = document.querySelectorAll(".reveal");
  function forceVisible(el) {
    el.classList.add("is-visible");
    if (io) io.unobserve(el);
  }
  var io = null;
  if ("IntersectionObserver" in window && revealEls.length) {
    io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) forceVisible(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach(function (el) {
      io.observe(el);
    });

    /* Fallback: reveal anything near the viewport on scroll. Covers fast
       fling gestures / jumps where IntersectionObserver skips elements. */
    var fallbackPending = false;
    var checkReveal = function () {
      if (fallbackPending) return;
      fallbackPending = true;
      window.requestAnimationFrame(function () {
        fallbackPending = false;
        var vh = window.innerHeight || document.documentElement.clientHeight;
        revealEls.forEach(function (el) {
          if (el.classList.contains("is-visible")) return;
          var r = el.getBoundingClientRect();
          if (r.top < vh + 150) forceVisible(el);
        });
      });
    };
    window.addEventListener("scroll", checkReveal, { passive: true });
    checkReveal();
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  /* ---------- Booking form (demo) ---------- */
  var form = document.getElementById("bookingForm");
  var status = document.getElementById("formStatus");

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var name = form.querySelector("#f-name").value.trim();
      var pet = form.querySelector("#f-pet").value.trim();
      var serviceSel = form.querySelector("#f-service");
      var serviceText =
        serviceSel.selectedOptions.length > 0
          ? serviceSel.selectedOptions[0].textContent.trim()
          : "";
      var scheduleRow = form.querySelector(".form-row-split");
      var hasScheduler =
        scheduleRow && scheduleRow.style.display !== "none";
      var date = hasScheduler ? form.querySelector("#f-date").value : "";
      var time = hasScheduler ? form.querySelector("#f-time").value : "";
      var missing = [];

      if (!name) missing.push("your name");
      if (!pet) missing.push("your pet's name");
      if (!serviceText) missing.push("a service");
      if (hasScheduler && !date) missing.push("a date");
      if (hasScheduler && !time) missing.push("a time");

      if (missing.length) {
        status.textContent =
          "Almost there — please add " + missing.join(", ") + ".";
        status.classList.add("error");
        return;
      }

      /* Build the reservation message */
      var lines = [
        "Hello " + (cfg.name || "Paw & Glow") + "! I'd like to book a groom.",
        "Name: " + name,
        "Pet: " + pet,
        "Service: " + serviceText
      ];

      if (hasScheduler) {
        var prettyDate = new Date(date + "T00:00:00").toLocaleDateString(
          "en-US",
          { weekday: "short", month: "short", day: "numeric" }
        );
        lines.push("Date: " + prettyDate);
        lines.push("Time: " + time);
      }

      var waNumber = cfg.whatsappNumber || "919847001234";
      window.open(
        "https://wa.me/" +
          waNumber +
          "?text=" +
          encodeURIComponent(lines.join("\n")),
        "_blank"
      );

      status.classList.remove("error");
      status.textContent =
        "Your booking request is ready in WhatsApp — just press send. We'll confirm shortly. \u{1F43E}";

      form.reset();
    });
  }

  /* ---------- Footer year ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
})();
