import pandas as pd
df = pd.read_csv('delhi_landcover_lighting_uhi_grid.csv')

# define rural classes
rural_mask = df['landcover_class'].isin([0,1,2,3,4,5,7])

city_rural_mean = df.loc[rural_mask, 'lst_celsius'].median()   # use median or mean
print('City rural baseline (°C):', city_rural_mean)

# compute UHI for built-up cells relative to this baseline
df['uhi_city_rural_median'] = df.apply(
    lambda r: (r['lst_celsius'] - city_rural_mean) if r['landcover_class'] == 6 else None,
    axis=1
)

df.to_csv('delhi_landcover_lighting_uhi_grid_with_baseline.csv', index=False)
