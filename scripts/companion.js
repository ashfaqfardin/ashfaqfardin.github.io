// Tiny companion: the lime dot from the logo, brought to life. It trails the
// mouse on desktop, rests in the bottom-left corner on touch screens or with
// reduced motion, and dozes off when left alone. It also guides visitors: one
// tip per page from content/guide.json, shown once and again whenever it's clicked.
// Movement is modelled on oneko.js (https://github.com/adryd325/oneko.js, MIT).
(function () {
  "use strict";

  const { icon, escapeHtml } = window.Site;
  const SIZE = 36; // keep in sync with .companion in main.css
  const GAP = 56; // how close it trails behind the pointer
  const SLEEP_AFTER = 15000;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const follows = window.matchMedia("(hover: hover) and (pointer: fine)").matches && !reduceMotion;

  const el = document.createElement("div");
  el.className = "companion";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <span class="companion__shadow"></span>
    <span class="companion__body">
      <span class="companion__eyes"><span class="companion__eye"></span><span class="companion__eye"></span></span>
    </span>
    <span class="companion__z">z</span>`;
  document.body.appendChild(el);
  const body = el.querySelector(".companion__body");

  // --- Position ---
  const home = () => {
    const pad = window.innerWidth <= 640 ? 16 : 24;
    return { x: pad + SIZE / 2, y: window.innerHeight - pad - SIZE / 2 };
  };

  let pos = home();
  if (follows) {
    try {
      const saved = JSON.parse(sessionStorage.getItem("companion"));
      if (saved) pos = { x: Math.min(saved.x, innerWidth - SIZE / 2), y: Math.min(saved.y, innerHeight - SIZE / 2) };
    } catch (e) {}
  }

  function render() {
    el.style.transform = `translate3d(${pos.x - SIZE / 2}px, ${pos.y - SIZE / 2}px, 0)`;
  }

  // Eyes drift up to 3px toward whatever it is watching.
  function lookAt(x, y) {
    const dx = x - pos.x;
    const dy = y - pos.y;
    const d = Math.hypot(dx, dy) || 1;
    const r = Math.min(d / 120, 1) * 3;
    el.style.setProperty("--lx", `${((dx / d) * r).toFixed(2)}px`);
    el.style.setProperty("--ly", `${((dy / d) * r).toFixed(2)}px`);
  }

  // --- Moods ---
  let talking = false; // a tip is open: hold still and stay awake
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
    }
    scheduleSleep();
  }

  function heart() {
    const h = document.createElement("span");
    h.className = "companion__heart";
    h.innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.4-9.3C1.2 7.6 3.4 4 7 4c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.8 3.6 4.4 7.2-1.9 4.7-9.4 9.3-9.4 9.3Z"/></svg>';
    h.addEventListener("animationend", () => h.remove());
    el.appendChild(h);
  }

  body.addEventListener("animationend", (e) => {
    if (e.animationName === "companion-hop") el.classList.remove("is-hopping");
  });

  // --- Following ---
  let pointer = null; // last mouse position, or null once it leaves the window
  let running = false;
  let last = 0;

  function step(now) {
    // rAF timestamps mark the frame start, so the first one can predate move().
    const dt = last ? Math.min(Math.max((now - last) / 16.7, 0), 3) : 1;
    last = now;
    const target = talking ? pos : pointer || home();
    const stop = pointer ? GAP : 0;
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dist = Math.hypot(dx, dy);
    const pace = dist > stop ? Math.min((dist - stop) * 0.1, 14) : 0;
    const speed = pace * dt;

    if (pace < 0.15) {
      running = false;
      el.classList.remove("is-moving");
      body.style.removeProperty("--sx");
      body.style.removeProperty("--sy");
      body.style.removeProperty("--tilt");
      if (!pointer && !talking) scheduleSleep(4000);
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
    lookAt(target.x, target.y);
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
    window.addEventListener("pagehide", () => {
      try {
        sessionStorage.setItem("companion", JSON.stringify(pos));
      } catch (e) {}
    });
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

  // --- Guide ---
  const page = (location.pathname.split("/").pop() || "index").replace(/\.html$/, "") || "index";
  const bubble = document.createElement("div");
  bubble.className = "companion-bubble";
  bubble.setAttribute("role", "status");
  bubble.hidden = true;
  document.body.appendChild(bubble);

  let guide = null;
  let closeTimer = 0;

  const readState = () => {
    try {
      return JSON.parse(localStorage.getItem("companion-guide")) || {};
    } catch (e) {
      return {};
    }
  };
  const writeState = (state) => {
    try {
      localStorage.setItem("companion-guide", JSON.stringify(state));
    } catch (e) {}
  };

  // Sit above the companion (below it near the top edge), clamped to the viewport.
  function placeBubble() {
    const m = 12;
    const w = bubble.offsetWidth;
    const h = bubble.offsetHeight;
    const below = pos.y - SIZE / 2 - h - 18 < m;
    const left = Math.max(m, Math.min(pos.x - 28, window.innerWidth - w - m));
    bubble.style.left = `${left}px`;
    bubble.style.top = `${below ? pos.y + SIZE / 2 + 18 : pos.y - SIZE / 2 - h - 18}px`;
    bubble.style.setProperty("--tail-x", `${Math.max(18, Math.min(w - 18, pos.x - left))}px`);
    bubble.classList.toggle("is-below", below);
  }

  function actionHtml(action) {
    if (!action) return "";
    if (action.focus) {
      return `<button class="btn btn--sm" type="button" data-guide="focus" data-target="${escapeHtml(action.focus)}">${escapeHtml(action.label)}</button>`;
    }
    const external = /^https?:\/\//.test(action.href);
    return `<a class="btn btn--sm" href="${escapeHtml(action.href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>
        ${escapeHtml(action.label)}${icon("arrow-up-right")}</a>`;
  }

  function say(tip, first) {
    bubble.innerHTML = `
      <div class="companion-bubble__head">
        <span class="section-label__dot"></span>
        <span class="label-s">${escapeHtml(first ? guide.greeting : "Tip")}</span>
        <button class="companion-bubble__close" type="button" data-guide="close" aria-label="Close tip">
          <svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>
      <p class="body-s">${escapeHtml(tip.text)}</p>
      ${actionHtml(tip.action)}
      ${first && guide.hint ? `<p class="label-s companion-bubble__hint">${escapeHtml(guide.hint)}</p>` : ""}`;
    talking = true;
    rouse();
    bubble.hidden = false;
    bubble.classList.remove("is-open");
    placeBubble();
    void bubble.offsetWidth; // restart the pop-in
    bubble.classList.add("is-open");
    scheduleClose(10000);
  }

  function hush() {
    if (bubble.hidden) return;
    clearTimeout(closeTimer);
    bubble.hidden = true;
    talking = false;
    scheduleSleep();
    move();
  }

  function scheduleClose(ms) {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(hush, ms);
  }

  // Stay open while someone is reading or using it.
  bubble.addEventListener("pointerenter", () => clearTimeout(closeTimer));
  bubble.addEventListener("pointerleave", () => scheduleClose(4000));
  bubble.addEventListener("focusin", () => clearTimeout(closeTimer));
  bubble.addEventListener("click", (e) => {
    const control = e.target.closest("[data-guide], a");
    if (!control) return;
    if (control.dataset.guide === "focus") {
      const target = document.querySelector(control.dataset.target);
      if (target) target.focus();
    }
    hush();
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && hush());

  el.addEventListener("click", () => {
    hop();
    rouse();
    if (talking) {
      hush();
      heart();
    } else if (guide && guide.pages[page]) {
      say(guide.pages[page], false);
    } else {
      heart();
    }
  });

  fetch("content/guide.json")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      guide = data;
      const tip = guide && guide.pages && guide.pages[page];
      if (!tip) return;
      const state = readState();
      const seen = state.seen || {};
      if (seen[page]) return;
      // Wait for the companion's entrance before speaking up.
      setTimeout(() => {
        if (talking) return;
        say(tip, !state.greeted);
        writeState({ greeted: true, seen: { ...seen, [page]: true } });
      }, 2600);
    })
    .catch((err) => console.error("Failed to load content/guide.json:", err));

  window.addEventListener("resize", () => {
    if (!pointer) {
      pos = home();
      render();
    }
    if (talking) placeBubble();
  });

  render();
  scheduleSleep();
})();
