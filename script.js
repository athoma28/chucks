let comics = [];

async function loadComics() {
  const res = await fetch("data.json");
  if (!res.ok) throw new Error("Failed to load comics");
  comics = await res.json();
  return comics;
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
      <button class="sort-btn${currentSort === "name" ? " active" : ""}" data-sort="name">
        Name ${currentSort === "name" ? (currentOrder === "asc" ? "↑" : "↓") : ""}
      </button>
      <button class="sort-btn${currentSort === "number" ? " active" : ""}" data-sort="number">
        Number ${currentSort === "number" ? (currentOrder === "asc" ? "↑" : "↓") : ""}
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

function setupIndexPage() {
  const grid = document.getElementById("comics-grid");
  const controls = document.getElementById("sort-controls");
  const randomZone = document.getElementById("random-button");

  loadComics()
    .then(() => {
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
  const navPrev = comic.id > 1
    ? `<a href="comic.html?id=${comic.id - 1}">← Previous</a>`
    : `<span class="disabled">← Previous</span>`;

  const navNext = comic.id < comics.length
    ? `<a href="comic.html?id=${comic.id + 1}">Next →</a>`
    : `<span class="disabled">Next →</span>`;

  const panelsHtml = comic.panels
    .map((p, i) => `<img src="${p}" alt="${comic.altText[i] || comic.title}" loading="lazy">`)
    .join("");

  const themeHtml = comic.theme
    ? `<div class="comic-meta">${comic.theme}</div>`
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

  // Extract base href from the original comic URL
  const origHref = comic.href;

  container.innerHTML = `
    <a class="back-link" href="index.html">← All Comics</a>
    <h1>${comic.title} (#${comic.id})</h1>
    ${themeHtml}
    <div class="comic-panels ${comic.layout}">
      ${panelsHtml}
    </div>
    <div class="comic-nav">
      ${navPrev}
      <span>${comic.id} / ${comics.length}</span>
      <a href="#" id="random-link" style="color:#009933;font-weight:bold">Random</a>
      ${navNext}
    </div>
    <div class="comic-footer">
      View the original at <a href="${origHref}" target="_blank">ChucksConnection.com</a><br>
      © 2009, 2022 The ChucksConnection, a division of Hal Peterson Media Services.
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

  loadComics()
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
    })
    .catch((err) => {
      container.innerHTML = `<div class="error">${err.message}</div>`;
    });
}
