# Website QA Test Protocol

Playwright MCP-based QA protocol for sidu.in. Run after bhook rebuilds, before deploying to GitHub Pages.

Uses `TaskCreate`/`TaskUpdate` todos to track each test step for reliable, auditable execution.

## Running the Protocol

**Locally (before deploy):**
```
Run the QA test protocol in tests/qa-protocol.md against localhost
```

**Against production (after deploy):**
```
Run the QA test protocol in tests/qa-protocol.md against https://sidu.in
```

**Quick smoke test (time-constrained):**
```
Run the smoke test subset from tests/qa-protocol.md
```

---

## Setup

Create task: **"Start QA test server"**

1. Start server in background:
   ```bash
   python3 -m http.server 8080 --directory /Users/sidu/Work/kaiwren/website
   ```
2. Verify it responds:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/
   ```
   Expected: `200`

Set `BASE_URL=http://localhost:8080` for local, or `BASE_URL=https://sidu.in` for production.

Skip this step when testing against production.

---

## Test 1: All Pages Return HTTP 200

Create task: **"Verify all pages return HTTP 200"**

```bash
for path in \
  / \
  /essays/index.html \
  /essays/after-ai-there-is-no-product.html \
  /essays/hiring-product-managers.html \
  /wiki/startups/index.html \
  /wiki/startups/org/product-org.html \
  /wiki/startups/recruiting/market.html \
  /wiki/startups/recruiting/sourcing.html \
  /wiki/startups/recruiting/operations.html \
  /wiki/startups/recruiting/operations/running-recruiting.html \
  /wiki/startups/recruiting/team.html \
  /wiki/startups/recruiting/interviews.html; do
  echo -n "$path: "; curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${path}"; echo
done
```

**Pass**: Every path returns `200`.

---

## Test 2: Homepage Structure

Create task: **"Verify homepage structure and navigation"**

1. `browser_navigate` to `${BASE_URL}/`
2. `browser_snapshot` and verify:

| Check | Expected |
|-------|----------|
| Page title | "Sidu Ponnappa" |
| h1 | "hello." |
| Menu order | wiki, essays, github, medium, linkedin, @ponnappa |
| wiki link | `wiki/startups/index.html` |
| essays link | `essays/index.html` |
| "historically." section | Present with dated entries |
| Dark mode toggle | Button with ◐ present |

**Pass**: All elements present, menu order correct, links resolve.

---

## Test 3: Essays Index

Create task: **"Verify essays index page"**

1. `browser_navigate` to `${BASE_URL}/essays/index.html`
2. `browser_snapshot` and verify:

| Check | Expected |
|-------|----------|
| Page title | "Essays" |
| Essays listed | All published essays with dates |
| Link extensions | `.html` (not `.md`) |
| Tweet/Follow buttons | Present |
| Footer | Version SHA, date, "Sidu Ponnappa" link, "powered by bhook" |

**Pass**: All essays listed, links use `.html`, footer intact.

---

## Test 4: Essay Content & Structure

Create task: **"Verify essay page content and structure"**

Test with: `${BASE_URL}/essays/after-ai-there-is-no-product.html`

1. `browser_navigate` to the essay
2. `browser_snapshot` and verify:

| Check | Expected |
|-------|----------|
| h1 title | "There is no Product" |
| Header image | `<img>` element with alt text present |
| Section headings | h2s with anchor links |
| Embedded tweets | Blockquote elements with twitter links |
| Cross-post footer | "Cross-posted on Twitter/X" with link |
| Page footer | Version SHA, date, copyright, bhook link |

**Pass**: Full content renders, no missing sections, embeds present.

---

## Test 5: No Editorial Comments in HTML

Create task: **"Verify no editorial comments in HTML output"**

```bash
# Should find ZERO matches
grep -r '<!-- \[AUTHOR' /Users/sidu/Work/kaiwren/website/essays/*.html
grep -r '<!-- EDITOR' /Users/sidu/Work/kaiwren/website/essays/*.html

# Template comments should still exist (exactly 3 per page)
grep -c '<!--' /Users/sidu/Work/kaiwren/website/essays/after-ai-there-is-no-product.html
# Expected: 3 (meta tags, Bootstrap, Google Analytics)
```

**Pass**: Zero `[AUTHOR` or `EDITOR CHANGE LOG` comments. Template comments (meta tags, Bootstrap, GA) preserved — exactly 3 per bhook-generated page.

---

## Test 6: Open Graph & Twitter Card Meta Tags

Create task: **"Verify OG and Twitter Card meta tags"**

For each essay page, `browser_navigate` then `browser_evaluate`:

```js
() => {
  const metas = document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]');
  return Array.from(metas).map(m =>
    `${m.getAttribute('property') || m.getAttribute('name')}: ${m.getAttribute('content')}`
  ).join('\n');
}
```

Verify for each essay:

| Tag | Expected |
|-----|----------|
| `og:title` | Matches `<title>`, non-empty |
| `og:type` | `article` |
| `og:site_name` | `sidu.in` |
| `og:description` | Non-empty, from first paragraph |
| `og:image` | Absolute URL (`https://...`) if image exists |
| `twitter:card` | `summary_large_image` if image, `summary` if not |
| `twitter:title` | Matches `og:title` |
| `twitter:site` | `@ponnappa` |
| `twitter:description` | Matches `og:description` |
| `twitter:image` | Matches `og:image` |

**Pass**: All tags present and correctly populated. No relative image URLs.

---

## Test 7: No Unwanted Files Committed

Create task: **"Verify no unwanted generated files are committed"**

```bash
git -C /Users/sidu/Work/kaiwren/website ls-files | grep -E '(essays/exec/|essays/research/|essays/\.claude/|essays/\.idea/)' \
  && echo "FAIL" || echo "PASS"
```

**Pass**: No files from `essays/exec/`, `essays/research/`, `essays/.claude/`, `essays/.idea/` in git.

---

## Test 8: Wiki Renders Correctly

Create task: **"Verify wiki pages render and link correctly"**

1. `browser_navigate` to `${BASE_URL}/wiki/startups/index.html`
2. `browser_snapshot` and verify:

| Check | Expected |
|-------|----------|
| Page title | "India Startup Wiki" |
| Sections | Recruiting, Org design, People |
| Link extensions | `.html` (not `.md`) |
| Sub-links | Market, Sourcing, Operations, Team, Interviews, Product Org |

3. Click "Market" link → verify it loads, has back-link to index.

**Pass**: Wiki index renders, all internal links use `.html`, navigation works.

---

## Test 9: Dark Mode Toggle

Create task: **"Verify dark mode toggle"**

1. On any page, `browser_snapshot` — confirm toggle button exists
2. `browser_click` the toggle button
3. `browser_evaluate`:
   ```js
   () => document.documentElement.getAttribute('data-theme')
   ```
   Expected: `"dark"`
4. Click again, check attribute is `"light"`

**Pass**: Toggle switches data-theme attribute between dark/light.

---

## Teardown

Create task: **"QA teardown and results summary"**

1. Kill HTTP server (local only):
   ```bash
   lsof -ti:8080 | xargs kill 2>/dev/null
   ```
2. Close Playwright: `browser_close`
3. Review all task statuses, report pass/fail summary

---

## Quick Smoke Test

When time is short, run only:

| Step | Test |
|------|------|
| Setup | Start server |
| 1 | HTTP 200s |
| 5 | No editorial comments |
| 6 | OG meta tags |
| Teardown | Stop server, report |

---

## When to Run

| Trigger | Scope |
|---------|-------|
| Before deploying | Full protocol against localhost |
| After deploying | Full protocol against `https://sidu.in` |
| After bhook theme/converter changes | Full protocol |
| After essay content changes | Tests 1, 4, 5, 6 |
| After homepage changes | Tests 1, 2 |
| After wiki changes | Tests 1, 8 |
