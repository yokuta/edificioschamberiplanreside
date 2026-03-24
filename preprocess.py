#!/usr/bin/env python3
"""
preprocess.py — Chamberí Buildings GeoJSON Preprocessor
========================================================

What this script does:
  1. Reads your source GeoJSON (from Catastro / INSPIRE download)
  2. Detects whether coordinates are in EPSG:25830 (UTM zone 30N) or WGS84
  3. Reprojects to WGS84 (EPSG:4326) if needed — required by Leaflet
  4. Removes heavy/unnecessary properties to reduce file size
  5. Writes the output to  data/chamberi_buildings.geojson

Requirements:
  pip install geopandas pyproj shapely

Usage:
  python preprocess.py --input ~/Downloads/YOUR_FILE.geojson --output data/chamberi_buildings.geojson

  Optional flags:
  --madrid ~/Downloads/MADRID_BUILDINGS.geojson   ← also preprocess Madrid background
  --simplify 0.5                                  ← tolerance in metres (default: off)
  --no-clean                                      ← skip property filtering

Author: edificioschamberiplanreside project
"""

import argparse
import json
import sys
import os
from pathlib import Path

try:
    import geopandas as gpd
    from pyproj import CRS, Transformer
    import shapely
except ImportError:
    print("ERROR: Required libraries not installed.")
    print("Run:  pip install geopandas pyproj shapely")
    sys.exit(1)


# ─── Properties to KEEP in the output (everything else is dropped to save space)
KEEP_PROPERTIES = {
    "gml_id",
    "reference",
    "localId",
    "informationSystem",
    "currentUse",
    "numberOfBuildingUnits",
    "numberOfDwellings",
    "numberOfFloorsAboveGround",
    "conditionOfConstruction",
    "beginning",             # construction year
    "documentLink",          # façade image URL
    "value",                 # built area
    "value_uom",
    "horizontalGeometryEstimatedAccuracy",
}


def detect_crs(gdf):
    """Return the detected CRS as a string like 'EPSG:25830' or 'EPSG:4326'."""
    if gdf.crs is None:
        # Try to guess from coordinate range
        bounds = gdf.total_bounds  # minx, miny, maxx, maxy
        minx, miny, maxx, maxy = bounds
        if -180 <= minx <= 180 and -90 <= miny <= 90:
            print("  → Coordinates look like WGS84 (EPSG:4326) — no reprojection needed.")
            return "EPSG:4326"
        elif 100000 <= minx <= 900000 and 3000000 <= miny <= 9000000:
            print("  → Coordinates look like UTM (EPSG:25830) — reprojection needed.")
            return "EPSG:25830"
        else:
            print(f"  ⚠ Unrecognised coordinate range: x=[{minx:.0f},{maxx:.0f}] y=[{miny:.0f},{maxy:.0f}]")
            print("    Assuming EPSG:25830. Edit the script if this is wrong.")
            return "EPSG:25830"
    else:
        epsg = gdf.crs.to_epsg()
        print(f"  → CRS from file: EPSG:{epsg}")
        return f"EPSG:{epsg}"


def clean_properties(gdf):
    """Drop all columns not in KEEP_PROPERTIES."""
    cols = [c for c in gdf.columns if c not in KEEP_PROPERTIES and c != 'geometry']
    if cols:
        print(f"  → Dropping {len(cols)} unused columns: {cols[:5]}{'…' if len(cols)>5 else ''}")
    return gdf.drop(columns=cols, errors='ignore')


def process_file(input_path: Path, output_path: Path, simplify_m: float = 0, do_clean: bool = True):
    print(f"\n[1/4] Reading: {input_path}")
    gdf = gpd.read_file(input_path)
    print(f"      {len(gdf)} features loaded")
    print(f"      Columns: {list(gdf.columns)}")

    print(f"\n[2/4] Detecting CRS…")
    source_crs = detect_crs(gdf)

    if source_crs != "EPSG:4326":
        if gdf.crs is None:
            gdf = gdf.set_crs(source_crs)
        print(f"  → Reprojecting {source_crs} → EPSG:4326 (WGS84)…")
        gdf = gdf.to_crs("EPSG:4326")
        print("  ✓ Done")
    else:
        if gdf.crs is None:
            gdf = gdf.set_crs("EPSG:4326")

    if simplify_m > 0:
        print(f"\n[3/4] Simplifying geometry (tolerance: {simplify_m}m)…")
        # Temporarily reproject to metric CRS for accurate simplification
        gdf_metric = gdf.to_crs("EPSG:25830")
        gdf_metric["geometry"] = gdf_metric["geometry"].simplify(simplify_m, preserve_topology=True)
        gdf = gdf_metric.to_crs("EPSG:4326")
        print("  ✓ Done")
    else:
        print(f"\n[3/4] Skipping simplification (use --simplify N to enable)")

    if do_clean:
        print(f"\n[4/4] Cleaning properties…")
        gdf = clean_properties(gdf)

    print(f"\n      Writing: {output_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Write as GeoJSON
    gdf.to_file(output_path, driver="GeoJSON")

    # Report file size
    size_kb = output_path.stat().st_size / 1024
    print(f"  ✓ Saved — {size_kb:.0f} KB ({len(gdf)} features)")
    if size_kb > 10_000:
        print("  ⚠  File is >10 MB. Consider:")
        print("     --simplify 0.5    to reduce coordinate precision")
        print("     Splitting into tiles if >30 MB")


def main():
    parser = argparse.ArgumentParser(description="Preprocess Chamberí buildings GeoJSON for web use")
    parser.add_argument("--input",    required=True,        help="Input GeoJSON file path")
    parser.add_argument("--output",   default="data/chamberi_buildings.geojson", help="Output path")
    parser.add_argument("--madrid",   default=None,         help="Optional Madrid buildings GeoJSON")
    parser.add_argument("--simplify", type=float, default=0, help="Simplification tolerance in metres (e.g. 0.5)")
    parser.add_argument("--no-clean", action="store_true",  help="Keep all properties")
    args = parser.parse_args()

    process_file(
        input_path  = Path(args.input),
        output_path = Path(args.output),
        simplify_m  = args.simplify,
        do_clean    = not args.no_clean,
    )

    if args.madrid:
        process_file(
            input_path  = Path(args.madrid),
            output_path = Path("data/madrid_buildings.geojson"),
            simplify_m  = max(args.simplify, 1.0),  # simplify Madrid more aggressively
            do_clean    = not args.no_clean,
        )

    print("\n✅ Preprocessing complete. Files are ready in ./data/")
    print("   Next step: serve locally with  python -m http.server 8000")
    print("   Then open: http://localhost:8000\n")


if __name__ == "__main__":
    main()
