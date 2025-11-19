import ee
import geemap
import pandas as pd
import json
from tqdm import tqdm

# Initialize
ee.Authenticate()
ee.Initialize(project='gae-lab-demo')

# Define bounding box for Delhi
delhi_bbox = ee.Geometry.BBox(76.8, 28.4, 77.4, 28.9)

# Create grid (e.g., 80x80)
grid = geemap.fishnet(delhi_bbox, rows=80, cols=80)

# Dynamic World land cover (2023 median)
dw = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterDate("2023-01-01", "2023-12-31")
dw_img = dw.select("label").mode()

# VIIRS Day/Night Band nighttime lights (2023 median)
viirs = ee.ImageCollection("NOAA/VIIRS/DNB/MONTHLY_V1/VCMCFG").filterDate("2023-01-01", "2023-12-31")
viirs_img = viirs.select("avg_rad").median()  # average radiance

# Convert grid to a list of features
features = grid.toList(grid.size())
n = features.size().getInfo()

batch_size = 25  # smaller = more progress updates, slower total
# Add human-readable labels
labels = {
    0: "Water", 1: "Trees", 2: "Grass", 3: "Flooded vegetation",
    4: "Crops", 5: "Shrub & scrub", 6: "Built area", 7: "Bare ground", 8: "Snow & ice"
}

results = []

for i in tqdm(range(0, n, batch_size), desc="Processing grid cells"):
    batch = ee.FeatureCollection(features.slice(i, min(i + batch_size, n)))

    # Compute landcover for this batch
    landcover = dw_img.reduceRegions(
        collection=batch,
        reducer=ee.Reducer.mode(),
        scale=30,
    )

    # Compute mean nighttime lighting for this batch
    lighting = viirs_img.reduceRegions(
        collection=batch,
        reducer=ee.Reducer.mean(),
        scale=500,
    )

    landcover_info = landcover.getInfo()
    lighting_info = lighting.getInfo()

    for f_lc, f_light in zip(landcover_info["features"], lighting_info["features"]):
        # Round landcover class to nearest integer
        lc_class = round(f_lc["properties"].get("mode", -1))
        lc_name = labels.get(lc_class, "Unknown")

        results.append({
            "landcover_class": lc_class,
            "landcover_name": lc_name,
            "lighting_radiance": f_light["properties"].get("mean"),
            "geometry": json.dumps(f_lc["geometry"])
        })

# Convert to DataFrame
df = pd.DataFrame(results)

# Save CSV
df.to_csv("delhi_landcover_lighting_grid.csv", index=False)
print("✅ Saved delhi_landcover_lighting_grid.csv")
