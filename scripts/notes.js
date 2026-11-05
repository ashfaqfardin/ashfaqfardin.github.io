// Notes: search and filters on notes.html, and the slide viewer on each note's page.
// Both pages are complete without this script; slides can still be swiped.
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- Search and filters ---
  const input = document.getElementById("notes-search");
  if (input) {
    const notes = Array.from(document.querySelectorAll("#notes-list .note"));
    const empty = document.getElementById("notes-empty");
    const filters = Array.from(document.querySelectorAll("[data-notes-kind]"));
    let kind = "all";

    const apply = () => {
      const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      notes.forEach((note) => {
        const text = `${note.textContent} ${note.dataset.search || ""}`.toLowerCase();
        note.hidden = !(kind === "all" || note.dataset.kind === kind) || !terms.every((term) => text.includes(term));
        if (!note.hidden) shown += 1;
      });
      empty.hidden = shown > 0;
    };

    input.addEventListener("input", apply);
    filters.forEach((filter) => {
      filter.addEventListener("click", () => {
        kind = filter.dataset.notesKind;
        filters.forEach((other) => other.setAttribute("aria-pressed", String(other === filter)));
        apply();
      });
    });
  }

  // --- Slide viewer ---
  document.querySelectorAll("[data-slides]").forEach((viewer) => {
    const track = viewer.querySelector(".slides__track");
    const slides = Array.from(track.children);
    const count = viewer.querySelector("[data-slides-count]");
    const prev = viewer.querySelector("[data-slides-prev]");
    const next = viewer.querySelector("[data-slides-next]");
    const pad = (n) => String(n).padStart(2, "0");
    const current = () => Math.round(track.scrollLeft / (track.clientWidth || 1));

    const go = (index) => {
      const target = Math.max(0, Math.min(slides.length - 1, index));
      track.scrollTo({ left: target * track.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
    };

    const update = () => {
      const index = current();
      count.textContent = `${pad(index + 1)} / ${pad(slides.length)}`;
      prev.disabled = index === 0;
      next.disabled = index === slides.length - 1;
      // Keeps Tab on the slide in view instead of scrolling to controls on the others.
      slides.forEach((slide, i) => {
        slide.inert = i !== index;
      });
    };

    prev.addEventListener("click", () => go(current() - 1));
    next.addEventListener("click", () => go(current() + 1));
    track.addEventListener("scroll", update, { passive: true });
    track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") go(current() + 1);
      else if (e.key === "ArrowLeft") go(current() - 1);
      else return;
      e.preventDefault();
    });
    update();

    // Tutorials draw their buttons into the slides. These are the real ones on top.
    const checkAnswer = (button, slide, options) => {
      const note = slide.querySelector("[data-hot-note]");
      const say = (text) => {
        if (note) note.textContent = text;
      };
      const picked = options.find((option) => option.getAttribute("aria-pressed") === "true");
      if (!picked) {
        say("Pick an answer first.");
        return;
      }
      const right = options.find((option) => option.dataset.key === button.dataset.answer);
      options.forEach((option) => {
        option.disabled = true;
      });
      right.classList.add("is-right");
      if (picked !== right) picked.classList.add("is-wrong");
      say(picked === right ? "Correct." : `Not quite. The answer is ${button.dataset.answer}.`);
      button.classList.add("is-done");
      button.dataset.hot = "next";
      button.textContent = "Continue";
      button.removeAttribute("aria-label");
    };

    track.addEventListener("click", (e) => {
      const button = e.target.closest("[data-hot]");
      if (!button) return;
      const slide = button.closest(".slides__slide");
      const options = Array.from(slide.querySelectorAll('[data-hot="option"]'));
      if (button.dataset.hot === "option") {
        options.forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
      } else if (button.dataset.hot === "check" && button.dataset.answer) {
        checkAnswer(button, slide, options);
      } else {
        go(current() + 1);
        track.focus({ preventScroll: true }); // this slide is about to become inert
      }
    });
  });
})();
