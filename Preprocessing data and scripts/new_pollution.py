import ee
import geemap
import pandas as pd
import json
from tqdm import tqdm

# Initialize Earth Engine
ee.Authenticate()
ee.Initialize(project='gae-lab-demo')

# Define bounding box for Delhi
delhi_bbox = ee.Geometry.BBox(76.8, 28.4, 77.4, 28.9)

# Create grid (80x80)
grid = geemap.fishnet(delhi_bbox, rows=80, cols=80)

# Dynamic World land cover (2023 median)
dw = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterDate("2023-01-01", "2023-12-31")
dw_img = dw.select("label").mode()

# VIIRS nighttime lights (2023 median)
viirs = ee.ImageCollection("NOAA/VIIRS/DNB/MONTHLY_V1/VCMCFG").filterDate("2023-01-01", "2023-12-31")
viirs_img = viirs.select("avg_rad").median()

# MODIS Land Surface Temperature (2023 mean)
modis_lst = ee.ImageCollection("MODIS/061/MOD11A2").filterDate("2023-01-01", "2023-12-31")
lst_day = modis_lst.select("LST_Day_1km").mean().multiply(0.02).subtract(273.15)  # scale factor & convert to °C

# Sentinel-5P NO2 (2023 mean)
no2_img = (
    ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2")
    .select("tropospheric_NO2_column_number_density")
    .filterDate("2023-01-01", "2023-12-31")
    .mean()
)

# Convert grid to list
features = grid.toList(grid.size())
n = features.size().getInfo()

batch_size = 25
labels = {
    0: "Water", 1: "Trees", 2: "Grass", 3: "Flooded vegetation",
    4: "Crops", 5: "Shrub & scrub", 6: "Built area",
    7: "Bare ground", 8: "Snow & ice"
}

results = []

for i in tqdm(range(0, n, batch_size), desc="Processing grid cells"):
    batch = ee.FeatureCollection(features.slice(i, min(i + batch_size, n)))

    # Landcover
    landcover = dw_img.reduceRegions(collection=batch, reducer=ee.Reducer.mode(), scale=30)

    # Lighting
    lighting = viirs_img.reduceRegions(collection=batch, reducer=ee.Reducer.mean(), scale=500)

    # LST
    lst = lst_day.reduceRegions(collection=batch, reducer=ee.Reducer.mean(), scale=1000)

    # NO2
    no2 = no2_img.reduceRegions(collection=batch, reducer=ee.Reducer.mean(), scale=1000)

    # Get info
    landcover_info = landcover.getInfo()
    lighting_info = lighting.getInfo()
    lst_info = lst.getInfo()
    no2_info = no2.getInfo()

    # Combine results
    for f_lc, f_light, f_lst, f_no2 in zip(
        landcover_info["features"],
        lighting_info["features"],
        lst_info["features"],
        no2_info["features"]
    ):
        lc_class = round(f_lc["properties"].get("mode", -1))
        lc_name = labels.get(lc_class, "Unknown")

        # Mean LST
        cell_lst = f_lst["properties"].get("mean")

        # Simple UHI estimate
        if lc_class == 6:  # Built-up
            rural_ref = 28.702616110120662  # placeholder baseline
            uhi_intensity = None if cell_lst is None else (cell_lst - rural_ref)
        else:
            uhi_intensity = None

        results.append({
            "landcover_class": lc_class,
            "landcover_name": lc_name,
            "lighting_radiance": f_light["properties"].get("mean"),
            "lst_celsius": cell_lst,
            "uhi_intensity": uhi_intensity,
            "no2": f_no2["properties"].get("mean"),
            "geometry": json.dumps(f_lc["geometry"])
        })

# Save CSV
df = pd.DataFrame(results)
df.to_csv("delhi_grid_landcover_lighting_uhi_no2.csv", index=False)
print("✅ Saved delhi_grid_landcover_lighting_uhi_no2.csv with UHI + NO2 info")
