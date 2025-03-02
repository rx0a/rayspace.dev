/*!
  script.js v1.2
  (c) 2023 rx0a
 */
  let isPageFirstLoaded = true;
  const root = "https://rayspace.dev";
  const navLinks = document.querySelectorAll(".sidenav .sidenav-link");
  const highlight = document.createElement("span");
  highlight.classList.add("highlight");
  document.querySelector(".sidenav").append(highlight);
  async function fetchTotalViews() {
    try {
      const response = await fetch("/api/posts");
      if (!response.ok) {
        throw new Error("Failed to fetch total views.");
      }
      const data = await response.json();
      const totalViews = data.reduce((sum, post) => sum + post.views, 0);
      const blogViewsElement = document.querySelector("#blogViewsCount");
      blogViewsElement.textContent = `${totalViews.toLocaleString()} blog views all time`;
    } catch (error) {
      console.error(error);
    }
  }
  async function fetchRecentSignee() {
    try {
      const response = await fetch("/api/comments");
      if (!response.ok) {
        throw new Error("Failed to fetch recent signee.");
      }
      const data = await response.json();
      data.sort((a, b) => b.id - a.id);
      const recentSigneeName = data[0].name;
      const recentSigneeElement = document.querySelector("#recentSignee");
      recentSigneeElement.textContent = `Recent signee: ${recentSigneeName}`;
    } catch (error) {
      console.error(error);
    }
  }
  async function fetchGithubStars() {
    try {
      const response = await fetch("/api/github_stars");
      if (!response.ok) {
        throw new Error("Failed to fetch Github stars.");
      }
      const data = await response.json();
      const stars = data.stars;
      const githubStarsElement = document.querySelector("#githubStars");
      githubStarsElement.textContent = `${stars} stars on this repo`;
    } catch (error) {
      console.error(error);
      const githubStarsElement = document.querySelector("#githubStars");
      githubStarsElement.textContent = `0 stars on this repo`;
    }
  }
  async function handleSubmit(event) {
    event.preventDefault();
    let commentInput = document.getElementById("comment-input");
    let commentText = commentInput.value.trim();
    if (commentText === "") {
      return;
    }
    commentText = DOMPurify.sanitize(commentText);
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: commentText }),
      });
      if (!response.ok) {
        throw new Error("Failed to submit comment.");
      }
      const data = await response.json();
      fetchGuestbookComments();
      commentInput.value = "";
    } catch (error) {
      console.error(error);
    }
  }
  async function fetchUserStatus() {
    const response = await fetch("/api/user_status");
    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      console.error("Failed to fetch user status.");
      return null;
    }
  }
  async function logout() {
    const response = await fetch("/auth/logout", { method: "POST" });
    if (response.ok) {
      document.querySelector(".sign-out-button").classList.add("hidden");
      document.querySelector(".input-container").classList.add("hidden");
      document.querySelector(".github-signin").classList.remove("hidden");
    } else {
      console.error("Failed to log out.");
    }
  }
  async function fetchMetadataAndSetActiveLink(currentUrl) {
    const response = await fetch("/api/posts");
    const data = await response.json();
    const blogPosts = data;
    const blogPostPaths = blogPosts.map(
      (post) => `/blog/${convertToDashed(post.title)}`
    );
    let activeLink;
    if (blogPostPaths.includes(currentUrl)) {
      activeLink = document.querySelector(`.sidenav .sidenav-link[href="/blog"]`);
    } else {
      activeLink = document.querySelector(
        `.sidenav .sidenav-link[href="${currentUrl}"]`
      );
    }
    if (activeLink) {
      activeLink.classList.add("active");
      highlightLink.call(activeLink);
    }
    loadPage(currentUrl);
    isPageFirstLoaded = false;
  }
  window.onload = () => {
    const currentUrl = getCurrentUrl();
    if (currentUrl.startsWith("/blog")) {
      fetchMetadataAndSetActiveLink(currentUrl);
    } else {
      let currentLink;
      if (currentUrl === "/resume") {
        currentLink = document.querySelector(
          `.sidenav .sidenav-link[href="/about"]`
        );
      } else {
        currentLink = document.querySelector(
          `.sidenav .sidenav-link[href="${currentUrl}"]`
        );
      }
      if (currentLink) {
        currentLink.classList.add("active");
        highlightLink.call(currentLink);
      }
      loadPage(currentUrl);
      isPageFirstLoaded = false;
    }
  };
  window.addEventListener("popstate", () => {
    const currentUrl = getCurrentUrl();
    navLinks.forEach((link) => link.classList.remove("active"));
    if (currentUrl.startsWith("/blog")) {
      fetchMetadataAndSetActiveLink(currentUrl);
    } else {
      let newActiveLink;
      if (currentUrl === "/resume") {
        newActiveLink = document.querySelector(
          `.sidenav .sidenav-link[href="/about"]`
        );
      } else {
        newActiveLink = document.querySelector(
          `.sidenav .sidenav-link[href="${currentUrl}"]`
        );
      }
      if (newActiveLink) {
        newActiveLink.classList.add("active");
        highlightLink.call(newActiveLink);
      }
      loadPage(currentUrl);
    }
  });
  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      navLinks.forEach((link) => link.classList.remove("active"));
      link.classList.add("active");
      const href = link.getAttribute("href");
      history.pushState(null, null, href);
      if (href === "/home") {
        history.replaceState(null, null, "/");
      }
      loadPage(href);
      const currentPath = window.location.pathname;
      if (currentPath === "/404") {
        highlight.style.display = "none";
      } else {
        highlight.style.display = "block";
        highlightLink.call(link);
      }
    });
  });
  function getCurrentUrl() {
    const path = window.location.pathname;
    const url = path === "/" ? "/home" : path;
    return url;
  }
  async function loadPage(page) {
    try {
      const currentPath = page || window.location.pathname;
      if (currentPath.startsWith("/blog")) {
        const response = await fetch("/api/posts");
        if (!response.ok) {
          throw new Error("Failed to fetch blog posts");
        }
        const blogPosts = await response.json();
        const blogPostPaths = blogPosts.map(
          (post) => `/blog/${convertToDashed(post.title)}`
        );
        if (blogPostPaths.includes(currentPath)) {
          const postIndex = blogPostPaths.indexOf(currentPath);
          const postId = blogPosts[postIndex].id;
          const htmlResponse = await fetch(`/posts/${postId}.html`);
          if (!htmlResponse.ok) {
            throw new Error("Failed to fetch post HTML");
          }
          const html = await htmlResponse.text();
          document.querySelector(".content").innerHTML = html;
          hljs.highlightAll();
          fetchMetadata();
          updateViews(blogPosts[postIndex].id);
        } else {
          loadPageContent(currentPath);
        }
      } else {
        loadPageContent(currentPath);
      }
      // if (currentPath === "/guestbook") {
      //   fetchGuestbookComments();
      // }
    } catch (error) {
      console.error(error);
    }
  }
  async function fetchGuestbookComments() {
    try {
      const response = await fetch("/api/comments");
      if (!response.ok) {
        throw new Error("Failed to fetch guestbook comments");
      }
      const comments = await response.json();
      if (Array.isArray(comments)) {
        displayComments(comments);
      }
    } catch (error) {
      console.error(error);
    }
  }
  function displayComments(comments) {
    const guestbookContainer = document.querySelector(".guestbook-comments");
    guestbookContainer.innerHTML = "";
    [...comments].forEach((comment) => {
      const commentElement = document.createElement("p");
      commentElement.classList.add("comment");
      const nameElement = document.createElement("span");
      nameElement.classList.add("comment-name");
      nameElement.textContent = `${comment.name}: `;
      const messageElement = document.createElement("span");
      messageElement.classList.add("comment-message");
      messageElement.textContent = comment.comment;
      commentElement.appendChild(nameElement);
      commentElement.appendChild(messageElement);
      guestbookContainer.appendChild(commentElement);
    });
  }
  async function updateViews(postId) {
    try {
      const response = await fetch(`/api/update_views/${postId}`, {
        method: "PUT",
      });
      if (!response.ok) {
        throw new Error(`Failed to update views for post ID: ${postId}`);
      }
    } catch (error) {
      console.error(error);
    }
  }
  function loadPageContent(currentPath) {
    const pages = {
      "/": "./pages/home.html",
      "/home": "./pages/home.html",
      "/about": "./pages/about.html",
      "/guestbook": "./pages/guestbook.html",
      "/blog": "./pages/blog.html",
      "/resume": "./pages/resume.html",
      "/404": "./pages/404.html",
    };
    if (pages[currentPath]) {
      fetch(pages[currentPath])
        .then((response) => response.text())
        .then((html) => {
          document.querySelector(".content").innerHTML = html;
          if (currentPath === "/404") {
            var quotes = document.querySelectorAll("blockquote");
            var randomIndex = Math.floor(Math.random() * quotes.length);
            for (var i = 0; i < quotes.length; i++) {
              if (i === randomIndex) {
                quotes[i].style.display = "block";
              } else {
                quotes[i].style.display = "none";
              }
            }
          }
          updateMetaTitle(capitalize(currentPath.replace("/", "")));
          if (currentPath === "/blog") {
            const blogLinks = document.querySelectorAll(".post-link");
            blogLinks.forEach((link) => {
              link.addEventListener("click", handleBlogLinkClick);
            });
          }
          const homeLinks = document.querySelectorAll(".home-link");
          homeLinks.forEach((link) => {
            link.addEventListener("click", (event) => {
              event.preventDefault();
              const associatedSidenavLink = document.querySelector(
                `.sidenav-link[href="${link.getAttribute("href")}"]`
              );
              if (associatedSidenavLink) {
                associatedSidenavLink.click();
              }
            });
          });
          highlightLink.call(
            document.querySelector(".sidenav .sidenav-link.active")
          );
          if (currentPath === "/about") {
            document.querySelector(".content").innerHTML = html;
            let resumeLink = document.querySelector(".resume-link");
            if (resumeLink) {
              resumeLink.addEventListener("click", (event) => {
                event.preventDefault();
                loadPage("/resume");
                const href = resumeLink.getAttribute("href");
                history.pushState(null, null, href);
              });
            }
          }
          if (currentPath === "/home" || currentPath === "/") {
            fetchGithubStars();
            fetchTotalViews();
            fetchRecentSignee();
          }
          if (currentPath === "/guestbook") {
            const input = document.querySelector(".input-container");
            const signout = document.querySelector(".sign-out-button");
            const signin = document.querySelector(".github-signin");
            fetchUserStatus().then((user) => {
              if (user.authenticated) {
                input.classList.remove("hidden");
                signout.classList.remove("hidden");
                signin.classList.add("hidden");
                let form = document.getElementById("comment-form");
                if (form) {
                  form.addEventListener("submit", handleSubmit);
                }
              } else {
                input.classList.add("hidden");
                signout.classList.add("hidden");
                signin.classList.remove("hidden");
              }
            });
            fetchGuestbookComments();
          }
          if (currentPath === "/blog") {
            fetchMetadata();
          }
        })
        .catch((error) => {});
    } else {
      window.location.href = "/404";
    }
  }
  function handleGithubSignIn(e) {
    e.preventDefault();
    window.location.href = "/auth/start_github_oauth";
  }
  function handleBlogLinkClick(event) {
    event.preventDefault();
    const href = this.getAttribute("href");
    history.pushState(null, null, href);
    loadPage(href);
  }
  function highlightLink() {
    const {
      width: width,
      height: height,
      top: top,
      left: left,
    } = this.getBoundingClientRect();
    const containerRect = highlight.parentNode.getBoundingClientRect();
    Object.assign(highlight.style, {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${left - containerRect.left}px, ${
        top - containerRect.top
      }px)`,
      opacity: isPageFirstLoaded ? 0 : 1,
      transition: isPageFirstLoaded
        ? "none"
        : "transform 0.2s, width 0.2s, height 0.2s",
    });
    if (isPageFirstLoaded) {
      setTimeout(() => {
        highlight.style.opacity = 1;
      }, 100);
    }
  }
  window.addEventListener("resize", () => {
    highlightLink.call(document.querySelector(".sidenav .sidenav-link.active"));
  });
  async function fetchMetadata() {
    try {
      const response = await fetch("/api/posts");
      if (!response.ok) {
        throw new Error("Network response was not ok.");
      }
      const data = await response.json();
      data.sort((a, b) => a.id - b.id);
      const blogPostTitles = data.map((post) => post.title);
      const blogPostPaths = blogPostTitles.map(
        (title) => `/blog/${convertToDashed(title)}`
      );
      const currentPath = getCurrentUrl();
      if (currentPath === "/blog") {
        const blogList = document.querySelector(".posts");
        blogList.innerHTML = "";
        data.forEach((post, index) => {
          const postTitle = document.createElement("p");
          postTitle.classList.add("post-link");
          postTitle.textContent = post.title;
          const postViews = document.createElement("p");
          postViews.classList.add("post-views");
          postViews.textContent = `${post.views.toLocaleString()} views`;
          const postDivider = document.createElement("div");
          postDivider.classList.add("post-divider");
          const listItem = document.createElement("a");
          listItem.classList.add("post-list-item");
          listItem.appendChild(postTitle);
          listItem.appendChild(postViews);
          listItem.appendChild(postDivider);
          listItem.href = blogPostPaths[index];
          listItem.addEventListener("click", handleBlogLinkClick);
          blogList.appendChild(listItem);
        });
      } else if (blogPostPaths.includes(currentPath)) {
        const postIndex = blogPostPaths.indexOf(currentPath);
        const postTitle = blogPostTitles[postIndex];
        const titleElements = document.querySelectorAll(".post-title");
        titleElements.forEach((element) => {
          element.textContent = postTitle;
        });
        const postInfoContainer = document.createElement("div");
        postInfoContainer.classList.add("post-info-container");
        const postDate = document.createElement("span");
        postDate.classList.add("post-date");
        postDate.textContent = data[postIndex].published_date;
        const postViews = document.createElement("span");
        postViews.classList.add("post-views");
        postViews.textContent = `${data[postIndex].views.toLocaleString()} views`;
        const line = document.createElement("hr");
        line.classList.add("post-info-line");
        postInfoContainer.appendChild(postDate);
        postInfoContainer.appendChild(line);
        postInfoContainer.appendChild(postViews);
        const contentContainer = document.querySelector(".content");
        const titleElement = document.querySelector(".post-title");
        titleElement.parentNode.insertBefore(
          postInfoContainer,
          titleElement.nextSibling
        );
        updateMetaTitle(postTitle);
        const description = document
          .getElementById("content")
          .getElementsByTagName("p")[0].textContent;
        updateOGTags(postTitle, description, root + currentPath, "article", "");
      }
    } catch (error) {
      console.error(`Fetch operation failed: ${error.message}`);
    }
  }
  function convertToDashed(sentence) {
    return sentence.toLowerCase().replace(/\s+/g, "-");
  }
  function capitalize(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }
  function updateMetaTitle(newTitle) {
    const metaTitle = document.querySelector("title");
    const title = "Ray Space";
    const description = "Full-Stack Software Engineer";
    const url = root;
    const type = "website";
    if (newTitle !== "Home") {
      metaTitle.text = newTitle + " | Ray Space";
    } else {
      metaTitle.text = title;
    }
    updateOGTags(title, description, url, type);
  }
  function updateOGTags(title, description, url, type) {
    document
      .querySelector('meta[name="description"]')
      .setAttribute("content", description);
    document
      .querySelector('meta[property="og:title"]')
      .setAttribute("content", title);
    document
      .querySelector('meta[property="og:description"]')
      .setAttribute("content", description);
    document
      .querySelector('meta[property="og:url"]')
      .setAttribute("content", url);
    document
      .querySelector('meta[property="og:type"]')
      .setAttribute("content", type);
    document
      .querySelector('meta[name="twitter:title"]')
      .setAttribute("content", title);
    document
      .querySelector('meta[name="twitter:description"]')
      .setAttribute("content", description);
  }
  function copyToClipboard() {
    const textarea = document.createElement("textarea");
    textarea.textContent = document.getElementById("code").textContent;
    textarea.style.position = "fixed";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } catch (ex) {
      return false;
    } finally {
      document.body.removeChild(textarea);
      document.getElementById("copy-icon").style.opacity = "0";
      document.getElementById("checkmark-icon").style.opacity = "1";
      setTimeout(function () {
        document.getElementById("copy-icon").style.opacity = "1";
        document.getElementById("checkmark-icon").style.opacity = "0";
      }, 2e3);
    }
  }
  