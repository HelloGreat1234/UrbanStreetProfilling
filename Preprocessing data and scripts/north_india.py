import ee
import geemap
import json
import pandas as pd
from tqdm import tqdm
import os
import time

# ---------------------------
# 0. Authenticate & initialize
# ---------------------------
ee.Authenticate()
ee.Initialize(project='gae-lab-demo')

# ---------------------------
# 1. Define AOI = North India
# ---------------------------
india = ee.FeatureCollection("FAO/GAUL/2015/level1")

north_states = [
    "Delhi", "Haryana", "Punjab", "Chandigarh"
]

north_india = india.filter(ee.Filter.inList("ADM1_NAME", north_states))

# ---------------------------
# 2. Load & clip datasets
# ---------------------------
dw_img = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1") \
    .filterDate("2023-01-01", "2023-12-31") \
    .select("label").mode().clip(north_india)

viirs_img = ee.ImageCollection("NOAA/VIIRS/DNB/MONTHLY_V1/VCMCFG") \
    .filterDate("2023-01-01", "2023-12-31") \
    .select("avg_rad").median().clip(north_india)

lst_day = ee.ImageCollection("MODIS/061/MOD11A2") \
    .filterDate("2023-01-01", "2023-12-31") \
    .select("LST_Day_1km").mean().multiply(0.02).subtract(273.15).clip(north_india)

no2_img = ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2") \
    .filterDate("2023-01-01", "2023-12-31") \
    .select("tropospheric_NO2_column_number_density").mean().clip(north_india)

# ---------------------------
# 3. Create grid (~20 km cells)
# ---------------------------
bounds = north_india.geometry().bounds()
grid = geemap.fishnet(bounds, rows=100, cols=100)
grid = ee.FeatureCollection(grid).filterBounds(north_india.geometry())

features = grid.toList(grid.size())
n = features.size().getInfo()
batch_size = 25

labels = {
    0: "Water", 1: "Trees", 2: "Grass", 3: "Flooded vegetation",
    4: "Crops", 5: "Shrub & scrub", 6: "Built area",
    7: "Bare ground", 8: "Snow & ice"
}

results_file = "north_india_grid_landcover_lighting_uhi_no2_resumable.csv"
progress_file = "progress.json"

# ---------------------------
# 4. Load progress if exists
# ---------------------------
if os.path.exists(progress_file):
    with open(progress_file, "r") as f:
        progress_data = json.load(f)
        start_idx = progress_data.get("last_batch_index", 0)
        results = progress_data.get("results", [])
else:
    start_idx = 0
    results = []

print(f"📦 Total grid cells: {n} | Batch size: {batch_size} | Starting from batch {start_idx}")

# ---------------------------
# 5. Process batches
# ---------------------------
for i in tqdm(range(start_idx, n, batch_size), desc="Processing batches"):
    batch = ee.FeatureCollection(features.slice(i, min(i + batch_size, n)))
    
    retry = 0
    success = False
    while not success and retry < 3:
        try:
            # Reduce for each dataset
            landcover = dw_img.reduceRegions(collection=batch, reducer=ee.Reducer.mode(), scale=10)
            lighting = viirs_img.reduceRegions(collection=batch, reducer=ee.Reducer.mean(), scale=500)
            lst = lst_day.reduceRegions(collection=batch, reducer=ee.Reducer.mean(), scale=1000)
            no2 = no2_img.reduceRegions(collection=batch, reducer=ee.Reducer.mean(), scale=7000)

            landcover_info = landcover.getInfo()
            lighting_info = lighting.getInfo()
            lst_info = lst.getInfo()
            no2_info = no2.getInfo()
            success = True
        except Exception as e:
            retry += 1
            wait_time = 30 * retry  # exponential backoff
            print(f"⚠️ Batch {i}-{i+batch_size} failed (attempt {retry}). Retrying in {wait_time}s...")
            time.sleep(wait_time)
    
    if not success:
        print(f"❌ Skipping batch {i}-{i+batch_size} after 3 failed attempts.")
        continue

    # Process each cell in batch
    for f_lc, f_light, f_lst, f_no2 in zip(
        landcover_info["features"],
        lighting_info["features"],
        lst_info["features"],
        no2_info["features"]
    ):
        lc_class = round(f_lc["properties"].get("mode", -1))
        lc_name = labels.get(lc_class, "Unknown")
        cell_lst = f_lst["properties"].get("mean")
        uhi_intensity = None
        if lc_class == 6 and cell_lst is not None:
            rural_ref = 28.7
            uhi_intensity = cell_lst - rural_ref

        results.append({
            "landcover_class": lc_class,
            "landcover_name": lc_name,
            "lighting_radiance": f_light["properties"].get("mean"),
            "lst_celsius": cell_lst,
            "uhi_intensity": uhi_intensity,
            "no2": f_no2["properties"].get("mean"),
            "geometry": json.dumps(f_lc["geometry"])
        })

    # ---------------------------
    # 6. Save progress after each batch
    # ---------------------------
    with open(progress_file, "w") as f:
        json.dump({"last_batch_index": i + batch_size, "results": results}, f)

    # Also save CSV incrementally
    pd.DataFrame(results).to_csv(results_file, index=False)

print(f"✅ Finished all batches. Saved {len(results)} cells to {results_file}")
