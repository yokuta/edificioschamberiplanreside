# Edificios Chamberí · Plan Reside

**Urban analytics dashboard** — interactive map of buildings in Chamberí (Madrid), with Plan Reside risk identification.

🌐 **Live site:** https://yokuta.github.io/edificioschamberiplanreside/

---

## Stack

| Layer | Technology |
|-------|-----------|
| Map   | [Leaflet 1.9](https://leafletjs.com/) |
| Tiles | CartoDB Dark (no labels) |
| Data  | GeoJSON (Catastro INSPIRE) |
| Hosting | GitHub Pages (static) |
| Preprocessing | Python · GeoPandas |

---

## Project Structure

```
edificioschamberiplanreside/
├── index.html           ← Dashboard shell
├── styles.css           ← All styles
├── script.js            ← Map logic, KPIs, panel
├── preprocess.py        ← One-time data preparation script
├── data/
│   ├── chamberi_buildings.geojson   ← Main dataset (WGS84)
│   └── madrid_buildings.geojson     ← Background layer (optional, WGS84)
└── README.md
```

---

## Step 1 — Prepare your data

### Check coordinate system

Your Catastro GeoJSON may be in **EPSG:25830** (UTM zone 30N, metres) or **WGS84** (degrees).
Leaflet **requires WGS84**. Open your file in a text editor and check the first coordinate pair:

- `[439881, 4475875]` → EPSG:25830 (needs reprojection)
- `[-3.701, 40.437]` → WGS84 (ready to use)

### Reproject & clean with the Python script

```bash
# Install dependencies (once)
pip install geopandas pyproj shapely

# Basic usage
python preprocess.py \
  --input ~/Downloads/YOUR_CHAMBERI_FILE.geojson \
  --output data/chamberi_buildings.geojson

# With optional Madrid background + simplification for performance
python preprocess.py \
  --input ~/Downloads/YOUR_CHAMBERI_FILE.geojson \
  --output data/chamberi_buildings.geojson \
  --madrid ~/Downloads/YOUR_MADRID_FILE.geojson \
  --simplify 0.5
```

The script will:
- Auto-detect and reproject from EPSG:25830 → WGS84 if needed
- Strip unnecessary columns to reduce file size
- Warn you if the output is too large for smooth web performance

### File size guidance

| Size | Action |
|------|--------|
| < 5 MB  | Use as-is |
| 5–15 MB | Use `--simplify 0.5` |
| > 15 MB | Use `--simplify 1.0` or consider GeoJSON tiles |

---

## Step 2 — Test locally

```bash
# From the repo root
python -m http.server 8000
# Open http://localhost:8000
```

Or use VS Code Live Server (right-click index.html → Open with Live Server).

> ⚠ You **must** use a local server — `file://` URLs block GeoJSON fetch requests.

---

## Step 3 — Create GitHub repository

1. Go to https://github.com/new
2. Repository name: `edificioschamberiplanreside`
3. Visibility: **Public**
4. **Do not** initialise with README (you'll push your own)
5. Click **Create repository**

---

## Step 4 — Push to GitHub

```bash
# Navigate to your project folder
cd /path/to/edificioschamberiplanreside

# Initialise git (if not already done)
git init
git branch -M main

# Stage all files
git add .

# Commit
git commit -m "feat: initial dashboard — Chamberí Plan Reside"

# Link to your GitHub repo
git remote add origin https://github.com/yokuta/edificioschamberiplanreside.git

# Push
git push -u origin main
```

---

## Step 5 — Enable GitHub Pages

1. Go to your repo on GitHub → **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. Branch: `main` / folder: `/ (root)`
4. Click **Save**

Your site will be live at:
```
https://yokuta.github.io/edificioschamberiplanreside/
```
(Takes 1–3 minutes to propagate on first deploy.)

---

## Step 6 — Update the site

After any change:

```bash
git add .
git commit -m "fix: update building data"
git push
```

GitHub Pages rebuilds automatically within ~30 seconds.

---

## About the .CAT file

The `.CAT` file from Catastro is a **fixed-width text format** with detailed cadastral data (owners, fiscal values, addresses per parcel). It requires preprocessing before web use:

**Practical workflow:**
1. Use a Python script (e.g. with `pandas` + `chardet`) to parse the `.CAT` into a CSV or JSON keyed by `reference` (cadastral reference).
2. Join this enriched data with your GeoJSON either at preprocessing time (recommended) or at load time in the browser via a lookup object.
3. The most useful `.CAT` fields for the panel are: full address, year of construction, and built area breakdown.

For this initial version the GeoJSON properties from the INSPIRE download are sufficient. `.CAT` integration can be added in v2.

---

## Features

- 🗺 Interactive map centred on Chamberí, panning constrained to the district
- 🏢 Click any building → right panel shows cadastral reference, use, units, dwellings, area, year, and façade photo
- 🔴 **Plan Reside toggle** — highlights buildings with `numberOfBuildingUnits = 1` AND `currentUse = 1_residential`
- 📊 KPI cards: total buildings, affected count, percentage, total dwellings
- 🌙 Dark urban dashboard aesthetic

---

## Version 2 — Suggested improvements

- [ ] Add address enrichment from `.CAT` file
- [ ] WMS layer from Catastro (`https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx`) as optional overlay
- [ ] Filter/search buildings by use type or year range
- [ ] Export affected buildings as CSV
- [ ] Choropleth by number of dwellings
- [ ] Cluster view at low zoom levels for the Madrid background layer
- [ ] Add district boundary polygon as a semi-transparent overlay
