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

  /* ---------- Content management system ----------
     If content.json exists (written by the client admin at /admin.html),
     its values override the static markup and config.js. Every editable
     field on the page is covered: headings, contact details, services,
     reviews, gallery photos, hours and booking options. */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c];
    });
  }

  function applyContent(content) {
    if (!content || typeof content !== "object") return;

    /* 1. Flat values consumed by [data-config] elements */
    var flat = {};
    if (content.brand) flat.name = content.brand.name;
    if (content.tagline !== undefined) flat.tagline = content.tagline;
    if (content.city !== undefined) flat.city = content.city;
    if (content.contact) {
      flat.phoneDisplay = content.contact.phoneDisplay;
      flat.whatsappNumber = content.contact.whatsappNumber;
      flat.email = content.contact.email;
      flat.addressLine = content.contact.addressLine;
      flat.cityLine = content.contact.cityLine;
    }
    if (content.hero) {
      flat.heroEyebrow = content.hero.eyebrow;
      flat.heroLead = content.hero.lead;
      flat.bookCta = content.hero.bookCta;
      flat.exploreCta = content.hero.exploreCta;
    }
    if (content.why) {
      flat.whySub = content.why.sub;
      (content.why.cards || []).slice(0, 3).forEach(function (card, i) {
        flat["why" + (i + 1) + "Title"] = card.title;
        flat["why" + (i + 1) + "Text"] = card.text;
      });
    }
    if (content.services) {
      flat.servicesEyebrow = content.services.eyebrow;
      flat.servicesTitle = content.services.title;
      flat.servicesSub = content.services.sub;
    }
    if (content.reviews) {
      flat.reviewsEyebrow = content.reviews.eyebrow;
      flat.reviewsTitle = content.reviews.title;
      flat.reviewsSub = content.reviews.sub;
    }
    if (content.gallery) flat.galleryTitle = content.gallery.title;
    if (content.visit) {
      flat.visitEyebrow = content.visit.eyebrow;
      flat.visitTitle = content.visit.title;
      flat.visitLead = content.visit.lead;
      flat.visitWeekday = content.visit.weekday;
      flat.visitSunday = content.visit.sunday;
    }
    if (content.booking) {
      flat.formHint = content.booking.hint;
      flat.submitCta = content.booking.submitCta;
    }
    if (content.hours) {
      flat.hoursMonFri = content.hours.monFri;
      flat.hoursSaturday = content.hours.saturday;
      flat.hoursSunday = content.hours.sunday;
    }
    if (content.schema) flat.schema = content.schema;
    for (var k in flat) {
      if (flat[k] !== undefined && flat[k] !== null) cfg[k] = flat[k];
    }
    applyConfig();

    /* 2. Brand name in header + footer */
    if (content.brand && content.brand.name) {
      document.querySelectorAll(".brand-name").forEach(function (el) {
        el.textContent = content.brand.name;
      });
    }

    /* 3. Rebuilt dynamic sections */
    if (content.hero && content.hero.heading) {
      var h1 = document.querySelector(".hero-copy h1");
      if (h1) {
        var accent = content.hero.accent
          ? ' <span class="accent">' + escapeHtml(content.hero.accent) + "</span>"
          : "";
        h1.innerHTML = escapeHtml(content.hero.heading) + accent;
      }
    }

    if (content.hero && Array.isArray(content.hero.trust)) {
      var trust = document.querySelector(".hero-trust");
      if (trust) {
        trust.innerHTML = content.hero.trust
          .map(function (item, i) {
            var stars =
              i === 0
                ? '<span class="stars" aria-hidden="true">★★★★★</span>'
                : "";
            return "<li>" + stars + escapeHtml(item) + "</li>";
          })
          .join("");
      }
    }

    if (content.why && content.why.title) {
      var whyTitle = document.querySelector(".why .section-title");
      if (whyTitle) {
        var whyAccent = content.why.accent
          ? ' <span class="accent">' + escapeHtml(content.why.accent) + "</span>"
          : "";
        whyTitle.innerHTML = escapeHtml(content.why.title) + whyAccent;
      }
    }

    if (content.services && Array.isArray(content.services.items)) {
      var servicesGrid = document.querySelector(".services-grid");
      if (servicesGrid) {
        servicesGrid.innerHTML = content.services.items
          .map(function (s) {
            var tag = s.tag
              ? '<span class="service-tag">' + escapeHtml(s.tag) + "</span>"
              : "";
            return (
              '<article class="service-card">' +
              '<div class="service-img">' +
              '<img src="' +
              escapeHtml(s.image) +
              '" alt="' +
              escapeHtml(s.title) +
              '" loading="lazy" decoding="async" width="800" height="600" />' +
              tag +
              "</div>" +
              '<div class="service-body">' +
              "<h3>" +
              escapeHtml(s.title) +
              "</h3>" +
              "<p>" +
              escapeHtml(s.description) +
              "</p>" +
              '<div class="service-meta">' +
              "<span><strong>from " +
              escapeHtml(s.price) +
              "</strong></span>" +
              "<span>" +
              escapeHtml(s.duration) +
              "</span>" +
              "</div>" +
              "</div>" +
              "</article>"
            );
          })
          .join("");
      }
    }

    if (content.reviews && Array.isArray(content.reviews.items)) {
      var reviewsGrid = document.querySelector(".reviews-grid");
      if (reviewsGrid) {
        reviewsGrid.innerHTML = content.reviews.items
          .map(function (r) {
            return (
              '<figure class="review-card">' +
              '<div class="stars" aria-hidden="true">★★★★★</div>' +
              "<blockquote>&ldquo;" +
              escapeHtml(r.quote) +
              "&rdquo;</blockquote>" +
              "<figcaption>" +
              '<img src="' +
              escapeHtml(r.image) +
              '" alt="' +
              escapeHtml(r.reviewer) +
              '" loading="lazy" decoding="async" width="120" height="120" />' +
              "<div>" +
              '<p class="reviewer">' +
              escapeHtml(r.reviewer) +
              "</p>" +
              '<p class="review-pet">' +
              escapeHtml(r.pet) +
              "</p>" +
              "</div>" +
              "</figcaption>" +
              "</figure>"
            );
          })
          .join("");
      }
    }

    if (content.gallery && Array.isArray(content.gallery.items)) {
      var galleryGrid = document.querySelector(".gallery-grid");
      if (galleryGrid) {
        galleryGrid.innerHTML = content.gallery.items
          .map(function (g) {
            return (
              "<figure>" +
              '<img src="' +
              escapeHtml(g.image) +
              '" alt="' +
              escapeHtml(g.alt || "") +
              '" loading="lazy" decoding="async" width="600" height="450" />' +
              "</figure>"
            );
          })
          .join("");
      }
    }

    if (Array.isArray(content.marquee)) {
      var track = document.querySelector(".marquee-track");
      if (track) {
        var bits = [];
        for (var copy = 0; copy < 2; copy++) {
          content.marquee.forEach(function (item) {
            bits.push("<span>" + escapeHtml(item) + "</span>");
            bits.push("<span>&middot;</span>");
          });
        }
        track.innerHTML = bits.join("");
      }
    }

    if (content.booking && Array.isArray(content.booking.options)) {
      var select = document.getElementById("f-service");
      if (select) {
        var opts =
          '<option value="" selected disabled>Choose a service</option>';
        content.booking.options.forEach(function (opt) {
          opts +=
            '<option value="' +
            escapeHtml(opt.value) +
            '">' +
            escapeHtml(opt.label) +
            "</option>";
        });
        select.innerHTML = opts;
      }
    }
  }

  fetch("content.json", { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("no content.json");
      return res.json();
    })
    .then(applyContent)
    .catch(function () {
      /* No content.json — the static markup stays exactly as-is. */
    });

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
