// Keep Swimming: the hidden mini-game, unlocked by clicking "Keep Swimming" on Home
// or About (scripts/companion.js). The companion swims up through the mishaps of
// machine learning: steer with ←/→ or A/D (or the on-screen arrows, or by holding
// either side of the pool), dodge CUDA OOMs, adversarial patches, hallucinations and
// exploding gradients, and collect tokens. Everything is drawn in the site's tokens.
(function () {
  "use strict";

  const { icon } = window.Site;
  const LW = 400; // logical width; the height follows the pool's aspect ratio
  const MAX_V = 330; // swim speed, logical px per second
  const EPOCH = 30; // seconds per epoch; each one speeds the stream up

  const stage = document.getElementById("ks-stage");
  const canvas = document.getElementById("ks-canvas");
  let ctx = canvas.getContext("2d"); // swapped briefly to draw the legend icons
  const overlay = document.getElementById("ks-overlay");
  const scoreEl = document.getElementById("ks-score");
  const epochEl = document.getElementById("ks-epoch");
  const comboEl = document.getElementById("ks-combo");
  const livesEl = document.getElementById("ks-lives");
  const pauseBtn = document.getElementById("ks-pause");
  const muteBtn = document.getElementById("ks-mute");
  const fullscreenBtn = document.getElementById("ks-fullscreen");
  const game = stage.parentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  const load = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (e) {
      return null;
    }
  };
  const save = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  };
  // Unlocked by the companion; visitors without storage are never locked out.
  const unlocked = () => {
    try {
      return localStorage.getItem("keep-swimming") === "true";
    } catch (e) {
      return true;
    }
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // --- Colours (read from the design tokens, refreshed on theme change) ---
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name) => cs.getPropertyValue(name).trim();
    C = {
      bg: v("--bg"),
      bg2: v("--bg-2"),
      bg3: v("--bg-3"),
      text: v("--text"),
      text2: v("--text-2"),
      text3: v("--text-3"),
      border: v("--border"),
      lime: v("--lime"),
      onLime: v("--on-lime"),
      limeSubtle: v("--lime-subtle"),
    };
  }
  readColors();

  // --- Pool size ---
  let dpr = 1;
  let scale = 1;
  let LH = 600; // logical height
  const player = { x: LW / 2, y: 480, vx: 0, r: 17 };

  function resize() {
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    scale = r.width / LW;
    LH = r.height / scale;
    player.y = LH * 0.8;
    if (state !== "playing") draw();
  }

  // --- Sound (tiny synth, created on the first start so browsers allow it) ---
  let audio = null;
  let muted = load("ks-muted") === true;
  const SOUNDS = {
    token: ["sine", 880, 1320, 0.12, 0.16],
    power: ["triangle", 520, 1040, 0.25, 0.2],
    restore: ["triangle", 760, 320, 0.22, 0.2],
    hit: ["square", 170, 60, 0.26, 0.1],
    epoch: ["sine", 660, 990, 0.3, 0.14],
    over: ["sawtooth", 420, 70, 0.8, 0.08],
  };
  function sfx(name, pitch = 1) {
    if (muted || !audio) return;
    const [type, from, to, length, volume] = SOUNDS[name];
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(to * pitch, now + length);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + length + 0.02);
  }
  function wakeAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
    } catch (e) {}
  }
  const buzz = (ms) => navigator.vibrate && navigator.vibrate(ms);

  // --- Input ---
  const keys = { left: false, right: false };
  const pad = { left: false, right: false };
  let touch = 0; // -1 / 0 / 1 while a finger holds a side of the pool
  const steer = () => clamp((keys.right || pad.right ? 1 : 0) - (keys.left || pad.left ? 1 : 0) + touch, -1, 1);

  const KEYS = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
  window.addEventListener("keydown", (e) => {
    const dir = KEYS[e.key];
    if (dir) {
      keys[dir] = true;
      if (state === "playing") e.preventDefault();
      else if (state === "ready" && unlocked()) start();
      return;
    }
    const onControl = e.target.closest && e.target.closest("button, a, input");
    if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && state !== "locked") {
      setImmersive(!immersive);
      return;
    }
    if ((e.key === " " || e.key === "Enter") && !onControl) {
      if (state === "ready" || state === "over") {
        e.preventDefault();
        if (unlocked()) start();
      } else if (state === "paused") {
        e.preventDefault();
        resume();
      } else if (state === "playing" && e.key === " ") {
        e.preventDefault();
      }
    }
    if (e.key === "p" || e.key === "P" || e.key === "Escape") {
      if (state === "playing") pause();
      else if (state === "paused") resume();
    }
  });
  window.addEventListener("keyup", (e) => {
    const dir = KEYS[e.key];
    if (dir) keys[dir] = false;
  });

  function holdButton(btn, dir) {
    const release = () => {
      pad[dir] = false;
      btn.classList.remove("is-down");
    };
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      pad[dir] = true;
      btn.classList.add("is-down");
      try {
        btn.setPointerCapture(e.pointerId); // keep steering if the finger slides off
      } catch (err) {}
      if (state === "ready" && unlocked()) start();
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => btn.addEventListener(type, release));
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  holdButton(document.getElementById("ks-left"), "left");
  holdButton(document.getElementById("ks-right"), "right");

  // Hold the left or right half of the pool to swim that way.
  const sideOf = (e) => {
    const r = stage.getBoundingClientRect();
    return e.clientX < r.left + r.width / 2 ? -1 : 1;
  };
  stage.addEventListener("pointerdown", (e) => {
    if (state !== "playing" || e.target.closest("button")) return;
    touch = sideOf(e);
    try {
      stage.setPointerCapture(e.pointerId);
    } catch (err) {}
  });
  stage.addEventListener("pointermove", (e) => {
    if (stage.hasPointerCapture(e.pointerId)) touch = sideOf(e);
  });
  ["pointerup", "pointercancel"].forEach((type) => stage.addEventListener(type, () => (touch = 0)));

  // --- Full screen ---
  // The real Fullscreen API where the browser allows it; otherwise (e.g. on iPhone) the
  // game simply fills the window. Either way the pool stays a portrait column.
  let immersive = false;
  const nativeFullscreen = () => document.fullscreenElement || document.webkitFullscreenElement;
  function setImmersive(on) {
    if (on === immersive) return;
    immersive = on;
    game.classList.toggle("is-fullscreen", on);
    document.documentElement.classList.toggle("ks-immersive", on);
    try {
      if (on && !nativeFullscreen()) {
        const request = game.requestFullscreen || game.webkitRequestFullscreen;
        const pending = request && request.call(game, { navigationUI: "hide" });
        if (pending && pending.catch) pending.catch(() => {});
      } else if (!on && nativeFullscreen()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        const pending = exit && exit.call(document);
        if (pending && pending.catch) pending.catch(() => {});
      }
    } catch (e) {}
    hud(true);
  }
  // Leaving the browser's full screen (e.g. with Esc) leaves ours too.
  ["fullscreenchange", "webkitfullscreenchange"].forEach((type) =>
    document.addEventListener(type, () => {
      if (!nativeFullscreen() && immersive) setImmersive(false);
    })
  );
  fullscreenBtn.addEventListener("click", () => setImmersive(!immersive));

  document.addEventListener("visibilitychange", () => document.hidden && pause());
  window.addEventListener("blur", () => {
    keys.left = keys.right = false;
    pause();
  });

  // --- A run ---
  let state = "ready"; // ready | playing | paused | over | locked
  let world = null;
  let raf = 0;
  let last = 0;

  function newWorld() {
    return {
      t: 0,
      distance: 0,
      bonus: 0,
      score: 0,
      tokens: 0,
      bestStreak: 0,
      lives: 3,
      combo: 0,
      comboT: 0,
      shield: false,
      invuln: 0,
      shake: 0,
      epoch: 1,
      hazardT: 1.1,
      tokenT: 0.8,
      powerT: rand(12, 18),
      lastHit: null,
      entities: [],
      texts: [],
      trail: [],
    };
  }

  function loop() {
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    wakeAudio();
    world = newWorld();
    player.x = LW / 2;
    player.vx = 0;
    state = "playing";
    hideOverlay();
    if (coarse) setImmersive(true); // phones play full screen
    hud(true);
    stage.focus({ preventScroll: true });
    // Otherwise make sure the pool and its arrows are in view.
    const box = game.getBoundingClientRect();
    if (!immersive && (box.top < 0 || box.bottom > window.innerHeight)) {
      game.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
    }
    loop();
  }

  function pause() {
    if (state !== "playing") return;
    state = "paused";
    cancelAnimationFrame(raf);
    showOverlay("paused");
    hud(true);
  }

  function resume() {
    if (state !== "paused") return;
    wakeAudio();
    state = "playing";
    hideOverlay();
    hud(true);
    loop();
  }

  function gameOver() {
    state = "over";
    cancelAnimationFrame(raf);
    const best = load("ks-best") || 0;
    const score = Math.floor(world.score);
    if (score > best) save("ks-best", score);
    sfx("over");
    buzz([80, 60, 120]);
    draw();
    hud(true);
    showOverlay("over", { score, best: Math.max(best, score), isBest: score > best && score > 0 });
  }

  function frame(now) {
    // rAF timestamps mark the frame start, so the first one can predate loop().
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
    last = now;
    if (state !== "playing") return;
    update(dt);
    if (state !== "playing") return;
    draw();
    hud();
    raf = requestAnimationFrame(frame);
  }

  // --- Spawning ---
  const SUBWORDS = ["the", "##ing", "▁AI", "tok", "##en", "attn", "##s", "LLM", "vec", "▁the", "##er", "CLS", "img", "px", "SEP"];
  const HAZARDS = [
    { kind: "gpu", from: 0, weight: 3 },
    { kind: "patch", from: 5, weight: 2 },
    { kind: "ghost", from: 10, weight: 2.5 },
    { kind: "gradient", from: 22, weight: 2 },
  ];

  function spawnHazard(w) {
    const open = HAZARDS.filter((h) => w.t >= h.from);
    let roll = Math.random() * open.reduce((sum, h) => sum + h.weight, 0);
    const kind = (open.find((h) => (roll -= h.weight) < 0) || open[0]).kind;
    const e = { kind, y: -40 };
    if (kind === "gpu") {
      e.w = 62;
      e.h = 30;
    } else if (kind === "patch") {
      e.w = e.h = Math.round(rand(34, 46));
      e.cells = Array.from({ length: 36 }, () => Math.floor(Math.random() * 5));
    } else if (kind === "ghost") {
      e.r = rand(16, 20);
      e.amp = rand(22, 50);
      e.freq = rand(1.1, 2);
      e.phase = rand(0, Math.PI * 2);
      e.drift = 0.85;
    } else {
      e.r = 14;
      e.vx = (Math.random() < 0.5 ? -1 : 1) * rand(70, 120 + w.t);
      e.spin = 0;
      e.drift = 1.1;
    }
    // A third of hazards aim at the swimmer, so hiding against a wall isn't safe.
    const half = (e.w || 2 * (e.r + (e.amp || 0))) / 2;
    const aimed = Math.random() < 0.35;
    e.x = clamp(aimed ? player.x + rand(-24, 24) : rand(0, LW), half + 4, LW - half - 4);
    e.x0 = e.x;
    w.entities.push(e);
  }

  function spawnTokens(w) {
    ctx.font = "500 10px 'Geist Mono', ui-monospace, monospace";
    const token = (x, y) => {
      const label = pick(SUBWORDS);
      w.entities.push({ kind: "token", x, y, r: 10, label, w: Math.max(26, ctx.measureText(label).width + 14) });
    };
    const x = rand(40, LW - 40);
    const shape = Math.random();
    if (shape < 0.35) token(x, -20);
    else if (shape < 0.7) for (let i = 0; i < 4; i++) token(x, -20 - i * 36);
    else for (let i = 0; i < 5; i++) token(clamp(x + (i % 2 ? 34 : -34), 30, LW - 30), -20 - i * 36);
  }

  function spawnPower(w) {
    const kind = w.lives < 3 && Math.random() < 0.45 ? "heart" : "checkpoint";
    w.entities.push({ kind, x: rand(40, LW - 40), y: -30, r: 13 });
  }

  // --- Rules ---
  function float(text, x, y, strong) {
    world.texts.push({ text, x, y, t: 0, strong });
  }

  const HIT_TEXT = { gpu: "CUDA OOM!", patch: "Adversarial!", ghost: "Hallucinated!", gradient: "Exploding gradients!" };

  function hit(w, e) {
    e.dead = true;
    if (w.shield) {
      w.shield = false;
      w.invuln = 0.9;
      float("Restored from checkpoint", player.x, player.y - 34, true);
      sfx("restore");
      return;
    }
    w.lives -= 1;
    w.combo = 0;
    w.invuln = 1.6;
    w.shake = 0.35;
    w.lastHit = e.kind;
    float(HIT_TEXT[e.kind], player.x, player.y - 34, true);
    sfx("hit");
    buzz(60);
    if (w.lives <= 0) gameOver();
  }

  function collect(w, e) {
    e.dead = true;
    if (e.kind === "token") {
      w.combo = w.comboT > 0 ? w.combo + 1 : 1;
      w.comboT = 2;
      w.bestStreak = Math.max(w.bestStreak, w.combo);
      const points = 10 * Math.min(w.combo, 5);
      w.bonus += points;
      w.tokens += 1;
      float(`+${points}`, e.x, e.y - 14);
      sfx("token", 1 + Math.min(w.combo, 8) * 0.06);
    } else if (e.kind === "checkpoint") {
      w.shield = true;
      float("Checkpoint saved", e.x, e.y - 18, true);
      sfx("power");
    } else {
      w.lives = Math.min(3, w.lives + 1);
      float("+1 life", e.x, e.y - 18, true);
      sfx("power");
    }
  }

  // Circle (player) against an entity: boxes for the GPU and patch, circles otherwise.
  function touches(e, shrink) {
    if (e.w && e.h) {
      const cx = clamp(player.x, e.x - e.w / 2, e.x + e.w / 2);
      const cy = clamp(player.y, e.y - e.h / 2, e.y + e.h / 2);
      return Math.hypot(player.x - cx, player.y - cy) < player.r * shrink;
    }
    return Math.hypot(player.x - e.x, player.y - e.y) < player.r * shrink + e.r * 0.85;
  }

  function update(dt) {
    const w = world;
    w.t += dt;
    const speed = Math.min(170 + w.t * 5, 460);
    w.distance += speed * dt;
    w.score = w.distance / 20 + w.bonus;

    const epoch = 1 + Math.floor(w.t / EPOCH);
    if (epoch > w.epoch) {
      w.epoch = epoch;
      float(`Epoch ${epoch}`, LW / 2, LH * 0.38, true);
      sfx("epoch");
    }

    // Swimming: accelerate toward the held direction, water drag when let go.
    const dir = steer();
    player.vx += dir * 2600 * dt;
    if (!dir) player.vx *= Math.pow(0.002, dt);
    player.vx = clamp(player.vx, -MAX_V, MAX_V);
    player.x += player.vx * dt;
    if (player.x < player.r + 6 || player.x > LW - player.r - 6) {
      player.x = clamp(player.x, player.r + 6, LW - player.r - 6);
      player.vx = 0;
    }

    w.hazardT -= dt;
    if (w.hazardT <= 0) {
      spawnHazard(w);
      w.hazardT = Math.max(0.4, 1.05 - w.t * 0.011) * rand(0.75, 1.25);
    }
    w.tokenT -= dt;
    if (w.tokenT <= 0) {
      spawnTokens(w);
      w.tokenT = rand(1.3, 2.4);
    }
    w.powerT -= dt;
    if (w.powerT <= 0) {
      spawnPower(w);
      w.powerT = rand(15, 24);
    }

    for (const e of w.entities) {
      e.y += speed * (e.drift || 1) * dt;
      if (e.kind === "ghost") e.x = e.x0 + Math.sin(w.t * e.freq + e.phase) * e.amp;
      if (e.kind === "gradient") {
        e.x += e.vx * dt;
        e.spin += dt * 3;
        if (e.x < e.r + 4 || e.x > LW - e.r - 4) e.vx *= -1;
      }
      if (e.dead || state !== "playing") continue;
      const good = e.kind === "token" || e.kind === "checkpoint" || e.kind === "heart";
      if (good && touches(e, 1.05)) collect(w, e);
      else if (!good && w.invuln <= 0 && touches(e, 0.78)) hit(w, e);
    }
    w.entities = w.entities.filter((e) => !e.dead && e.y < LH + 80);

    w.comboT -= dt;
    if (w.comboT <= 0) w.combo = 0;
    w.invuln = Math.max(0, w.invuln - dt);
    w.shake = Math.max(0, w.shake - dt);

    // A trail of bubbles behind the swimmer.
    if (Math.random() < dt * (6 + Math.abs(player.vx) / 40)) {
      w.trail.push({ x: player.x + rand(-6, 6), y: player.y + player.r, r: rand(1.5, 3.5), t: 0 });
    }
    for (const b of w.trail) {
      b.t += dt;
      b.y += speed * 0.6 * dt;
      b.x += Math.sin(b.t * 6) * 0.3;
    }
    w.trail = w.trail.filter((b) => b.t < 1.4);

    for (const f of w.texts) {
      f.t += dt;
      f.y -= 34 * dt;
    }
    w.texts = w.texts.filter((f) => f.t < 1.1);
  }

  // --- Drawing ---
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  }

  function drawWater() {
    const g = ctx.createLinearGradient(0, 0, 0, LH);
    g.addColorStop(0, C.bg2);
    g.addColorStop(1, C.limeSubtle);
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, LW + 40, LH + 40);
    // A faint loss-plot grid, drifting down as you swim.
    const offset = ((world ? world.distance : 0) * 0.5) % 40;
    ctx.strokeStyle = C.border;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = offset - 40; y < LH + 40; y += 40) {
      ctx.moveTo(0, y);
      ctx.lineTo(LW, y);
    }
    for (let x = 40; x < LW; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, LH);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawHeart(x, y, s, fill, stroke) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 24, s / 24);
    ctx.translate(-12, -12);
    ctx.beginPath();
    ctx.moveTo(12, 20.5);
    ctx.bezierCurveTo(12, 20.5, 4.5, 15.9, 2.6, 11.2);
    ctx.bezierCurveTo(1.2, 7.6, 3.4, 4, 7, 4);
    ctx.bezierCurveTo(9, 4, 10.6, 5.1, 12, 7);
    ctx.bezierCurveTo(13.4, 5.1, 15, 4, 17, 4);
    ctx.bezierCurveTo(20.6, 4, 22.8, 7.6, 21.4, 11.2);
    ctx.bezierCurveTo(19.5, 15.9, 12, 20.5, 12, 20.5);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();
  }

  function drawEntity(e, t) {
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.kind === "token") {
      roundRect(-e.w / 2, -9, e.w, 18, 9);
      ctx.fillStyle = C.lime;
      ctx.fill();
      ctx.fillStyle = C.onLime;
      ctx.font = "500 10px 'Geist Mono', ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(e.label, 0, 0.5);
    } else if (e.kind === "checkpoint") {
      // A floppy disk: the saved model.
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 5);
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.fillStyle = C.lime;
      ctx.fill();
      ctx.globalAlpha = 1;
      roundRect(-11, -11, 22, 22, 3);
      ctx.fillStyle = C.bg;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.text;
      ctx.stroke();
      ctx.fillStyle = C.lime;
      ctx.fillRect(-6, -11, 12, 7);
      ctx.strokeRect(-7, 2, 14, 7);
    } else if (e.kind === "heart") {
      drawHeart(0, 0, 24, C.lime, C.text);
    } else if (e.kind === "gpu") {
      // A graphics card that ran out of memory.
      roundRect(-e.w / 2, -e.h / 2, e.w, e.h, 5);
      ctx.fillStyle = C.text;
      ctx.fill();
      ctx.fillStyle = C.lime;
      for (let i = 0; i < 6; i++) ctx.fillRect(-e.w / 2 + 6 + i * 5, e.h / 2 - 1, 3, 4);
      for (const fx of [-18, -2]) {
        ctx.beginPath();
        ctx.arc(fx, 0, 9, 0, Math.PI * 2);
        ctx.fillStyle = C.bg2;
        ctx.fill();
        ctx.save();
        ctx.translate(fx, 0);
        ctx.rotate(t * 9);
        ctx.strokeStyle = C.text3;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = (k * Math.PI * 2) / 3;
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * 7, Math.sin(a) * 7);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = C.bg; // the card is var(--text), so this contrasts in both themes
      ctx.font = "600 9px 'Geist Mono', ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("OOM", 18, 0.5);
    } else if (e.kind === "patch") {
      // Adversarial noise: pixels that fool a vision model.
      const palette = [C.text, C.text2, C.text3, C.bg3, C.lime];
      const cell = e.w / 6;
      for (let i = 0; i < 36; i++) {
        ctx.fillStyle = palette[e.cells[i]];
        ctx.fillRect(-e.w / 2 + (i % 6) * cell, -e.h / 2 + Math.floor(i / 6) * cell, cell + 0.5, cell + 0.5);
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.text;
      ctx.strokeRect(-e.w / 2, -e.h / 2, e.w, e.h);
    } else if (e.kind === "ghost") {
      // A hallucination: confident, wobbly and wrong.
      const r = e.r;
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r, Math.PI, 0);
      ctx.lineTo(r, r * 0.9);
      for (let k = 0; k < 3; k++) {
        const x1 = r - ((k + 0.5) * 2 * r) / 3;
        const x2 = r - ((k + 1) * 2 * r) / 3;
        ctx.quadraticCurveTo(x1, r * 0.9 + (k % 2 ? 5 : -5) * Math.sin(t * 6 + k), x2, r * 0.9);
      }
      ctx.closePath();
      ctx.fillStyle = C.bg;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.text2;
      ctx.stroke();
      ctx.fillStyle = C.text;
      ctx.font = "600 13px 'Host Grotesk', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?!", 0, 0);
    } else if (e.kind === "gradient") {
      // An exploding gradient: a spiky nabla.
      ctx.rotate(e.spin || 0);
      ctx.beginPath();
      for (let k = 0; k < 20; k++) {
        const a = (k * Math.PI) / 10;
        const rr = k % 2 ? e.r * 0.62 : e.r * 1.25;
        ctx[k ? "lineTo" : "moveTo"](Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = C.text;
      ctx.fill();
      ctx.rotate(-(e.spin || 0));
      ctx.fillStyle = C.lime;
      ctx.font = "600 13px 'Host Grotesk', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("∇", 0, 1);
    }
    ctx.restore();
  }

  // The companion in goggles (the same character as scripts/companion.js).
  function drawSwimmer(x, y, r, vx, t, shield) {
    ctx.save();
    ctx.translate(x, y + Math.sin(t * 6) * 1.5);
    ctx.rotate((vx / MAX_V) * 0.3);
    if (shield) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 8, 0, Math.PI * 2);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = C.lime;
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.lime;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = C.lime;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.rect(-r * 2, -r * 2, r * 4, r * 4);
    ctx.arc(-r * 0.16, -r * 0.2, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(14, 14, 15, 0.12)";
    ctx.fill("evenodd");
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.bg;
    ctx.beginPath();
    ctx.arc(0, 0, r + 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-r * 0.4, -r * 0.52, r * 0.26, r * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.fill();
    // Goggles: strap, lenses, eyes glancing the way it swims.
    const gy = -r * 0.12;
    ctx.strokeStyle = C.onLime;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, gy);
    ctx.lineTo(r, gy);
    ctx.stroke();
    const look = (vx / MAX_V) * 1.4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * r * 0.37, gy, r * 0.33, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.stroke();
      roundRect(side * r * 0.37 - 1.6 + look, gy - 3.6, 3.2, 5.8, 1.6);
      ctx.fillStyle = C.onLime;
      ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    const t = performance.now() / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const s = scale * dpr;
    const shake = world && world.shake > 0 && !reduceMotion ? world.shake * 10 : 0;
    ctx.setTransform(s, 0, 0, s, rand(-shake, shake) * s, rand(-shake, shake) * s);
    drawWater();
    if (world) {
      ctx.strokeStyle = C.text3;
      ctx.lineWidth = 1.2;
      for (const b of world.trail) {
        ctx.globalAlpha = 1 - b.t / 1.4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      world.entities.forEach((e) => drawEntity(e, t));
    }
    const blink = world && world.invuln > 0 && Math.floor(world.invuln * 12) % 2 === 0;
    ctx.globalAlpha = blink ? 0.35 : 1;
    drawSwimmer(player.x, player.y, player.r, player.vx, t, world && world.shield);
    ctx.globalAlpha = 1;
    if (world) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const f of world.texts) {
        ctx.globalAlpha = Math.max(0, 1 - f.t / 1.1);
        ctx.font = f.strong ? "600 15px 'Host Grotesk', system-ui, sans-serif" : "500 12px 'Geist Mono', ui-monospace, monospace";
        ctx.fillStyle = C.text;
        ctx.fillText(f.text, clamp(f.x, 80, LW - 80), f.y);
      }
      ctx.globalAlpha = 1;
    }
  }

  // Legend icons in "How to play", drawn with the game's own artwork.
  const ICONS = {
    token: { r: 10, label: "##ing", w: 40 },
    checkpoint: { r: 13 },
    heart: { r: 13 },
    gpu: { w: 62, h: 30, zoom: 0.66 },
    patch: { w: 28, h: 28, cells: [0, 3, 1, 4, 2, 0, 2, 0, 3, 1, 0, 4, 1, 4, 0, 2, 3, 1, 3, 2, 4, 0, 1, 0, 0, 1, 2, 3, 4, 2, 4, 0, 1, 2, 0, 3] },
    ghost: { r: 14 },
    gradient: { r: 11, spin: 0.2 },
  };
  function drawIcons() {
    const main = ctx;
    const size = 44;
    document.querySelectorAll("[data-ks-icon]").forEach((el) => {
      const spec = ICONS[el.dataset.ksIcon];
      const zoom = spec.zoom || 1;
      el.width = el.height = size * dpr;
      ctx = el.getContext("2d");
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
      drawEntity({ kind: el.dataset.ksIcon, x: size / 2 / zoom, y: size / 2 / zoom, ...spec }, 0);
    });
    ctx = main;
  }

  // --- HUD and screens ---
  const HEART_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.4-9.3C1.2 7.6 3.4 4 7 4c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.8 3.6 4.4 7.2-1.9 4.7-9.4 9.3-9.4 9.3Z"/></svg>';
  const PAUSE_SVG = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>';
  const PLAY_SVG = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5Z" fill="currentColor"/></svg>';
  const SOUND_SVG =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></g></svg>';
  const MUTE_SVG =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4Z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/></g></svg>';

  const EXPAND_SVG =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></g></svg>';
  const SHRINK_SVG =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></g></svg>';

  let shown = {};
  function hud(force) {
    const w = world;
    const score = w ? Math.floor(w.score) : 0;
    if (force || shown.score !== score) scoreEl.textContent = (shown.score = score).toLocaleString();
    const epoch = w ? w.epoch : 1;
    if (force || shown.epoch !== epoch) epochEl.textContent = `Epoch ${(shown.epoch = epoch)}`;
    const lives = w ? w.lives : 3;
    if (force || shown.lives !== lives) {
      shown.lives = lives;
      livesEl.innerHTML = [0, 1, 2].map((i) => `<span class="ks__heart${i < lives ? "" : " is-lost"}">${HEART_SVG}</span>`).join("");
      livesEl.setAttribute("aria-label", `${lives} ${lives === 1 ? "life" : "lives"}`);
    }
    const combo = w && w.combo > 1 ? w.combo : 0;
    if (force || shown.combo !== combo) {
      shown.combo = combo;
      comboEl.hidden = !combo;
      comboEl.textContent = `×${Math.min(combo, 5)} context streak`;
    }
    if (force) {
      const playing = state === "playing";
      pauseBtn.innerHTML = playing ? PAUSE_SVG : PLAY_SVG;
      pauseBtn.setAttribute("aria-label", playing ? "Pause" : "Resume");
      pauseBtn.disabled = state !== "playing" && state !== "paused";
      muteBtn.innerHTML = muted ? MUTE_SVG : SOUND_SVG;
      muteBtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
      fullscreenBtn.innerHTML = immersive ? SHRINK_SVG : EXPAND_SVG;
      fullscreenBtn.setAttribute("aria-label", immersive ? "Exit full screen" : "Full screen");
      fullscreenBtn.disabled = state === "locked";
    }
  }

  const CAUSE = {
    gpu: "CUDA ran out of memory.",
    patch: "An adversarial patch fooled your vision.",
    ghost: "You trusted a hallucination.",
    gradient: "Your gradients exploded.",
  };

  const pill = (action, label, glyph) =>
    `<button class="pill pill--accent" type="button" data-ks="${action}"><span class="pill__label">${label}</span><span class="pill__chip">${icon(glyph)}</span></button>`;

  const SCREENS = {
    locked: () => `
      <div class="ks__card">
        <p class="label-s ks__muted">Locked</p>
        <h2 class="heading-l">This pool is locked</h2>
        <p class="body-s ks__muted">Somewhere on this site it says “Keep Swimming”. Click it to unlock the game.</p>
        <a class="pill pill--accent" href="about.html"><span class="pill__label">Go looking</span><span class="pill__chip">${icon("arrow-up-right")}</span></a>
      </div>`,
    ready: () => {
      const best = load("ks-best") || 0;
      return `
      <div class="ks__card">
        <p class="label-s ks__muted">Secret pool</p>
        <h2 class="heading-l">Ready to train?</h2>
        <p class="body-s ks__muted">Dodge the mishaps of machine learning and collect tokens. A checkpoint saves you once.</p>
        ${best ? `<p class="label-s">Best score <span class="ks__best">${best.toLocaleString()}</span></p>` : ""}
        ${pill("start", "Start swimming", "arrow-right")}
        <p class="label-s ks__muted">← → or A D to swim</p>
      </div>`;
    },
    paused: () => `
      <div class="ks__card">
        <p class="label-s ks__muted">Paused</p>
        <h2 class="heading-l">Catch your breath</h2>
        ${pill("resume", "Keep swimming", "arrow-right")}
        <button class="btn btn--subtle" type="button" data-ks="start">Restart</button>
      </div>`,
    over: ({ score, best, isBest }) => `
      <div class="ks__card">
        <p class="label-s ks__muted">Training diverged</p>
        <h2 class="heading-l">${CAUSE[world.lastHit] || "Out of breath."}</h2>
        <p class="ks__final">${score.toLocaleString()}</p>
        ${isBest ? `<span class="tag tag--brand">New best score</span>` : `<p class="label-s">Best <span class="ks__best">${best.toLocaleString()}</span></p>`}
        <p class="body-s ks__muted">Epoch ${world.epoch} · ${world.tokens} tokens · longest streak ${world.bestStreak}</p>
        ${pill("start", "Swim again", "arrow-right")}
        <a class="btn btn--subtle" href="index.html">Back to the site</a>
      </div>`,
  };

  function showOverlay(name, info) {
    overlay.hidden = false;
    overlay.innerHTML = SCREENS[name](info || {});
    const primary = overlay.querySelector("[data-ks], a.pill");
    if (primary) primary.focus({ preventScroll: true });
  }
  function hideOverlay() {
    overlay.hidden = true;
    overlay.innerHTML = "";
  }

  overlay.addEventListener("click", (e) => {
    const button = e.target.closest("[data-ks]");
    if (!button) return;
    if (button.dataset.ks === "resume") resume();
    else start();
  });
  pauseBtn.addEventListener("click", () => (state === "playing" ? pause() : resume()));
  muteBtn.addEventListener("click", () => {
    muted = !muted;
    save("ks-muted", muted);
    if (!muted) wakeAudio();
    hud(true);
  });

  // --- Boot ---
  new MutationObserver(() => {
    readColors();
    drawIcons();
    if (state !== "playing") draw();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  new ResizeObserver(resize).observe(stage);
  resize();
  drawIcons();
  state = unlocked() ? "ready" : "locked";
  showOverlay(state);
  hud(true);
  if (document.fonts) document.fonts.ready.then(() => state !== "playing" && (draw(), drawIcons()));
})();
