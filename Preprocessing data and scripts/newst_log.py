# ---------------------------
# Detect Waterlogging - Gurgaon (Local)
# ---------------------------

import rasterio
import numpy as np
import matplotlib.pyplot as plt
import folium
from rasterio.plot import show
from rasterio.mask import mask
from shapely.geometry import box, mapping
import geopandas as gpd
import requests
import os

# Define bounding box (small part of Gurgaon)
bbox = [76.98, 28.38, 77.08, 28.48]  # minLon, minLat, maxLon, maxLat
region = box(*bbox)

# Create a folder for data
os.makedirs("sentinel_data", exist_ok=True)

# ---- Step 1: Download Sentinel-1 data ----
# We'll use AWS open Sentinel-1 GRD data via requests
# These files are public via AWS Open Data (use sample for now)

# Example pre and post images from AWS Sentinel-1 archive
pre_url = "https://sentinel-s1-l1c.s3.amazonaws.com/GRD/S1A_IW_GRDH_1SDV_20240605T000000.tiff"
post_url = "https://sentinel-s1-l1c.s3.amazonaws.com/GRD/S1A_IW_GRDH_1SDV_20240810T000000.tiff"

# You can use real S1 data URLs from Copernicus Open Access Hub instead
pre_path = "sentinel_data/pre_monsoon.tif"
post_path = "sentinel_data/post_monsoon.tif"

for url, path in [(pre_url, pre_path), (post_url, post_path)]:
    if not os.path.exists(path):
        print(f"Downloading {url} ...")
        r = requests.get(url)
        with open(path, "wb") as f:
            f.write(r.content)
    else:
        print(f"File {path} already exists")

# ---- Step 2: Read and crop rasters ----
def crop_to_bbox(src_path, region_geom):
    with rasterio.open(src_path) as src:
        out_image, out_transform = mask(src, [mapping(region_geom)], crop=True)
        out_meta = src.meta.copy()
        out_meta.update({
            "height": out_image.shape[1],
            "width": out_image.shape[2],
            "transform": out_transform
        })
    return out_image[0], out_meta

pre_band, meta = crop_to_bbox(pre_path, region)
post_band, _ = crop_to_bbox(post_path, region)

# ---- Step 3: Compute VH difference ----
diff = pre_band.astype(float) - post_band.astype(float)

# ---- Step 4: Threshold for waterlogging ----
water_mask = diff < -2  # difference of -2 dB or more

# ---- Step 5: Visualize ----
plt.figure(figsize=(8,6))
plt.imshow(diff, cmap='RdBu', vmin=-5, vmax=5)
plt.title("VH Backscatter Difference (Pre - Post)")
plt.colorbar(label="dB Difference")
plt.show()

plt.figure(figsize=(8,6))
plt.imshow(water_mask, cmap='Blues')
plt.title("Detected Waterlogged Areas")
plt.show()

# ---- Step 6: Visualize on interactive map ----
# Convert raster to polygons for Folium overlay
transform = meta['transform']
rows, cols = np.where(water_mask)

flood_polygons = []
for r, c in zip(rows, cols):
    x, y = rasterio.transform.xy(transform, r, c)
    flood_polygons.append([y, x])

m = folium.Map(location=[28.43, 77.03], zoom_start=12)
for lat, lon in flood_polygons:
    folium.CircleMarker(
        location=[lat, lon],
        radius=2,
        color='blue',
        fill=True,
        fill_opacity=0.6
    ).add_to(m)

m.save("gurgaon_waterlogging_map.html")
print("✅ Map saved as gurgaon_waterlogging_map.html")
