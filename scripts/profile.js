// Blog logic for loading and rendering Markdown posts
const blogList = document.getElementById("blog-list");
const blogPost = document.getElementById("blog-post");
const backToList = document.getElementById("back-to-list");

async function loadPosts() {
  try {
    const res = await fetch("posts/posts.json");
    const posts = await res.json();
    renderBlogList(posts);
  } catch (e) {
    blogList.innerHTML =
      '<p class="text-red-500">Failed to load blog posts.</p>';
  }
}

function renderBlogList(posts) {
  blogList.innerHTML = "";
  posts.forEach((post) => {
    const div = document.createElement("div");
    div.className =
      "p-4 bg-white rounded shadow hover:bg-gray-100 cursor-pointer";
    div.innerHTML = `<h3 class='text-xl font-bold mb-1'>${post.title}</h3><p class='text-gray-500 text-sm'>${post.date}</p><p class='text-gray-700 mt-2'>${post.summary}</p>`;
    div.onclick = () => showPost(post);
    blogList.appendChild(div);
  });
  blogList.classList.remove("hidden");
  blogPost.classList.add("hidden");
  backToList.classList.add("hidden");
}

async function showPost(post) {
  try {
    const res = await fetch(`posts/${post.file}`);
    const md = await res.text();
    blogPost.innerHTML = marked.parse(md);
    blogList.classList.add("hidden");
    blogPost.classList.remove("hidden");
    backToList.classList.remove("hidden");
    window.scrollTo({ top: blogPost.offsetTop - 40, behavior: "smooth" });
  } catch (e) {
    blogPost.innerHTML = '<p class="text-red-500">Failed to load post.</p>';
  }
}

backToList.onclick = () => {
  loadPosts();
};

// Initial load
loadPosts();
