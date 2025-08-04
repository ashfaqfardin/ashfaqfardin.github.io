document.addEventListener("DOMContentLoaded", () => {
  const blogList = document.getElementById("blog-list");

  /**
   * Fetches the list of posts from a JSON file and renders them as links.
   */
  async function loadPosts() {
    // Ensure the blogList element exists before proceeding
    if (!blogList) {
      return;
    }

    try {
      const res = await fetch("posts/posts.json");
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const posts = await res.json();
      renderBlogList(posts);
    } catch (e) {
      console.error("Failed to load blog posts:", e);
      blogList.innerHTML =
        '<p class="col-span-full text-red-500">Failed to load blog posts.</p>';
    }
  }

  /**
   * Renders the list of blog post preview cards as links that open in the same tab.
   * @param {Array} posts - An array of post objects from posts.json.
   */
  function renderBlogList(posts) {
    blogList.innerHTML = ""; // Clear existing list

    posts.forEach((post) => {
      // Create an anchor tag <a> instead of a div
      const cardLink = document.createElement("a");

      // Set the href to point to post.html with the file as a parameter
      cardLink.href = `post.html?file=${post.file}`;

      // The `target="_blank"` attribute has been removed. Links will now open in the same tab by default.

      // Apply the card styling directly to the link
      cardLink.className =
        "block rounded-2xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-lg shadow-lg border border-slate-200 dark:border-slate-700 p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-1";

      // Set the inner content of the card
      cardLink.innerHTML = `
        <h3 class="font-bold text-lg text-teal-700 dark:text-teal-300">${post.title}</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">${post.date}</p>
        <p class="text-base text-slate-600 dark:text-slate-300 mt-3">${post.summary}</p>
      `;

      blogList.appendChild(cardLink);
    });
  }

  // Initial load
  loadPosts();
});
