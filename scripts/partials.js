// Inject shared header and footer partials
async function injectPartials() {
  const header = await fetch("partials/header.txt").then((res) => res.text());
  const footer = await fetch("partials/footer.txt").then((res) => res.text());

  document.getElementById("header-partial").innerHTML = header;
  document.getElementById("footer-partial").innerHTML = footer;

  // Re-initialize lucide icons after injection
  if (window.lucide) lucide.createIcons();

  const htmlElement = document.documentElement; // use <html> directly
  const themeToggle = document.getElementById("dark-toggle"); // Make sure ID matches your button

  // Initial Theme Setup
  const savedTheme =
    localStorage.getItem("theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");
  htmlElement.classList.remove("light", "dark");
  htmlElement.classList.add(savedTheme);

  // Theme Toggle Function
  function toggleTheme() {
    const currentTheme = htmlElement.classList.contains("dark")
      ? "dark"
      : "light";
    const newTheme = currentTheme === "dark" ? "light" : "dark";

    htmlElement.classList.remove("light", "dark");
    htmlElement.classList.add(newTheme);

    localStorage.setItem("theme", newTheme);

    if (window.lucide) lucide.createIcons(); // re-render icons after theme change
  }

  // Add event listener to Dark Mode Toggle button
  if (themeToggle) {
    themeToggle.addEventListener("click", toggleTheme);
  }

  // Listen for system theme preference changes if user hasn't set a preference
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      if (!localStorage.getItem("theme")) {
        const newTheme = e.matches ? "dark" : "light";
        htmlElement.classList.remove("light", "dark");
        htmlElement.classList.add(newTheme);

        if (window.lucide) lucide.createIcons();
      }
    });

  // Mobile nav toggle logic
  const nav = document.getElementById("main-nav");
  const mobileToggle = document.getElementById("mobile-nav-toggle");
  if (mobileToggle && nav) {
    mobileToggle.addEventListener("click", () => {
      nav.classList.toggle("hidden");
    });
  }
}

window.addEventListener("DOMContentLoaded", injectPartials);
