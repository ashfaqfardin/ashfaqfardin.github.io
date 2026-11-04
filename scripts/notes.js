// Notes: the search box on notes.html and the slide viewer on each note's page.
// Both pages are complete without this script; slides can still be swiped.
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- Search ---
  const input = document.getElementById("notes-search");
  if (input) {
    const notes = Array.from(document.querySelectorAll("#notes-list .note"));
    const empty = document.getElementById("notes-empty");
    input.addEventListener("input", () => {
      const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      notes.forEach((note) => {
        const text = `${note.textContent} ${note.dataset.search || ""}`.toLowerCase();
        note.hidden = !terms.every((term) => text.includes(term));
        if (!note.hidden) shown += 1;
      });
      empty.hidden = shown > 0;
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
  });
})();
