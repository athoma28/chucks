let comics = [];
let metadata = [];
let searchIndex = [];

async function loadComics() {
  const res = await fetch("data.json");
  if (!res.ok) throw new Error("Failed to load comics");
  comics = await res.json();
  return comics;
}

async function loadMetadata() {
  const res = await fetch("comic_metadata.json");
  if (!res.ok) throw new Error("Failed to load metadata");
  metadata = await res.json();
  return metadata;
}

async function loadSearchIndex() {
  const res = await fetch("search_index.json");
  if (!res.ok) throw new Error("Failed to load search index");
  searchIndex = await res.json();
}

function getSortState() {
  const params = new URLSearchParams(location.search);
  return {
    sort: params.get("sort") || "name",
    order: params.get("order") || "asc",
  };
}

function setSortState(sort, order) {
  const url = new URL(location);
  url.searchParams.set("sort", sort);
  url.searchParams.set("order", order);
  history.replaceState(null, "", url);
}

function sortComics(list, sort, order) {
  const sorted = [...list];
  if (sort === "name") {
    sorted.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  } else {
    sorted.sort((a, b) => a.id - b.id);
  }
  if (order === "desc") sorted.reverse();
  return sorted;
}

function renderGrid(comics, container) {
  container.innerHTML = comics
    .map(
      (c) => `
    <a class="comic-card" href="comic.html?id=${c.id}">
      <img src="${c.panels[0]}" alt="${c.title}" loading="lazy">
      <div class="title">${c.title} (#${c.id})</div>
    </a>`
    )
    .join("");
}

function renderSortControls(container, currentSort, currentOrder) {
  container.innerHTML = `
    <div class="sort-controls">
      <span class="sort-label">Sort by:</span>
      <button class="sort-btn${currentSort === "name" ? " active" : ""}" data-sort="name">
        Name <span class="sort-arrow" style="visibility:${currentSort === "name" ? "visible" : "hidden"}">${currentOrder === "asc" ? "\u2191" : "\u2193"}</span>
      </button>
      <button class="sort-btn${currentSort === "number" ? " active" : ""}" data-sort="number">
        Number <span class="sort-arrow" style="visibility:${currentSort === "number" ? "visible" : "hidden"}">${currentOrder === "asc" ? "\u2191" : "\u2193"}</span>
      </button>
    </div>
  `;

  container.querySelectorAll(".sort-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sort = btn.dataset.sort;
      let order = "asc";
      if (sort === currentSort) {
        order = currentOrder === "asc" ? "desc" : "asc";
      }
      setSortState(sort, order);
      const sorted = sortComics(comics, sort, order);
      renderGrid(sorted, document.getElementById("comics-grid"));
      renderSortControls(container, sort, order);
    });
  });
}

function renderRandomButton(container) {
  const btn = document.createElement("button");
  btn.className = "random-btn";
  btn.textContent = "Random Comic";
  btn.addEventListener("click", () => {
    const randomId = Math.floor(Math.random() * comics.length) + 1;
    location.href = `comic.html?id=${randomId}`;
  });
  container.appendChild(btn);
}

function doSearch(query, mode) {
  if (!query.trim()) {
    document.getElementById("search-results").classList.remove("open");
    return;
  }
  const q = query.toLowerCase();
  const results = searchIndex
    .map(entry => {
      const field = mode === "dialogue" ? entry.dialogue : entry.topic;
      const idx = field.toLowerCase().indexOf(q);
      if (idx === -1) return null;
      const snippet = field.slice(Math.max(0, idx - 40), idx + q.length + 60) + (idx + q.length + 60 < field.length ? "..." : "");
      return { id: entry.id, title: entry.title, snippet };
    })
    .filter(Boolean)
    .slice(0, 15);

  const container = document.getElementById("search-results");
  if (!results.length) {
    container.innerHTML = `<div class="search-result-item" style="color:#999">No results found</div>`;
  } else {
    container.innerHTML = results
      .map(r => `
        <a class="search-result-item" href="comic.html?id=${r.id}">
          <strong>${r.title} (#${r.id})</strong>
          <div class="highlight">${r.snippet}</div>
        </a>
      `).join("");
  }
  container.classList.add("open");
}

function setupSearch() {
  const input = document.getElementById("search-input");
  const results = document.getElementById("search-results");
  let mode = "topic";

  document.querySelectorAll(".search-mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".search-mode-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      mode = btn.dataset.mode;
      doSearch(input.value, mode);
    });
  });

  input.addEventListener("input", () => doSearch(input.value, mode));
  input.addEventListener("focus", () => {
    if (input.value.trim()) doSearch(input.value, mode);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrapper")) {
      results.classList.remove("open");
    }
  });
}

function setupIndexPage() {
  const grid = document.getElementById("comics-grid");
  const controls = document.getElementById("sort-controls");
  const randomZone = document.getElementById("random-button");

  Promise.all([loadComics(), loadSearchIndex()])
    .then(() => {
      setupSearch();
      const { sort, order } = getSortState();
      const sorted = sortComics(comics, sort, order);
      renderGrid(sorted, grid);
      renderSortControls(controls, sort, order);
      renderRandomButton(randomZone);
    })
    .catch((err) => {
      grid.innerHTML = `<div class="error">${err.message}</div>`;
    });
}

function renderComicViewer(comic, container) {
  const meta = metadata.find(m => m.id === comic.id);

  const navPrev = comic.id > 1
    ? `<a href="comic.html?id=${comic.id - 1}">\u2190 Previous</a>`
    : `<span class="disabled">\u2190 Previous</span>`;

  const navNext = comic.id < comics.length
    ? `<a href="comic.html?id=${comic.id + 1}">Next \u2192</a>`
    : `<span class="disabled">Next \u2192</span>`;

  const panelsHtml = comic.panels
    .map((p, i) => `<img src="${p}" alt="${comic.altText[i] || comic.title}" loading="lazy">`)
    .join("");

  const themeHtml = comic.theme
    ? `<div class="comic-meta">${comic.theme}</div>`
    : "";

  const transcriptBtn = meta && meta.transcript
    ? `<button class="transcript-btn" id="transcript-btn">View Transcript</button>`
    : "";

  const relatedHtml = comic.related && comic.related.length
    ? `
    <div class="related-section">
      <h2>Related Comics</h2>
      <div class="related-grid">
        ${comic.related
          .map((r) => {
            const rc = comics.find((c) => c.id === r.id);
            if (!rc) return "";
            return `
            <a class="related-card" href="comic.html?id=${rc.id}">
              <img src="${rc.panels[0]}" alt="${rc.title}" loading="lazy">
              <div class="title">${rc.title} (#${rc.id})</div>
            </a>`;
          })
          .join("")}
      </div>
    </div>`
    : "";

  const origHref = comic.href;

  container.innerHTML = `
    <a class="back-link" href="index.html">\u2190 All Comics</a>
    <h1>${comic.title} (#${comic.id})</h1>
    ${themeHtml}
    <div class="comic-panels ${comic.layout}">
      ${panelsHtml}
    </div>
    ${transcriptBtn}
    <div class="comic-nav">
      ${navPrev}
      <span>${comic.id} / ${comics.length}</span>
      <a href="#" id="random-link" style="color:#009933;font-weight:bold">Random</a>
      ${navNext}
    </div>
    <div class="comic-footer">
      View the original at <a href="${origHref}" target="_blank">ChucksConnection.com</a><br>
      \u00a9 2009, 2022 The ChucksConnection, a division of Hal Peterson Media Services.
    </div>
    ${relatedHtml}
  `;
}

function setupComicPage() {
  const params = new URLSearchParams(location.search);
  const id = parseInt(params.get("id"), 10);
  const container = document.getElementById("comic-viewer");

  if (!id) {
    container.innerHTML = `<div class="error">No comic specified</div>`;
    return;
  }

  Promise.all([loadComics(), loadMetadata()])
    .then(() => {
      const comic = comics.find((c) => c.id === id);
      if (!comic) {
        container.innerHTML = `<div class="error">Comic not found</div>`;
        return;
      }
      renderComicViewer(comic, container);
      document.title = `${comic.title} (#${comic.id}) - The Chucks Life`;

      document.getElementById("random-link").addEventListener("click", (e) => {
        e.preventDefault();
        let randomId;
        do {
          randomId = Math.floor(Math.random() * comics.length) + 1;
        } while (randomId === comic.id);
        location.href = `comic.html?id=${randomId}`;
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft" && comic.id > 1) {
          location.href = `comic.html?id=${comic.id - 1}`;
        } else if (e.key === "ArrowRight" && comic.id < comics.length) {
          location.href = `comic.html?id=${comic.id + 1}`;
        }
      });

      const transcriptBtn = document.getElementById("transcript-btn");
      const overlay = document.getElementById("drawer-overlay");
      const drawer = document.getElementById("drawer");
      const drawerBody = document.getElementById("drawer-body");
      const drawerClose = document.getElementById("drawer-close");

      if (transcriptBtn && overlay && drawer && drawerBody) {
        const meta = metadata.find(m => m.id === comic.id);
        drawerBody.textContent = meta ? meta.transcript : "";

        const openDrawer = () => {
          overlay.classList.add("open");
          drawer.classList.add("open");
        };
        const closeDrawer = () => {
          overlay.classList.remove("open");
          drawer.classList.remove("open");
        };

        transcriptBtn.addEventListener("click", openDrawer);
        drawerClose.addEventListener("click", closeDrawer);
        overlay.addEventListener("click", closeDrawer);
      }
    })
    .catch((err) => {
      container.innerHTML = `<div class="error">${err.message}</div>`;
    });
}
