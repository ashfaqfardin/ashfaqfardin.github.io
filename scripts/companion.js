// Tiny companion: the lime dot from the logo, brought to life. It trails the
// mouse on desktop and rests in the bottom-left corner on touch screens or with
// reduced motion. Along the way it:
//   - leaves one tip per page and announces news added since the last visit
//   - opens a site search with "/" (search-index.json, from tools/build-seo.mjs)
//   - reacts to the theme toggle, copied citations, links and too much petting
//   - swims at "Keep Swimming", rides the timeline, dresses up per page
//     (<body data-outfit="glasses|hardhat|map">) and sleeps late at night
// All of its copy lives in content/guide.json.
// Movement is modelled on oneko.js (https://github.com/adryd325/oneko.js, MIT).
(function () {
  "use strict";

  const { icon, escapeHtml } = window.Site;
  const SIZE = 36; // keep in sync with .companion in main.css
  const GAP = 56; // how close it trails behind the pointer
  const SLEEP_AFTER = 15000;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const follows = window.matchMedia("(hover: hover) and (pointer: fine)").matches && !reduceMotion;
  const hour = new Date().getHours();
  const night = hour < 5;
  const hello = night ? "You're up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const outfit = document.body.dataset.outfit;
  const page = (location.pathname.split("/").pop() || "index").replace(/\.html$/, "") || "index";

  const HEART =
    '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.4-9.3C1.2 7.6 3.4 4 7 4c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.8 3.6 4.4 7.2-1.9 4.7-9.4 9.3-9.4 9.3Z"/></svg>';
  const CLOSE =
    '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  const el = document.createElement("div");
  el.className = "companion";
  if (outfit) el.classList.add(`outfit-${outfit}`);
  if (night) el.classList.add("is-sleeping", "has-nightcap");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <span class="companion__shadow"></span>
    <span class="companion__body">
      <span class="companion__hat"></span>
      <span class="companion__eyes"><span class="companion__eye"></span><span class="companion__eye"></span></span>
      <span class="companion__specs"></span>
      <span class="companion__map"></span>
    </span>
    <span class="companion__z">z</span>
    <span class="companion__mark">?</span>
    <span class="companion__air"></span><span class="companion__air"></span><span class="companion__air"></span>`;
  const body = el.querySelector(".companion__body");

  const bubble = document.createElement("div");
  bubble.className = "companion-bubble";
  bubble.hidden = true;
  document.body.append(el, bubble);

  const load = (area, key) => {
    try {
      return JSON.parse(window[area].getItem(key));
    } catch (e) {
      return null;
    }
  };
  const save = (area, key, value) => {
    try {
      window[area].setItem(key, JSON.stringify(value));
    } catch (e) {}
  };
  const fetchJSON = (url) =>
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

  // --- Position ---
  const home = () => {
    const pad = window.innerWidth <= 640 ? 16 : 24;
    return { x: pad + SIZE / 2, y: window.innerHeight - pad - SIZE / 2 };
  };

  // Stay on screen and out from under the sticky header (its blur smears the companion).
  const headerHeight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0;
  function clamp(p) {
    const m = SIZE / 2 + 8;
    const top = headerHeight() + 16 + SIZE / 2;
    return { x: Math.min(Math.max(p.x, m), window.innerWidth - m), y: Math.min(Math.max(p.y, top), window.innerHeight - m) };
  }

  let pos = home();
  if (follows) {
    const saved = load("sessionStorage", "companion");
    if (saved) pos = clamp(saved);
  }

  function render() {
    el.style.transform = `translate3d(${pos.x - SIZE / 2}px, ${pos.y - SIZE / 2}px, 0)`;
  }

  // Eyes drift up to 3px toward whatever it is watching; --look (-1..1) lets it lean too.
  function lookAt(x, y) {
    const dx = x - pos.x;
    const dy = y - pos.y;
    const d = Math.hypot(dx, dy) || 1;
    const r = Math.min(d / 120, 1);
    el.style.setProperty("--lx", `${((dx / d) * r * 3).toFixed(2)}px`);
    el.style.setProperty("--ly", `${((dy / d) * r * 3).toFixed(2)}px`);
    el.style.setProperty("--look", ((dx / d) * r).toFixed(2));
  }

  // --- Moods ---
  let talking = false; // a bubble is open: hold still and stay awake
  let onWake = null; // something to say once it wakes up (late-night visits)
  let sleepTimer = 0;
  function scheduleSleep(ms = SLEEP_AFTER) {
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => !talking && el.classList.add("is-sleeping"), ms);
  }

  function hop() {
    el.classList.remove("is-hopping");
    void body.offsetWidth; // restart the animation
    el.classList.add("is-hopping");
  }

  function rouse() {
    if (el.classList.contains("is-sleeping")) {
      el.classList.remove("is-sleeping");
      hop();
      if (onWake) {
        const speak = onWake;
        onWake = null;
        setTimeout(speak, 700);
      }
    }
    scheduleSleep();
  }

  // Temporary expression, e.g. express("squint", 1400) adds .is-squint for 1.4s.
  const moodTimers = {};
  function express(mood, ms) {
    el.classList.add(`is-${mood}`);
    clearTimeout(moodTimers[mood]);
    moodTimers[mood] = setTimeout(() => el.classList.remove(`is-${mood}`), ms);
  }

  function float(content) {
    const f = document.createElement("span");
    f.className = "companion__float";
    f.innerHTML = content;
    f.addEventListener("animationend", () => f.remove());
    el.appendChild(f);
  }

  body.addEventListener("animationend", (e) => {
    if (e.animationName === "companion-hop") el.classList.remove("is-hopping");
  });

  // --- Following ---
  let pointer = null; // last mouse position, or null once it leaves the window
  let ride = null; // spot on the timeline rail while riding it
  let running = false;
  let last = 0;

  // Where it wants to be: on the timeline rail, GAP behind the pointer, or at home.
  function spot() {
    if (ride) return clamp(ride);
    if (!pointer) return home();
    const dx = pos.x - pointer.x;
    const dy = pos.y - pointer.y;
    const d = Math.hypot(dx, dy);
    return clamp(d > GAP ? { x: pointer.x + (dx / d) * GAP, y: pointer.y + (dy / d) * GAP } : pos);
  }

  function step(now) {
    // rAF timestamps mark the frame start, so the first one can predate move().
    const dt = last ? Math.min(Math.max((now - last) / 16.7, 0), 3) : 1;
    last = now;
    const target = talking ? pos : spot();
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dist = Math.hypot(dx, dy);
    const pace = Math.min(dist * 0.1, 14);
    const speed = pace * dt;

    if (pace < 0.15) {
      running = false;
      el.classList.remove("is-moving");
      body.style.removeProperty("--sx");
      body.style.removeProperty("--sy");
      body.style.removeProperty("--tilt");
      if (!pointer && !talking && !ride) scheduleSleep(4000);
      return;
    }

    pos.x += (dx / dist) * speed;
    pos.y += (dy / dist) * speed;
    // Squash and stretch with speed, lean into the direction of travel.
    const stretch = Math.min(pace / 60, 0.16);
    body.style.setProperty("--sx", (1 + stretch).toFixed(3));
    body.style.setProperty("--sy", (1 - stretch).toFixed(3));
    body.style.setProperty("--tilt", `${Math.max(-12, Math.min(12, (dx / dist) * pace * 1.2)).toFixed(1)}deg`);
    el.classList.add("is-moving");
    render();
    if (pointer) lookAt(pointer.x, pointer.y);
    else lookAt(target.x, target.y);
    requestAnimationFrame(step);
  }

  function move() {
    if (running) return;
    running = true;
    last = 0;
    requestAnimationFrame(step);
  }

  if (follows) {
    document.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerType !== "mouse") return;
        pointer = { x: e.clientX, y: e.clientY };
        rouse();
        lookAt(pointer.x, pointer.y);
        move();
      },
      { passive: true }
    );
    document.documentElement.addEventListener("mouseleave", () => {
      pointer = null;
      move();
    });
    window.addEventListener("pagehide", () => save("sessionStorage", "companion", pos));

    // Curious about links and cards under the mouse: wider eyes, a lean toward them.
    const CURIOUS = "a, button, summary, .project, .pub, .news, .edu, .tl-item__card";
    document.addEventListener(
      "pointerover",
      (e) => {
        if (e.pointerType !== "mouse") return;
        const t = e.target.closest(CURIOUS);
        el.classList.toggle("is-curious", !!t && !bubble.contains(t));
      },
      { passive: true }
    );
  } else {
    document.addEventListener(
      "pointerdown",
      (e) => {
        lookAt(e.clientX, e.clientY);
        rouse();
      },
      { passive: true }
    );
  }

  // --- Bubble ---
  let guide = null;
  let searching = false;
  let closeTimer = 0;

  // Sit above the companion (below it near the header), clamped to the viewport.
  function placeBubble() {
    const m = 12;
    const w = bubble.offsetWidth;
    const h = bubble.offsetHeight;
    const below = pos.y - SIZE / 2 - h - 18 < headerHeight() + m;
    const left = Math.max(m, Math.min(pos.x - 28, window.innerWidth - w - m));
    bubble.style.left = `${left}px`;
    bubble.style.top = `${below ? pos.y + SIZE / 2 + 18 : pos.y - SIZE / 2 - h - 18}px`;
    bubble.style.setProperty("--tail-x", `${Math.max(18, Math.min(w - 18, pos.x - left))}px`);
    bubble.classList.toggle("is-below", below);
  }

  function headHtml(label, withSearch) {
    return `
      <div class="companion-bubble__head">
        <span class="section-label__dot"></span>
        <span class="label-s">${escapeHtml(label)}</span>
        <span class="companion-bubble__tools">
          ${withSearch ? `<button class="companion-bubble__btn" type="button" data-guide="search" aria-label="Search the site">${icon("search")}</button>` : ""}
          <button class="companion-bubble__btn" type="button" data-guide="close" aria-label="Close">${CLOSE}</button>
        </span>
      </div>`;
  }

  function actionHtml(action) {
    if (!action) return "";
    if (action.focus) {
      return `<button class="btn btn--sm" type="button" data-guide="focus" data-target="${escapeHtml(action.focus)}">${escapeHtml(action.label)}</button>`;
    }
    if (action.run) {
      return `<button class="btn btn--sm" type="button" data-guide="${escapeHtml(action.run)}">${escapeHtml(action.label)}</button>`;
    }
    const external = /^https?:\/\//.test(action.href);
    return `<a class="btn btn--sm" href="${escapeHtml(action.href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>
        ${escapeHtml(action.label)}${icon("arrow-up-right")}</a>`;
  }

  function open(closeAfter) {
    talking = true;
    rouse();
    bubble.hidden = false;
    bubble.classList.remove("is-open");
    placeBubble();
    void bubble.offsetWidth; // restart the pop-in
    bubble.classList.add("is-open");
    if (closeAfter) scheduleClose(closeAfter);
    else clearTimeout(closeTimer);
  }

  // msg: { label, text, action?, hint?, ms? } (ms: auto-close delay, default 10s)
  function say(msg) {
    searching = false;
    bubble.classList.remove("companion-bubble--search");
    bubble.setAttribute("role", "status");
    bubble.removeAttribute("aria-label");
    bubble.innerHTML = `
      ${headHtml(msg.label, true)}
      <p class="body-s">${escapeHtml(msg.text)}</p>
      ${actionHtml(msg.action)}
      ${msg.hint ? `<p class="label-s companion-bubble__hint">${escapeHtml(msg.hint)}</p>` : ""}`;
    open(msg.ms || 10000);
  }

  function hush() {
    if (bubble.hidden) return;
    clearTimeout(closeTimer);
    if (bubble.contains(document.activeElement)) document.activeElement.blur();
    bubble.hidden = true;
    talking = false;
    searching = false;
    scheduleSleep();
    move();
  }

  // Never closes while someone is typing in it or using its buttons.
  function scheduleClose(ms) {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => !bubble.contains(document.activeElement) && hush(), ms);
  }

  bubble.addEventListener("pointerenter", () => clearTimeout(closeTimer));
  bubble.addEventListener("pointerleave", () => scheduleClose(4000));
  bubble.addEventListener("focusin", () => clearTimeout(closeTimer));
  bubble.addEventListener("click", (e) => {
    const control = e.target.closest("[data-guide], a");
    if (!control) return;
    const action = control.dataset.guide;
    if (action === "search") return openSearch();
    if (action === "focus") {
      const target = document.querySelector(control.dataset.target);
      if (target) target.focus();
    }
    if (action === "top") window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    hush();
  });

  // --- Search ---
  let index = null;

  function showResults(query) {
    const box = bubble.querySelector(".companion-bubble__results");
    if (!box) return;
    const s = guide.search;
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length || !index) {
      box.innerHTML = `<p class="body-s companion-bubble__empty">${escapeHtml(index || !terms.length ? s.empty : "Loading…")}</p>`;
    } else {
      const hits = index
        .map((item) => {
          const text = item.text.toLowerCase();
          if (!terms.every((t) => text.includes(t))) return null;
          return { item, score: terms.filter((t) => item.title.toLowerCase().includes(t)).length };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
      box.innerHTML = hits.length
        ? hits
            .map(({ item }) => `<a href="${escapeHtml(item.url)}"><span class="label-s">${escapeHtml(item.type)}</span><span class="body-s">${escapeHtml(item.title)}</span></a>`)
            .join("")
        : `<p class="body-s companion-bubble__empty">${escapeHtml(s.none.replace("{query}", query.trim()))}</p>`;
    }
    placeBubble();
  }

  function openSearch() {
    if (!guide) return;
    const s = guide.search;
    searching = true;
    bubble.classList.add("companion-bubble--search");
    bubble.setAttribute("role", "dialog");
    bubble.setAttribute("aria-label", s.label);
    bubble.innerHTML = `
      ${headHtml(s.label, false)}
      <input class="companion-bubble__input" type="search" placeholder="${escapeHtml(s.placeholder)}" aria-label="${escapeHtml(s.label)}" autocomplete="off" spellcheck="false" />
      <div class="companion-bubble__results"></div>`;
    open(0);
    const input = bubble.querySelector("input");
    input.focus({ preventScroll: true });
    input.addEventListener("input", () => showResults(input.value));
    input.addEventListener("keydown", (e) => {
      const first = bubble.querySelector(".companion-bubble__results a");
      if (e.key === "Enter" && first) first.click();
    });
    showResults("");
    if (!index) {
      fetchJSON("search-index.json").then((data) => {
        index = data || [];
        if (searching) showResults(input.value);
      });
    }
  }

  // Arrow keys move between the search box and its results.
  bubble.addEventListener("keydown", (e) => {
    if (!searching || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    const items = [bubble.querySelector("input"), ...bubble.querySelectorAll(".companion-bubble__results a")];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    items[Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))].focus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hush();
    const typing = e.target.closest && e.target.closest("input, textarea, select, [contenteditable]");
    if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && guide) {
      e.preventDefault();
      openSearch();
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (searching && !bubble.contains(e.target) && !el.contains(e.target)) hush();
  });

  // --- Petting ---
  // Quick clicks are pets (hearts); eight within four seconds make it dizzy.
  let pets = [];
  el.addEventListener("click", () => {
    if (el.classList.contains("is-dizzy")) return;
    const wasAsleep = el.classList.contains("is-sleeping");
    const now = Date.now();
    const quick = pets.length && now - pets[pets.length - 1] < 600;
    pets = pets.filter((t) => now - t < 4000).concat(now);
    hop();
    rouse();
    if (wasAsleep) return;
    if (pets.length >= 8) {
      pets = [];
      hush();
      express("dizzy", 1800);
    } else if (quick) {
      float(HEART);
    } else if (talking) {
      hush();
      float(HEART);
    } else if (guide && outfit === "map" && guide.lost) {
      say(guide.lost);
    } else if (guide && guide.pages[page]) {
      say({ ...guide.pages[page], label: "Tip" });
    } else {
      float(HEART);
    }
  });

  // --- Reactions ---
  // Theme toggle: squints at the light, gets sleepy in the dark.
  let theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
  new MutationObserver(() => {
    const now = document.documentElement.classList.contains("dark") ? "dark" : "light";
    if (now === theme) return;
    theme = now;
    if (!el.classList.contains("is-sleeping")) express(now === "light" ? "squint" : "sleepy", now === "light" ? 1400 : 2000);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  // Citation copied (fired by scripts/publications.js).
  document.addEventListener("bib-copied", () => {
    hop();
    if (guide) say({ ...guide.cite, ms: 3000 });
  });

  // "Keep Swimming": goggles on, a little swim.
  document.querySelectorAll('[data-companion="swim"]').forEach((n) => {
    const swim = () => {
      rouse();
      express("swimming", 2600);
    };
    n.addEventListener("pointerenter", swim);
    n.addEventListener("click", swim);
  });

  // Reached the footer: a wave and a way back up, once per page view.
  const footer = document.getElementById("footer-partial");
  let waved = false;
  if (footer && "IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        if (waved || talking || !guide || !entries.some((e) => e.isIntersecting) || window.scrollY < window.innerHeight * 0.5) return;
        waved = true;
        express("waving", 1900);
        float("\u{1F44B}");
        say(guide.footer);
      },
      { threshold: 0.3 }
    ).observe(footer);
  }

  // Timeline: ride the progress line at the reading line, hop at each milestone.
  const rail = document.querySelector(".timeline__rail");
  if (rail && !reduceMotion) {
    const updateRide = () => {
      const r = rail.getBoundingClientRect();
      const line = window.innerHeight * 0.6; // matches the timeline's reading line
      const was = ride;
      ride = line > r.top + 24 && line < r.bottom - 8 ? { x: r.left + r.width / 2, y: line } : null;
      if (ride && !was && talking && !searching) hush();
      if (ride) rouse();
      if (ride || was) move();
    };
    let ticking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          updateRide();
        });
      },
      { passive: true }
    );
    window.addEventListener("resize", updateRide);
    updateRide(); // the page may open part-way down
    new MutationObserver((records) => {
      const reached = records.some(
        (m) => m.target.classList.contains("tl-item") && m.target.classList.contains("is-reached") && !(m.oldValue || "").includes("is-reached")
      );
      if (reached && ride) hop();
    }).observe(rail.parentElement, { subtree: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true });
  }

  // --- What to say on arrival ---
  // Returns news items this visitor hasn't seen; the first visit only records them.
  function freshNews(items) {
    const seen = load("localStorage", "companion-news");
    save("localStorage", "companion-news", items.map((n) => n.title));
    if (!Array.isArray(seen)) return [];
    return items.filter((n) => !seen.includes(n.title)).sort((a, b) => b.date.localeCompare(a.date));
  }

  function speakSoon(msg, onShown) {
    const go = () => {
      if (talking) return;
      say(msg);
      if (onShown) onShown();
    };
    if (el.classList.contains("is-sleeping")) onWake = go; // late at night: wait until someone wakes it
    else setTimeout(go, 2600); // after its entrance
  }

  Promise.all([fetchJSON("content/guide.json"), fetchJSON("content/news.json")]).then(([data, news]) => {
    if (!data) return;
    guide = data;
    const state = load("localStorage", "companion-guide") || {};
    const firstVisit = !state.greeted;
    const greetedThisSession = load("sessionStorage", "companion-hello");
    const markGreeted = () => save("sessionStorage", "companion-hello", true);

    if (outfit === "map") {
      if (guide.lost) speakSoon(guide.lost);
      return;
    }

    const fresh = news ? freshNews(news) : [];
    if (fresh.length && page !== "news" && !firstVisit) {
      const n = guide.news;
      const text = fresh.length === 1 ? n.one.replace("{title}", fresh[0].title) : n.many.replace("{count}", fresh.length).replace("{title}", fresh[0].title);
      speakSoon({ label: n.label, text, action: n.action }, markGreeted);
      return;
    }

    const tip = guide.pages[page];
    const seen = state.seen || {};
    if (!tip || seen[page]) return;
    const label = firstVisit ? `${hello}! ${guide.greeting}` : greetedThisSession ? "Tip" : hello;
    speakSoon({ ...tip, label, hint: firstVisit ? guide.hint : "" }, () => {
      save("localStorage", "companion-guide", { greeted: true, seen: { ...seen, [page]: true } });
      markGreeted();
    });
  });

  window.addEventListener("resize", () => {
    pos = pointer || ride ? clamp(pos) : home();
    render();
    if (talking) placeBubble();
  });

  render();
  if (!night) scheduleSleep();
})();
