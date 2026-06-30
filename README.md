# chucks

A browsable GitHub Pages interface for [The Chucks Life](https://chucksconnection.com/comicstrip.html) webcomic.

## Project Plan

### Phase 1: Scrape comic metadata

Write a one-shot Node.js (or Python) script to:

1. Fetch `comicstrip.html` and extract every comic entry — title + `href` (e.g., `comicstrip25.html`). Strip the leading "The " for sort-key generation.
2. For each comic, fetch its page and extract image `src` attributes matching `comics/strip*.jpg`. These give us the actual panel filenames (e.g., `strip25a.jpg`, `strip25b.jpg`).
3. Check for continuation pages — many strips have a "next page" link to `strip{N}a.html` that holds C/D panels. Multi-page strips (43a→43b, 44a→44b) need to be unified into a single comic entry.
4. Build a JSON record per comic:
   ```json
   {
     "id": 25,
     "title": "At the Beach",
     "sortKey": "at the beach",
     "slug": "at-the-beach",
     "href": "comicstrip25.html",
     "panels": [
       "https://chucksconnection.com/comics/strip25a.jpg",
       "https://chucksconnection.com/comics/strip25b.jpg"
     ],
     "layout": "horizontal"  // or "vertical"
   }
   ```
   - `layout`: `"horizontal"` for 1–2 panels, `"vertical"` for 3–4 panels.
5. Output `data.json` — this gets baked into the GitHub Pages site as a static asset.

**Implementation notes:**
- The scrape is manual/one-shot but should be deterministic. Keep the script in the repo at `scripts/scrape.js` for reproducibility.
- Some image URLs use relative paths; normalize to absolute.
- Strips 43 (Spring Fever) and 44 (The Well Worn Pair) span multiple HTML pages (`43a→43b`, `44a→44b`). Collapse these into single comic entries with 2 panels each.
- Handle the rotating strip links (hint: they're `<a>` tags directly under `<body>` between the banner and the footer nav, not inside any wrapping `<ul>` — just parse all `<a>` whose `href` matches `/comicstrip\d+[a-z]?\.html/`).

### Phase 2: GitHub Pages site structure

```
chucks/
├── index.html          # Browse page — sortable, filterable comic grid
├── comic.html          # Single-page comic viewer (query param: ?id=25)
├── data.json           # Scraped comic metadata (loaded at runtime)
├── style.css           # All styling
├── script.js           # Shared JS (data loading, sorting, rendering)
└── scripts/
    └── scrape.js       # One-time scrape tool
```

**Why `comic.html?id=N` instead of static HTML per strip?** 40+ static pages would be tedious to regenerate if data changes. A single template page that reads `data.json` + URL params is cleaner and still fully client-side — no build step needed for GitHub Pages.

### Phase 3: Index page (`index.html`)

**Layout:**
- A responsive CSS grid of comic cards. Each card shows the comic title and layout hint (horizontal vs vertical) or a small inline thumbnail of the first panel.
- Above the grid: sort controls.

**Sort controls (in-browser, no page reload):**
- **Sort by name** — alphabetical sort on `sortKey` (strips leading "The"). Click once = A→Z, again = Z→A.
- **Sort by number** — sort by numeric `id`. Click once = 1→44, again = 44→1.
- Active sort indicator (highlighted button).

**Implementation notes:**
- `data.json` is fetched via `fetch()` on page load and rendered client-side.
- Sorting re-renders the DOM; no virtual DOM library needed — just `Array.sort()` + `innerHTML` on a container.
- Thin thumbnail preview: use `https://chucksconnection.com/comics/strip{id}a.jpg` as a small image in each card (150px wide). This is a hotlink but the user explicitly said to hotlink.

### Phase 4: Comic viewer page (`comic.html`)

**Features:**
- Reads `?id=N` from URL, loads matching comic from `data.json`.
- Displays all panels:
  - **Horizontal layout** (1–2 panels): flexbox row, images side by side.
  - **Vertical layout** (3–4 panels): flexbox column, images stacked top to bottom.
- Shows comic title as `<h1>`.
- Prev / Next comic navigation links (wraps around at ends).
- "Back to all comics" link to `index.html`.

**Image sizing:**
- Max width per panel: `min(100%, 600px)` so they don't get comically large on wide screens.
- Maintain aspect ratio with `height: auto`.

### Phase 5: Polish & UX

- Loading state while `data.json` fetches.
- Error state if comic `id` not found.
- Keyboard navigation: left/right arrows for prev/next on the viewer page.
- Responsive: single column on mobile (all panels stack vertically regardless of layout).
- URL `?sort=name&order=asc` persistence so the sort state is shareable/bookmarkable.

### Stretch Goal: Related comics (via SigLIP 2 image embeddings + page dialogue/tags)

**Dual-signal similarity approach:**

Combine two complementary signals to find related comics — visual similarity between panels and semantic tags extracted from the page text. Both are computed offline in a Python script and baked into `data.json`.

#### Signal A: SigLIP 2 image embeddings

Use [SigLIP 2](https://huggingface.co/papers/2502.14786) (`google/siglip2-base-patch16-224`) from HuggingFace transformers to encode each panel image into a vector, average per comic, then compute cosine similarity.

SigLIP 2 is the successor to CLIP and SigLIP — it uses a pairwise sigmoid loss, adds captioning pretraining, self-distillation, masked prediction losses, and supports multiple resolutions and native aspect ratios. It outperforms SigLIP at all model scales on zero-shot classification, retrieval, and VLM transfer.

```python
from transformers import AutoModel, AutoProcessor
from transformers.image_utils import load_image
import torch

model = AutoModel.from_pretrained("google/siglip2-base-patch16-224")
processor = AutoProcessor.from_pretrained("google/siglip2-base-patch16-224")

panels = [
    "https://chucksconnection.com/comics/strip6a.jpg",
    "https://chucksconnection.com/comics/strip6b.jpg",
]
inputs = processor(images=[load_image(p) for p in panels], return_tensors="pt")

with torch.no_grad():
    embeddings = model.get_image_features(**inputs)  # shape: (N, 768)

comic_embedding = embeddings.mean(dim=0)  # average all panels
```

Available model variants (all Apache 2.0 on HuggingFace):

| Model | Params | Notes |
|---|---|---|
| `google/siglip2-base-patch16-224` | 86M (ViT-B) | Sweet spot — fast, good quality |
| `google/siglip2-base-patch16-512` | 86M | Higher resolution, better detail |
| `google/siglip2-large-patch16-384` | 303M (ViT-L) | Better quality, slower |
| `google/siglip2-so400m-patch14-384` | 400M | Best quality per paper |
| `google/siglip2-base-patch16-naflex` | 86M | Native aspect ratio (no crop/pad) |

**Recommendation:** Start with `siglip2-base-patch16-224`. It's 0.4B parameters, fast on CPU for batch inference, and more than adequate for ~200 images. If you notice poor results on visually similar but semantically different comics, try the naflex variant (preserves original aspect ratio, important for comics with varied panel sizes) or `large-patch16-384`.

#### Signal B: Dialogue & tags from page text

Each comic's HTML page contains a `<title>` tag, an `<h1>` title, alt text on images (e.g., `"Love At First Sight comic part 1"`), and a body text paragraph with a thematic description (e.g., `"Get a pair of orange or black chucks for Halloween"`). These aren't rich, but they provide useful semantic signal.

The scrape script (Phase 1) can already extract these from the HTML. Extend it to capture:
- **Title** (from `<h1>` / `<title>`)
- **Image alt text** (from each panel `<img alt="...">`)
- **Theme sentence** (the `<p>` or text after the comic panels — often a selling line like "Improve your basketball game with a new pair of chucks")
- **Manual tags** (inferred from title keywords: e.g., "New Year" → `holiday,winter`, "Beach" → `summer,outdoor`, "Basketball" → `sports`)

These are stored alongside the comic record:

```json
{
  "id": 6,
  "title": "Bringing In The New Year",
  "altText": ["Bringing in the new year part 1", "Bringing in the new year part 2", ...],
  "theme": "",
  "tags": ["holiday", "winter", "celebration"],
  "embedding": [0.012, -0.034, ...],
  "related": [
    { "id": 5, "score": 0.92 },
    { "id": 18, "score": 0.88 },
    { "id": 12, "score": 0.85 },
    { "id": 8, "score": 0.83 }
  ]
}
```

**To avoid bloating `data.json`:** Don't include the raw embedding vectors in the served JSON. Just compute the similarity matrix offline and store the top-4 related comic IDs + scores.

#### Combining the signals

Weighted combination: `similarity = 0.7 * image_emb_sim + 0.3 * tag_overlap`. The weight can be tuned by eyeballing results.

#### Pipeline

1. `scripts/scrape.py` (Phase 1, extended) — fetches all comic pages, extracts metadata, alt text, theme text, downloads all panel images to a cache dir.
2. `scripts/compute_similarity.py` — loads the cached images, runs SigLIP 2 to get embeddings, computes cosine similarity matrix, computes tag-based overlap, combines signals, picks top-4 per comic, writes `related` arrays back to `data.json`.
3. `scripts/generate_tags.py` (optional) — uses SigLIP 2's zero-shot classification to auto-tag comics by checking against candidate labels like `["holiday", "sports", "school", "outdoor", "indoor", "music", "food", "animals"]`, using the model's text tower to score each label. This is the "SigLIP way" to do it without manual tagging.

**One-time run instructions:**

```bash
pip install transformers torch pillow requests
python scripts/scrape.py        # produces data.json + downloads images to cache/
python scripts/compute_similarity.py  # reads cache/, runs SigLIP 2, updates data.json
```

#### On the frontend

- **Index page**: add a "Show Related" toggle. When on, clicking a comic card highlights its related comics and dims the rest.
- **Comic viewer page**: below the panels, show a "You might also like" row with 3–4 linked comic cards (thumbnail + title).
- **Mobile**: Related section collapses to a simple text list of links.

#### Why SigLIP 2 over title-only matching

Title-only is fragile — "The Concert" and "The Carolers" both have "The" and music themes but share no title tokens. SigLIP 2 captures visual similarity (both likely have people on stage, instruments, etc.) while the page text provides semantic grounding for concepts that aren't visually obvious (holidays, specific activities). The combination handles both cases robustly for ~50 comics.
