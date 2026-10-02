// Shared publication parsing + rendering (used by about.html and publications.html).
(function () {
  "use strict";

  const { icon, escapeHtml } = window.Site;
  const SELF = "Mohammad Ashfaq";
  const bibs = [];

  function extractUrl(text) {
    const match = (text || "").match(/\[([^\]]+)\]\(([^)]+)\)/);
    return match ? match[2] : (text || "").trim();
  }

  // Entries are separated by "---"; fields are "[Name]" headers followed by their value lines.
  function parse(md) {
    md = md.replace(/^\s*\[([^\]]+)\]:\s*(\S+)(?:\s+"([^"]+)")?\s*$/gm, "");
    return md
      .split(/\n-{3,}\n/)
      .map((e) => e.trim())
      .filter(Boolean)
      .map((entry) => {
        const fields = {};
        let current = null;
        entry.split("\n").forEach((line) => {
          const sec = line.match(/^\[(\w+)\]$/);
          if (sec) {
            current = sec[1].toLowerCase();
            fields[current] = "";
          } else if (current) {
            if (fields[current]) fields[current] += "\n";
            fields[current] += line.trim();
          }
        });
        fields.paper = extractUrl(fields.paper);
        fields.code = extractUrl(fields.code);
        return { ...fields, numericYear: parseInt(fields.year, 10) || 0 };
      })
      .sort((a, b) => b.numericYear - a.numericYear);
  }

  function authorsHtml(authors) {
    return authors
      .split(",")
      .map((a) => a.trim())
      .map((a) => (a.includes(SELF) ? `<span class="self">${escapeHtml(a)}</span>` : escapeHtml(a)))
      .join(", ");
  }

  function render(pub) {
    const actions = [];
    if (pub.code) {
      actions.push(
        `<a class="btn btn--sm" href="${escapeHtml(pub.code)}" target="_blank" rel="noopener">${icon("code-xml")}Code</a>`
      );
    }
    if (pub.paper) {
      actions.push(
        `<a class="btn btn--sm" href="${escapeHtml(pub.paper)}" target="_blank" rel="noopener">${icon("file-text")}Paper</a>`
      );
    }
    if (pub.bib) {
      const id = bibs.push(pub.bib) - 1;
      actions.push(`<button class="btn btn--sm" type="button" data-bib="${id}">${icon("quote")}BIB</button>`);
    }

    const thumb = pub.image
      ? `<div class="pub__thumb"><img src="${escapeHtml(pub.image)}" alt="${escapeHtml(pub.title || "Publication image")}" loading="lazy" onerror="this.remove()" /></div>`
      : `<div class="pub__thumb" aria-hidden="true"></div>`;

    return `
      <article class="pub publication-item" data-reveal>
        ${thumb}
        <div class="pub__body">
          <p class="pub__meta">
            ${pub.year ? `<span class="numeral">${escapeHtml(pub.year)}</span><span class="pub__rule"></span>` : ""}
            <span class="label">${escapeHtml(pub.venue)}</span>
          </p>
          ${pub.label ? `<p class="pub__label"><span class="tag tag--brand">${escapeHtml(pub.label)}</span></p>` : ""}
          <h3 class="heading-s pub__title">${escapeHtml(pub.title)}</h3>
          ${pub.author ? `<p class="body-s pub__authors">${authorsHtml(pub.author)}</p>` : ""}
          ${actions.length ? `<div class="pub__actions">${actions.join("")}</div>` : ""}
        </div>
      </article>`;
  }

  // Copy BibTeX to the clipboard (event delegation, works for any rendered list).
  document.addEventListener("click", (e) => {
    const button = e.target.closest("[data-bib]");
    if (!button) return;
    const text = bibs[Number(button.dataset.bib)];
    navigator.clipboard
      .writeText(text)
      .then(() => {
        const original = button.innerHTML;
        button.innerHTML = `${icon("check")}Copied!`;
        setTimeout(() => (button.innerHTML = original), 2000);
      })
      .catch((err) => console.error("Failed to copy text: ", err));
  });

  window.Publications = { parse, render };
})();
