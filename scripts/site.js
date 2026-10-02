// Shared site behaviour: icon sprite, header/footer partials, theme,
// navigation, and scroll-driven motion. Exposes helpers on window.Site.
(function () {
  "use strict";

  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // --- Icons (Lucide 0.460.0 + Simple Icons for brand marks) ---
  const STROKE_ICONS = {
    "arrow-up-right": '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    "arrow-left": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    "code-xml": '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>',
    "file-text": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    quote: '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    award: '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
    "book-open": '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    "map-pin": '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
    linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/>',
  };
  const FILL_ICONS = {
    discord: '<path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>',
    whatsapp: '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>',
  };

  function injectSprite() {
    const symbols = [];
    for (const [name, paths] of Object.entries(STROKE_ICONS)) {
      symbols.push(
        `<symbol id="i-${name}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g></symbol>`
      );
    }
    for (const [name, paths] of Object.entries(FILL_ICONS)) {
      symbols.push(`<symbol id="i-${name}" viewBox="0 0 24 24"><g fill="currentColor">${paths}</g></symbol>`);
    }
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">${symbols.join("")}</svg>`
    );
  }

  function icon(name, className = "") {
    return `<svg class="icon ${className}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str).replace(/[&<>"']/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[s]);
  }

  async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return (await res.text()).replace(/\r\n/g, "\n");
  }

  // --- Scroll reveal ---
  const revealObserver =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              entry.target.classList.add("is-in");
              revealObserver.unobserve(entry.target);
            }
          },
          { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
        )
      : null;

  function reveal(scope = document) {
    const nodes = scope.querySelectorAll("[data-reveal]:not(.is-in), .portrait:not(.is-in), .wordmark:not(.is-in)");
    nodes.forEach((el) => {
      if (revealObserver) revealObserver.observe(el);
      else el.classList.add("is-in");
    });
  }

  // Staggers sibling reveals: step ms per item, capped so long lists don't drag.
  function stagger(nodes, step = 70, max = 420) {
    Array.from(nodes).forEach((el, i) => el.style.setProperty("--d", `${Math.min(i * step, max)}ms`));
  }

  // --- Pointer spotlight on cards ---
  function initSpotlight(scope = document) {
    scope.querySelectorAll("[data-spotlight]").forEach((el) => {
      if (el.dataset.spotlightBound) return;
      el.dataset.spotlightBound = "1";
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
      el.addEventListener("pointerleave", () => el.style.setProperty("--my", "-9999px"));
    });
  }

  // --- Theme ---
  function currentTheme() {
    return root.classList.contains("dark") ? "dark" : "light";
  }

  function applyTheme(theme) {
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }

  function initTheme() {
    if (!root.classList.contains("dark") && !root.classList.contains("light")) {
      let saved = null;
      try {
        saved = localStorage.getItem("theme");
      } catch (e) {}
      applyTheme(saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
    }

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      let saved = null;
      try {
        saved = localStorage.getItem("theme");
      } catch (err) {}
      if (!saved) applyTheme(e.matches ? "dark" : "light");
    });
  }

  function toggleTheme(event) {
    const next = currentTheme() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("theme", next);
    } catch (e) {}

    if (!document.startViewTransition || reduceMotion.matches) {
      applyTheme(next);
      return;
    }
    // Circular reveal from the toggle button.
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const transition = document.startViewTransition(() => applyTheme(next));
    transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 650, easing: "cubic-bezier(.22,1,.36,1)", pseudoElement: "::view-transition-new(root)" }
      );
    });
  }

  // --- Header ---
  function currentPage() {
    const file = location.pathname.split("/").pop() || "index.html";
    return file === "post.html" ? "notes.html" : file;
  }

  function initHeader(headerHost) {
    const page = currentPage();
    headerHost.querySelectorAll("a[href]").forEach((a) => {
      if (a.getAttribute("href") === page && !a.classList.contains("brand")) a.setAttribute("aria-current", "page");
    });

    // Sliding pill behind the desktop nav links.
    const nav = headerHost.querySelector(".nav");
    const indicator = nav && nav.querySelector(".nav__indicator");
    if (nav && indicator) {
      const moveTo = (link) => {
        if (!link) {
          indicator.style.opacity = "0";
          return;
        }
        indicator.style.opacity = "1";
        indicator.style.width = `${link.offsetWidth}px`;
        indicator.style.transform = `translateX(${link.offsetLeft}px)`;
      };
      const active = nav.querySelector('[aria-current="page"]');
      const settle = () => moveTo(nav.querySelector('[aria-current="page"]'));
      indicator.style.transition = "none";
      moveTo(active);
      requestAnimationFrame(() => (indicator.style.transition = ""));
      nav.querySelectorAll(".nav__link").forEach((link) => link.addEventListener("pointerenter", () => moveTo(link)));
      nav.addEventListener("pointerleave", settle);
      document.fonts && document.fonts.ready.then(settle);
      window.addEventListener("resize", settle);
    }

    // Theme toggle
    const themeToggle = headerHost.querySelector("#dark-toggle");
    if (themeToggle) themeToggle.addEventListener("click", toggleTheme);

    // Mobile menu
    const menuBtn = headerHost.querySelector("#mobile-nav-toggle");
    const menu = headerHost.querySelector("#mobile-menu");
    const setMenu = (open) => {
      if (!menuBtn || !menu) return;
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      menu.classList.toggle("is-open", open);
      menu.inert = !open;
      headerHost.classList.toggle("menu-open", open);
    };
    if (menuBtn && menu) {
      menu.inert = true;
      menu.querySelectorAll("a").forEach((a, i) => a.style.setProperty("--i", i));
      menuBtn.addEventListener("click", () => setMenu(menuBtn.getAttribute("aria-expanded") !== "true"));
      menu.addEventListener("click", (e) => e.target.closest("a") && setMenu(false));
      document.addEventListener("keydown", (e) => e.key === "Escape" && setMenu(false));
      window.matchMedia("(min-width: 901px)").addEventListener("change", (e) => e.matches && setMenu(false));
    }

    // Hide on scroll down, reveal on scroll up.
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      const y = window.scrollY;
      const open = headerHost.classList.contains("menu-open");
      headerHost.classList.toggle("is-scrolled", y > 8);
      headerHost.classList.toggle("is-hidden", !open && y > 160 && y > lastY);
      lastY = y;
      ticking = false;
    };
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(onScroll);
        }
      },
      { passive: true }
    );
    onScroll();
  }

  // --- Footer ---
  function initFooter(footerHost) {
    const wordmark = footerHost.querySelector("[data-wordmark]");
    if (wordmark) {
      const text = wordmark.dataset.wordmark;
      wordmark.innerHTML =
        Array.from(text)
          .map((ch, i) => `<span class="wordmark__char" style="--i:${i}">${escapeHtml(ch)}</span>`)
          .join("") + '<span class="wordmark__dot"></span>';
    }
    reveal(footerHost);
  }

  async function injectPartials() {
    const headerHost = document.getElementById("header-partial");
    const footerHost = document.getElementById("footer-partial");
    try {
      const [header, footer] = await Promise.all([
        headerHost ? fetchText("partials/header.txt") : "",
        footerHost ? fetchText("partials/footer.txt") : "",
      ]);
      if (headerHost) {
        headerHost.innerHTML = header;
        initHeader(headerHost);
      }
      if (footerHost) {
        footerHost.innerHTML = footer;
        initFooter(footerHost);
      }
    } catch (err) {
      console.error("Failed to load header/footer partials:", err);
    }
  }

  window.Site = { icon, escapeHtml, fetchText, reveal, stagger, initSpotlight };

  injectSprite();
  initTheme();
  injectPartials();
  reveal();
  initSpotlight();
})();
