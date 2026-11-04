#!/usr/bin/env node
// Builds the SEO layer of this static site. No dependencies; needs Node 22+ and
// Chrome, Chromium or Edge (set CHROME_PATH if it isn't found automatically).
//
//   1. <head> metadata from content/seo.json: title, description, canonical,
//      Open Graph / Twitter tags and Schema.org JSON-LD.
//   2. Crawlable HTML: renders each page in a headless browser and bakes the
//      result in between <!-- prerender:ID --> markers, so crawlers that don't
//      run JavaScript still see the content. Page scripts re-render on load.
//   3. Research notes: notes.html and one page per note under notes/, from the
//      content/notes.json that tools/build-notes.py writes.
//   4. sitemap.xml, llms.txt and search-index.json (the companion's site search).
//
// On GitHub this runs on every push (.github/workflows/deploy.yml). To preview locally:
//   python tools/build-notes.py && node tools/build-seo.mjs
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { join, extname, dirname, normalize } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Normalise line endings the way site.js fetchText() does, so the shared parsers behave the same.
const read = (file) => readFileSync(join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const config = JSON.parse(read("content/seo.json"));
const SITE = config.site.url;
const PERSON_ID = `${SITE}#person`;
const abs = (path) => new URL(path, SITE).href;
const pageUrl = (file) => (file === "index.html" ? SITE : abs(file));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const today = new Date().toISOString().slice(0, 10);

// Elements whose JS-rendered content is baked into each page, and selectors that
// show rendering has finished. `all` bakes every match's outerHTML instead.
const PRERENDER = {
  "about.html": {
    regions: [{ marker: "selected-publications", select: "#selected-publications-container" }, { marker: "about-sections", select: "#dynamic-content-container" }],
    ready: ["#selected-publications-container .pub", "#skills-md > *", "#work-md .acc", "#profdev-md .acc", "#cocurricular-md .acc"],
  },
  "education.html": {
    regions: [{ marker: "education", select: "#education-md" }, { marker: "education-count", select: "#education-count" }],
    ready: ["#education-md .edu"],
  },
  "publications.html": {
    regions: [{ marker: "publications", select: "#publications-md" }, { marker: "publication-count", select: "#publication-count" }],
    ready: ["#publications-md .pub"],
  },
  "projects.html": {
    regions: [{ marker: "projects", select: "#projects-container" }, { marker: "projects-count", select: "#projects-count" }],
    ready: ["#projects-container .project"],
  },
  "timeline.html": {
    regions: [{ marker: "timeline", select: "#timeline-container > .tl-item", all: true }],
    ready: ["#timeline-container .tl-item"],
  },
  "news.html": {
    regions: [{ marker: "news", select: "#news-list" }, { marker: "news-count", select: "#news-count" }],
    ready: ["#news-list .news"],
  },
};

function fill(html, marker, content, file) {
  const re = new RegExp(`(<!-- ${marker} -->)[\\s\\S]*?(<!-- /${marker} -->)`);
  if (!re.test(html)) throw new Error(`${file}: missing <!-- ${marker} --> ... <!-- /${marker} --> markers`);
  return html.replace(re, (_, open, close) => open + content + close);
}

// --- Dates (git) ---
function lastModified(files) {
  if (!files.length) return today;
  try {
    const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
    if (git("status", "--porcelain", "--", ...files)) return today;
    return git("log", "-1", "--format=%cs", "--", ...files) || today;
  } catch (e) {
    return today;
  }
}

// --- Content ---
function loadPublications() {
  const sandbox = { window: { Site: { icon: () => "", escapeHtml: String } }, document: { addEventListener() {} } };
  vm.runInNewContext(read("scripts/publications.js"), sandbox);
  return sandbox.window.Publications.parse(read("content/publications.md"));
}

// Same "## Title | [Label](url)" format projects.html reads.
function loadProjects() {
  return read("content/projects.md")
    .split(/\n(?=#{1,3} )/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [heading, ...body] = chunk.split("\n");
      const [title, ...meta] = heading.replace(/^#{1,3}\s+/, "").split(" | ");
      const link = meta.join(" | ").match(/\[[^\]]+\]\(([^)]+)\)/);
      return { title: title.trim(), url: link && link[1] !== "#" ? link[1] : "", body: plain(body.join(" ")) };
    });
}

function loadNotes() {
  return existsSync(join(ROOT, "content/notes.json")) ? JSON.parse(read("content/notes.json")) : [];
}

const plain = (md) =>
  md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// BibTeX "Last, First and Last, First" -> ["First Last", ...]
function bibAuthors(bib) {
  const m = (bib || "").match(/\bauthor\s*=\s*(?:\{([^{}]*)\}|"([^"]*)")/i);
  if (!m) return null;
  return (m[1] || m[2])
    .split(/\s+and\s+/)
    .map((n) => n.replace(/[{}]/g, "").trim())
    .map((n) => (n.includes(",") ? n.split(",").reverse().map((p) => p.trim()).join(" ") : n));
}
const bibField = (bib, field) => ((bib || "").match(new RegExp(`\\b${field}\\s*=\\s*(?:\\{([^{}]*)\\}|"([^"]*)")`, "i")) || []).slice(1).find(Boolean);

// --- Structured data ---
const person = config.person;
const personNode = {
  "@type": "Person",
  "@id": PERSON_ID,
  name: person.name,
  alternateName: person.alternateName,
  description: person.description,
  url: SITE,
  image: abs(person.image),
  email: person.email,
  affiliation: { "@type": "CollegeOrUniversity", ...person.affiliation },
  alumniOf: person.alumniOf.map((o) => ({ "@type": "CollegeOrUniversity", ...o })),
  hasCredential: person.credentials.map((c) => ({
    "@type": "EducationalOccupationalCredential",
    credentialCategory: "degree",
    name: c.name,
    recognizedBy: { "@type": "CollegeOrUniversity", name: c.recognizedBy },
  })),
  knowsAbout: person.knowsAbout,
  sameAs: person.sameAs,
};
const websiteNode = { "@type": "WebSite", "@id": `${SITE}#website`, url: SITE, name: config.site.name, inLanguage: "en", author: { "@id": PERSON_ID } };

const itemList = (items) => ({
  "@type": "ItemList",
  numberOfItems: items.length,
  itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, ...item })),
});

function publicationNode(pub) {
  const isThesis = !pub.bib && /university/i.test(pub.venue || "");
  const names = bibAuthors(pub.bib) || (pub.author || "").split(/,\s*/).filter((a) => a && !/^et al\.?$/i.test(a));
  const doi = bibField(pub.bib, "doi") || ((pub.paper || "").match(/\/doi\/(?:abs\/)?(10\.\d+\/[^\s?#]+)/) || [])[1];
  const publisher = bibField(pub.bib, "publisher") || bibField(pub.bib, "organization");
  return {
    item: {
      "@type": isThesis ? "Thesis" : "ScholarlyArticle",
      name: pub.title,
      headline: pub.title,
      author: names.map((n) => (n.toLowerCase() === person.name.toLowerCase() ? { "@id": PERSON_ID } : { "@type": "Person", name: n })),
      datePublished: pub.year,
      ...(isThesis
        ? { inSupportOf: "BSc in Computer Science & Engineering", sourceOrganization: { "@type": "CollegeOrUniversity", name: pub.venue } }
        : { isPartOf: { "@type": "CreativeWork", name: pub.venue } }),
      ...(publisher && { publisher: { "@type": "Organization", name: publisher } }),
      ...(pub.paper && { url: pub.paper }),
      ...(doi && { sameAs: `https://doi.org/${doi}` }),
      ...(pub.image && { image: abs(pub.image) }),
    },
  };
}

function noteNode(n, url) {
  const authors = n.paper.byline.split(" · ")[0].split(/,\s*/).filter(Boolean);
  return {
    "@type": "BlogPosting",
    headline: n.headline,
    description: n.idea || n.takeaway || n.headline,
    datePublished: n.date,
    dateModified: n.date,
    author: { "@id": PERSON_ID },
    image: abs(`assets/notes/${n.slug}/cover.jpg`),
    keywords: n.tags.join(", "),
    mainEntityOfPage: { "@id": `${url}#webpage` },
    isBasedOn: {
      "@type": "ScholarlyArticle",
      name: n.paper.title,
      ...(n.paper.url && { url: n.paper.url }),
      ...(authors.length && { author: authors.map((name) => ({ "@type": "Person", name })) }),
    },
  };
}

function jsonLd(file, page, data) {
  const url = pageUrl(file);
  const graph = [personNode, websiteNode];
  const webpage = {
    "@type": page.type || "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: page.title,
    description: page.description,
    inLanguage: "en",
    isPartOf: { "@id": `${SITE}#website` },
    dateModified: page.modified,
  };
  if (page.type === "ProfilePage") webpage.mainEntity = { "@id": PERSON_ID };
  else webpage.about = { "@id": PERSON_ID };
  if (page.list === "publications") webpage.mainEntity = itemList(data.publications.map(publicationNode));
  if (page.list === "projects") {
    webpage.mainEntity = itemList(
      data.projects.map((p) => ({
        item: {
          "@type": "SoftwareSourceCode",
          name: p.title,
          description: p.body,
          author: { "@id": PERSON_ID },
          ...(/github\.com/.test(p.url) && { codeRepository: p.url }),
        },
      }))
    );
  }
  if (page.list === "news") {
    webpage.mainEntity = itemList(
      data.news.map((n) => ({ name: `${n.date}: ${n.title}`, description: n.description, ...(n.link && { url: abs(n.link) }) }))
    );
  }
  if (page.list === "notes") {
    webpage.mainEntity = itemList(data.notes.map((n) => ({ name: n.headline, url: pageUrl(noteFile(n)) })));
  }
  if (page.note) webpage.mainEntity = noteNode(page.note, url);
  if (file !== "index.html") {
    const trail = [{ name: "Home", url: SITE }, ...(page.parent ? [{ name: page.parent.name, url: pageUrl(page.parent.file) }] : []), { name: page.name, url }];
    webpage.breadcrumb = { "@id": `${url}#breadcrumb` };
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: trail.map((step, i) => ({ "@type": "ListItem", position: i + 1, name: step.name, item: step.url })),
    });
  }
  graph.push(webpage);
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

function headTags(file, page, data) {
  const url = pageUrl(file);
  const image = abs(page.image || config.site.image);
  const tags = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    page.noindex ? `<meta name="robots" content="noindex" />` : `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    ...(page.noindex ? [] : [`<link rel="canonical" href="${url}" />`]),
    `<meta name="author" content="${esc(person.name)}" />`,
    `<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />`,
    `<meta name="theme-color" content="#1e1e1e" media="(prefers-color-scheme: dark)" />`,
    `<meta property="og:type" content="${page.note ? "article" : file === "index.html" ? "profile" : "website"}" />`,
    ...(page.note ? [`<meta property="article:published_time" content="${page.note.date}" />`] : []),
    `<meta property="og:site_name" content="${esc(config.site.name)}" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(page.imageAlt || config.site.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    ...(page.noindex ? [] : [`<script type="application/ld+json">${jsonLd(file, page, data)}</script>`]),
  ];
  return `\n    ${tags.join("\n    ")}\n    `;
}

// Header with the current page marked, as site.js would do after load.
function headerFor(file) {
  const href = file.replace(/\./g, "\\.");
  return read("partials/header.txt").replace(new RegExp(`(<a href="/${href}")`, "g"), '$1 aria-current="page"');
}

// --- Research notes ---
const noteFile = (n) => `notes/${n.slug}.html`;
const noteDate = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const iconHtml = (name) => `<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
const shorten = (text, max) => (text.length <= max ? text : `${text.slice(0, text.lastIndexOf(" ", max - 1))}…`);

function noteCard(n, i) {
  const search = [n.tags.join(" "), n.paper.title, n.paper.byline, n.idea, n.takeaway].join(" ");
  return `
          <a class="note" href="/${noteFile(n)}" data-search="${esc(search)}" data-reveal>
            <div class="note__thumb"><img src="/assets/notes/${n.slug}/thumb.webp" width="480" height="480" alt=""${i < 3 ? "" : ' loading="lazy"'} /></div>
            <div class="note__meta"><span class="label">${noteDate(n.date)}</span><span class="chip chip--sm">${iconHtml("arrow-up-right")}</span></div>
            <h2 class="heading-m">${esc(n.headline)}</h2>
            <p class="body-s note__summary">${esc(n.paper.title)}</p>
          </a>`;
}

function noteTranscript(n) {
  const slide = (s, i) => {
    let body = "";
    let bullets = [];
    const flush = () => {
      if (bullets.length) body += `<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`;
      bullets = [];
    };
    for (const item of s.body) {
      if (item.text.startsWith("●")) {
        bullets.push(item.text.slice(1).trim());
        continue;
      }
      flush();
      body += item.kind === "label" ? `<p class="label-s">${esc(item.text)}</p>` : `<p>${esc(item.text)}</p>`;
    }
    flush();
    return `
            <section class="note-text__slide">
              <p class="label">Slide ${i + 1}${s.kicker ? ` · ${esc(s.kicker)}` : ""}</p>
              <h3 class="heading-s">${esc(s.headline)}</h3>
              ${body}
            </section>`;
  };
  return n.slides.map(slide).join("");
}

function notePage(n, newer, older) {
  const total = n.slides.length;
  const pad = (v) => String(v).padStart(2, "0");
  const slides = n.slides
    .map((s, i) => {
      const alt = `Slide ${i + 1} of ${total}${s.headline ? `: ${s.headline}` : ""}`;
      const load = i ? 'loading="lazy"' : 'fetchpriority="high"';
      return `<li class="slides__slide"><img src="/assets/notes/${n.slug}/slide-${i + 1}.webp" width="1080" height="1080" alt="${esc(alt)}" ${load} /></li>`;
    })
    .join("\n            ");
  const pdf = `https://raw.githubusercontent.com/${config.site.repo}/main/content/Notes/${encodeURIComponent(n.file)}`;
  const refs = n.references.map((r) => `<li><a href="${esc(r)}" target="_blank" rel="noopener noreferrer">${esc(r.replace(/^https:\/\//, ""))}</a></li>`).join("");
  const pager = (other, label) =>
    other
      ? `<a class="note-page__step" href="/${noteFile(other)}"><span class="label-s">${label}</span><span class="heading-s">${esc(other.headline)}</span></a>`
      : "<span></span>";
  return `
      <article class="container note-page">
        <a class="btn btn--subtle btn--sm note-page__back" href="/notes.html">${iconHtml("arrow-left")}All notes</a>

        <header class="note-page__head">
          <p class="note-page__tags"><time class="label" datetime="${n.date}">${noteDate(n.date)}</time>${n.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</p>
          <h1 class="display-m">${esc(n.headline)}</h1>
          ${n.idea ? `<p class="body-l page-sub">${esc(n.idea)}</p>` : ""}
        </header>

        <div class="note-page__grid">
          <section class="slides" data-slides aria-roledescription="carousel" aria-label="Slides for this note">
            <ol class="slides__track" tabindex="0">
            ${slides}
            </ol>
            <div class="slides__bar">
              <button class="icon-btn" type="button" data-slides-prev aria-label="Previous slide">${iconHtml("arrow-left")}</button>
              <span class="numeral" data-slides-count aria-live="polite">01 / ${pad(total)}</span>
              <button class="icon-btn" type="button" data-slides-next aria-label="Next slide">${iconHtml("arrow-right")}</button>
            </div>
          </section>

          <aside class="note-page__side">
            <div class="note-page__block">
              <p class="label-s">The paper</p>
              <h2 class="heading-m">${esc(n.paper.title)}</h2>
              ${n.paper.byline ? `<p class="body-s muted">${esc(n.paper.byline)}</p>` : ""}
              <div class="pub__actions">
                ${n.paper.url ? `<a class="btn btn--sm" href="${esc(n.paper.url)}" target="_blank" rel="noopener noreferrer">${iconHtml("file-text")}Read the paper</a>` : ""}
                <a class="btn btn--sm" href="${pdf}" rel="noopener">${iconHtml("arrow-up-right")}Download PDF</a>
              </div>
            </div>
            ${n.takeaway ? `<div class="note-page__block"><p class="label-s">Takeaway</p><p class="body-l">${esc(n.takeaway)}</p></div>` : ""}
            ${refs ? `<div class="note-page__block"><p class="label-s">References</p><ul class="note-page__refs body-s">${refs}</ul></div>` : ""}
          </aside>
        </div>

        <details class="acc">
          <summary class="acc__sum">
            <span class="acc__title"><span class="heading-s">Read the slides as text</span></span>
            <span class="label acc__date">${total} slides</span>
            <span class="acc__icon" aria-hidden="true"></span>
          </summary>
          <div class="acc__body note-text">${noteTranscript(n)}
          </div>
        </details>

        <nav class="note-page__pager" aria-label="More notes">${pager(newer, "Newer")}${pager(older, "Older")}</nav>
      </article>
    `;
}

// Generated fresh each run, so a deleted PDF takes its page with it.
function buildNotePages(notes) {
  const dir = join(ROOT, "notes");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // /notes/ is a folder as well as a page; without this it would be a dead end.
  writeFileSync(join(dir, "index.html"), `<!DOCTYPE html><meta charset="UTF-8" /><title>Notes</title><meta name="robots" content="noindex" /><meta http-equiv="refresh" content="0; url=/notes.html" /><a href="/notes.html">Notes</a>\n`);
  const template = read("tools/note-template.html");
  return notes.map((n, i) => {
    const file = noteFile(n);
    const page = {
      name: n.paper.title,
      title: `${n.paper.title} | AI Research Notes`,
      description: shorten([n.headline, n.idea].filter(Boolean).join(" "), 158),
      image: `assets/notes/${n.slug}/cover.jpg`,
      imageAlt: n.headline,
      modified: n.date,
      parent: { name: "Notes", file: "notes.html" },
      note: n,
    };
    let html = fill(template, "seo:head", headTags(file, page, data), file);
    html = fill(html, "prerender:header", headerFor("notes.html"), file);
    html = fill(html, "prerender:footer", read("partials/footer.txt"), file);
    html = fill(html, "note", notePage(n, notes[i - 1], notes[i + 1]), file);
    writeFileSync(join(ROOT, file), html);
    return [file, page];
  });
}

// --- Static server + headless browser ---
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".md": "text/markdown", ".txt": "text/plain", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".jfif": "image/jpeg" };

function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "") || "index.html";
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    try {
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" }).end(readFileSync(file));
    } catch (e) {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = {
    win32: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ],
    darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
    linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"],
  }[process.platform];
  return (candidates || []).find((p) => existsSync(p));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launchBrowser() {
  const exe = findBrowser();
  if (!exe) throw new Error("No Chrome/Chromium/Edge found. Set CHROME_PATH to a browser executable.");
  const profile = mkdtempSync(join(tmpdir(), "build-seo-"));
  const args = ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank"];
  if (process.platform === "linux") args.unshift("--no-sandbox");
  const proc = spawn(exe, args, { stdio: "ignore" });

  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  const port = readFileSync(portFile, "utf8").split("\n")[0].trim();
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
    } catch (e) {}
    if (!target) await sleep(100);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });

  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") {
      errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  const close = async () => {
    try {
      await Promise.race([send("Browser.close"), sleep(2000)]);
    } catch (e) {}
    ws.close();
    proc.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  };
  return { send, evaluate, errors, close };
}

// Strips per-visit motion state so the baked HTML matches a fresh render.
const SNAPSHOT = `(select, all) => {
  const clean = (root) => {
    root.querySelectorAll("*").forEach((n) => {
      n.classList.remove("is-in", "is-reached", "is-target");
      if (n.getAttribute("class") === "") n.removeAttribute("class");
      ["--d", "--mx", "--my"].forEach((p) => n.style.removeProperty(p));
      if (n.getAttribute("style") === "") n.removeAttribute("style");
      n.removeAttribute("data-spotlight-bound");
    });
    return root;
  };
  if (all) return [...document.querySelectorAll(select)].map((n) => clean(n.cloneNode(true)).outerHTML).join("");
  const wrap = document.createElement("div");
  wrap.append(document.querySelector(select).cloneNode(true));
  return clean(wrap).firstChild.innerHTML;
}`;

async function prerender(browser, baseUrl, file) {
  const spec = PRERENDER[file];
  await browser.send("Page.navigate", { url: baseUrl + file });
  const ready = JSON.stringify(spec.ready);
  for (let i = 0; ; i++) {
    await sleep(200);
    const done = await browser.evaluate(`${ready}.every((s) => document.querySelector(s))`).catch(() => false);
    if (done) break;
    if (i > 100) throw new Error(`${file}: content did not render within 20s (waiting for ${spec.ready.join(", ")})`);
  }
  await sleep(300);
  const out = {};
  for (const region of spec.regions) {
    out[region.marker] = await browser.evaluate(`(${SNAPSHOT})(${JSON.stringify(region.select)}, ${!!region.all})`);
  }
  return out;
}

// --- Main ---
const pages = Object.entries(config.pages);
const data = {
  publications: loadPublications(),
  projects: loadProjects(),
  news: JSON.parse(read("content/news.json")).sort((a, b) => b.date.localeCompare(a.date)),
  notes: loadNotes(),
};

const server = await serve();
const baseUrl = `http://127.0.0.1:${server.address().port}/`;
const browser = await launchBrowser();
const warnings = [];
try {
  for (const [file, page] of pages) {
    page.modified = lastModified([file, ...page.sources]);
    if (page.title.length > 60) warnings.push(`${file}: title is ${page.title.length} chars (aim for <= 60)`);
    if (page.description.length > 160) warnings.push(`${file}: description is ${page.description.length} chars (aim for <= 160)`);

    let html = read(file);
    const baked = PRERENDER[file] ? await prerender(browser, baseUrl, file) : {};
    html = fill(html, "seo:head", headTags(file, page, data), file);
    html = fill(html, "prerender:header", headerFor(file), file);
    html = fill(html, "prerender:footer", read("partials/footer.txt"), file);
    for (const [marker, content] of Object.entries(baked)) html = fill(html, `prerender:${marker}`, content, file);
    if (page.list === "notes") {
      html = fill(html, "prerender:notes", `${data.notes.map(noteCard).join("")}\n        `, file);
      html = fill(html, "prerender:notes-count", `(${String(data.notes.length).padStart(2, "0")})`, file);
    }
    writeFileSync(join(ROOT, file), html);
    console.log(`  ${file}${Object.keys(baked).length ? ` (baked: ${Object.keys(baked).join(", ")})` : ""}`);
  }
  if (browser.errors.length) warnings.push(...browser.errors.map((e) => `page script error: ${e}`));
} finally {
  await browser.close();
  server.close();
}

const notePages = buildNotePages(data.notes);
console.log(`  notes/ (${notePages.length} pages)`);

const indexed = pages.filter(([, p]) => !p.noindex);
writeFileSync(
  join(ROOT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...indexed, ...notePages].map(([file, p]) => `  <url>\n    <loc>${pageUrl(file)}</loc>\n    <lastmod>${p.modified}</lastmod>\n  </url>`).join("\n")}
</urlset>
`
);

// A plain-text map for LLM tools that look for /llms.txt (https://llmstxt.org).
writeFileSync(
  join(ROOT, "llms.txt"),
  `# ${person.name}

> ${person.description}

Also known as ${person.alternateName.join(", ")}. Contact: ${person.email}.
Profiles: ${person.sameAs.join(", ")}

## Pages

${indexed.map(([file, p]) => `- [${p.name}](${pageUrl(file)}): ${p.description}`).join("\n")}

## Publications

${data.publications.map((p) => `- ${p.title}. ${p.venue} (${p.year}).${p.paper ? ` ${p.paper}` : ""}`).join("\n")}

## Projects

${data.projects.map((p) => `- ${p.title}${p.url ? ` (${p.url})` : ""}: ${p.body}`).join("\n")}

## Research notes

Short breakdowns of recent AI papers, newest first.

${data.notes
  .slice(0, 30)
  .map((n) => `- [${n.headline}](${pageUrl(noteFile(n))}): ${n.date}, on ${n.paper.title}.${n.takeaway ? ` ${n.takeaway}` : ""}`)
  .join("\n")}

## Recent news

${data.news
  .slice(0, 8)
  .map((n) => `- ${n.date}: ${n.title}`)
  .join("\n")}
`
);

// The companion's "/" search (scripts/companion.js). Item ids match site.js slug().
const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const searchIndex = [
  ...data.publications.map((p) => ({ type: "Paper", title: p.title, text: `${p.title} ${p.venue} ${p.year} ${p.author}`, url: `/publications.html#pub-${slug(p.title)}` })),
  ...data.notes.map((n) => ({ type: "Note", title: n.headline, text: `${n.headline} ${n.paper.title} ${n.paper.byline} ${n.tags.join(" ")} ${n.idea} ${n.takeaway}`, url: `/${noteFile(n)}` })),
  ...data.projects.map((p) => ({ type: "Project", title: p.title, text: `${p.title} ${p.body}`, url: `/projects.html#project-${slug(p.title)}` })),
  ...data.news.map((n) => ({ type: "News", title: n.title, text: `${n.title} ${n.description} ${n.date}`, url: `/news.html#news-${slug(n.title)}` })),
];
writeFileSync(join(ROOT, "search-index.json"), JSON.stringify(searchIndex));

console.log(`  sitemap.xml (${indexed.length + notePages.length} URLs), llms.txt, search-index.json (${searchIndex.length} items)`);
if (warnings.length) {
  console.warn("\nWarnings:");
  warnings.forEach((w) => console.warn(`  - ${w}`));
}
