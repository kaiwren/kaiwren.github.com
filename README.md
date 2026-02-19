# kaiwren.github.com

Source for [sidu.in](https://sidu.in), generated with [bhook](https://gitlab.com/kaiwren/bhook) and deployed via GitHub Pages.

**Live site:**
- [sidu.in](https://sidu.in) - Homepage
- [sidu.in/essays/](https://sidu.in/essays/) - Essays
- [sidu.in/wiki/startups/](https://sidu.in/wiki/startups/) - India Startup Wiki

## Structure

```
~/Work/kaiwren/
├── bhook/                # Static site generator (Ruby gem)
├── essays/               # Essay markdown source (GitLab)
├── india-startups-wiki/  # Wiki markdown source (GitLab)
└── website/              # This repo - HTML output (GitHub)
    ├── .bhook.yml        # Mount config: maps source repos → output dirs
    ├── index.html        # Hand-authored homepage
    ├── index.css         # Homepage styles
    ├── essays/           # Generated HTML from ../essays
    └── wiki/startups/    # Generated HTML from ../india-startups-wiki
```

## Setup

All four repos must be siblings under the same parent directory.

```bash
cd ~/Work/kaiwren
git clone git@github.com:kaiwren/kaiwren.github.com.git website
git clone git@gitlab.com:kaiwren/essays.git
git clone git@gitlab.com:india-startups/wiki.git india-startups-wiki
git clone --recursive git@gitlab.com:kaiwren/bhook.git
cd bhook && bundle install
```

## Rendering Locally

From the `website/` directory, run bhook. It reads `.bhook.yml` which mounts `../essays` → `./essays/` and `../india-startups-wiki` → `./wiki/startups/`.

```bash
cd ~/Work/kaiwren/website

# One-shot build
../bhook/bin/bhook -v

# Watch mode (auto-regenerates on source changes)
../bhook/bin/bhook -w -v
```

To preview in a browser, open files directly:
```bash
open essays/index.html
```

## Content Workflow

**Homepage** (`index.html`): Hand-authored HTML. Edit directly in this repo.

**Essays and wiki**: Edit markdown in the *source* repos (`../essays/`, `../india-startups-wiki/`), not in the generated HTML here. Bhook watch mode auto-regenerates HTML on save.

### Adding a New Essay

1. Create the markdown file in `../essays/`:
   ```bash
   vim ../essays/my-new-essay.md
   ```
2. Add it to `../essays/index.md` (chronological, newest first):
   ```markdown
   1. [My New Essay](my-new-essay.md) (Feb 2026)
   2. [Previous Essay](previous.md) (Jan 2026)
   ```
3. If bhook is running in watch mode, HTML regenerates automatically. Otherwise run `../bhook/bin/bhook -v`.
4. Commit the source change in `../essays/`, then commit the generated HTML here.

### Excluding Content from Rendering

Edit `../essays/.bhook.yml` to add files or directories to the `exclude` list. Excluded files won't appear in the generated site.

## What to Commit

**This repo (website)**: `index.html`, `index.css`, generated `.html` files in `essays/` and `wiki/`, `.bhook.yml`.

**Do NOT commit**: bhook may generate HTML for files that are excluded from the essays index but still present in the source repo (e.g. `essays/exec/`, `essays/research/`, `essays/.claude/`). These should not be committed.

## Deployment

Push to `master`. GitHub Pages serves from the repo root.

```bash
cd ~/Work/kaiwren/website
git add index.html essays/*.html wiki/
git commit -m "Regenerate site"
git push origin master
```

## Source Repositories

| Content | Source | Output |
|---------|--------|--------|
| Essays | [gitlab.com/kaiwren/essays](https://gitlab.com/kaiwren/essays) | `/essays/` |
| Startup Wiki | [gitlab.com/india-startups/wiki](https://gitlab.com/india-startups/wiki) | `/wiki/startups/` |

## License

Content © [Sidu Ponnappa](https://sidu.in)
