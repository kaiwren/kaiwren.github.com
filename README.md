# kaiwren.github.com

Personal website at [sidu.in](https://sidu.in), generated with [bhook](https://gitlab.com/kaiwren/bhook).

## Structure

```
website/
├── .bhook.yml       # Mount configuration
├── essays/          # Generated from ../essays
├── wiki/startups/   # Generated from ../india-startups/wiki
├── index.html       # Hand-authored homepage
└── _source/         # Legacy static assets
```

## Setup

1. Clone all repositories:
   ```bash
   cd ~/Work/kaiwren
   git clone git@github.com:kaiwren/kaiwren.github.com.git website
   git clone git@gitlab.com:kaiwren/essays.git
   git clone git@gitlab.com:india-startups/wiki.git india-startups-wiki
   git clone --recursive git@gitlab.com:kaiwren/bhook.git
   ```

2. Install bhook dependencies:
   ```bash
   cd bhook
   bundle install
   ```

## Usage

**Regenerate all content:**
```bash
cd website
../bhook/bin/bhook -w -v
```

This reads `.bhook.yml` and mounts:
- `../essays` → `./essays/`
- `../india-startups/wiki` → `./wiki/startups/`

**Edit essays:**
```bash
# Edit markdown in source repo
vim ../essays/hiring-product-managers.md

# bhook watch mode auto-regenerates HTML
```

## Deployment

Push to `master` branch. GitHub Pages serves from the root.

## Source Repositories

| Content | Source | Output |
|---------|--------|--------|
| Essays | [gitlab.com/kaiwren/essays](https://gitlab.com/kaiwren/essays) | `/essays/` |
| Startup Wiki | [gitlab.com/india-startups/wiki](https://gitlab.com/india-startups/wiki) | `/wiki/startups/` |

## License

Content © [Sidu Ponnappa](https://sidu.in)
