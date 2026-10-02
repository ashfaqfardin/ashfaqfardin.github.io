// Renders the notes index (notes.html) from posts/posts.json.
document.addEventListener("DOMContentLoaded", () => {
  const blogList = document.getElementById("notes-list");
  if (!blogList) return;
  const { icon, escapeHtml, reveal, stagger } = window.Site;

  /**
   * Renders the list of note preview cards as links that open post.html in the same tab.
   * @param {Array} posts - An array of post objects from posts.json.
   */
  function renderBlogList(posts) {
    blogList.innerHTML = posts
      .map(
        (post) => `
        <a class="note" href="post.html?file=${encodeURIComponent(post.file)}" data-reveal>
          <div class="note__thumb">
            <img src="${escapeHtml(post.thumbnail)}" alt="${escapeHtml(post.title)}" loading="lazy" />
          </div>
          <div class="note__meta">
            <span class="label">${escapeHtml(post.date)}</span>
            <span class="chip chip--sm">${icon("arrow-up-right")}</span>
          </div>
          <h2 class="heading-m">${escapeHtml(post.title)}</h2>
          <p class="body-s note__summary">${escapeHtml(post.summary)}</p>
        </a>`
      )
      .join("");

    const count = document.getElementById("notes-count");
    if (count) count.textContent = `(${String(posts.length).padStart(2, "0")})`;
    stagger(blogList.children, 110);
    reveal(blogList);
  }

  fetch("posts/posts.json")
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json();
    })
    .then(renderBlogList)
    .catch((e) => {
      console.error("Failed to load blog posts:", e);
      blogList.innerHTML = '<p class="empty-state">Failed to load blog posts.</p>';
    });
});
