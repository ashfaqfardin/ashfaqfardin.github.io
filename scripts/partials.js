// Inject shared header and footer partials
async function injectPartials() {
  const header = await fetch("partials/header.txt").then((res) => res.text());
  const footer = await fetch("partials/footer.txt").then((res) => res.text());
  document.getElementById("header-partial").innerHTML = header;
  document.getElementById("footer-partial").innerHTML = footer;
  // Re-initialize icons and nav after injection
  if (window.lucide) lucide.createIcons();
  // Theme and nav logic (copied from main pages)
  function setInitialTheme() {
    const html = document.getElementById("html-root");
    const stored = localStorage.getItem("theme");
    if (
      stored === "dark" ||
      (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      html.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      html.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }
  setInitialTheme();
  // Attach dark mode toggle after icons are rendered
  setTimeout(() => {
    const darkToggle = document.getElementById("dark-toggle");
    if (darkToggle) {
      darkToggle.onclick = function () {
        const html = document.getElementById("html-root");
        html.classList.toggle("dark");
        localStorage.setItem(
          "theme",
          html.classList.contains("dark") ? "dark" : "light"
        );
        if (window.lucide) lucide.createIcons(); // re-render icons for color
      };
    }
    // Mobile nav toggle
    const nav = document.getElementById("main-nav");
    const toggle = document.getElementById("mobile-nav-toggle");
    if (toggle && nav) {
      toggle.onclick = function () {
        nav.classList.toggle("hidden");
      };
    }
  }, 0);
}
window.addEventListener("DOMContentLoaded", injectPartials);
