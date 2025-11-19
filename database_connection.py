from flask import Flask, request, jsonify, render_template_string, send_from_directory
import json
import psycopg2
import psycopg2.extras
from flask_cors import CORS
import os
import random

app = Flask(__name__, static_folder='frontend/build', static_url_path='')
CORS(app)

# Database connection
conn = psycopg2.connect(
    dbname="db_test",
    user="postgres",
    password="postgres",
    host="localhost",
    port="5432"
)
# Use autocommit to avoid long-running transactions causing "InFailedSqlTransaction"
conn.autocommit = True

# Endpoint to get local names for coordinates
@app.route("/get_local_names", methods=["POST"])
def get_local_names():
    data = request.get_json()
    coords_list = data.get("coords", [])
    # For now, ignore the database lookup and return 10 random place names
    # populated from the provided list (with replacement) in random order.
    base_names = [
        "Mayur Vihar",
        "Greater Kailash",
        "Dwarka",
        "Connaught Place",
        "Vasant Vihar",
    ]

    # Pick 10 names (with replacement), then shuffle to make order unpredictable
    picked = random.choices(base_names, k=10)
    random.shuffle(picked)

    # Return a list of objects to remain compatible with callers expecting JSON objects
    return jsonify([{"name": n} for n in picked])


@app.route("/get_random_places", methods=["GET"])
def get_random_places():
    """Return `count` random points inside an approximate Delhi bounding box with mock names.

    Query params:
      - count: int (default 10)

    Response: JSON list of {name, coords: [lng, lat]}
    """
    try:
        count = int(request.args.get("count", 10))
    except ValueError:
        count = 10

    # Use the five user-provided places with approximate centroids.
    # Coordinates are given as [lng, lat]. We'll add a small jitter so repeated calls look "random".
    base_places = [
        {"name": "Mayur Vihar", "coords": [77.2965, 28.6206]},
        {"name": "Dwarka", "coords": [77.0320, 28.5952]},
        {"name": "Connaught Place", "coords": [77.2195, 28.6329]},
        {"name": "Greater Kailash", "coords": [77.2265, 28.5469]},
        {"name": "Vasant Vihar", "coords": [77.1426, 28.5566]},
    ]

    def jitter(lng, lat, max_deg=0.004):
        # max_deg ~ ~400m; jitter both lng and lat by up to +-max_deg
        return [lng + random.uniform(-max_deg, max_deg), lat + random.uniform(-max_deg, max_deg)]

    results = []
    for i in range(count):
        place = random.choice(base_places)
        lng0, lat0 = place["coords"]
        results.append({
            "name": place["name"],
            "coords": jitter(lng0, lat0)
        })

    return jsonify(results)

@app.route("/")
def index():
    # If React build exists, serve it. Otherwise fall back to the original HTML file.
    build_index = os.path.join(app.static_folder, 'index.html')
    if os.path.exists(build_index):
        return send_from_directory(app.static_folder, 'index.html')
    with open("9_alternate_hope.html", encoding="utf-8") as f:
        return render_template_string(f.read())


@app.route("/get_district_data")
def get_district_data():
    import traceback
    district = request.args.get("district")
    if not district:
        return jsonify({"error": "No district provided"}), 400

    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        # Get grid data as before
        cur.execute("""
            WITH locations AS (
                SELECT gid, name_1 AS name, geom FROM gadm41_ind_1
                UNION ALL
                SELECT gid, name_2 AS name, geom FROM gadm41_ind_2
                UNION ALL
                SELECT gid, name_3 AS name, geom FROM gadm41_ind_3
            )
            SELECT 
                w.gid,
                w.landcove_1,
                w.landcover_,
                w.lighting_r,
                w.uhi_intens,
                w.lst_celsiu,
                w.no2,
                ST_AsGeoJSON(w.geom)::json AS geometry,
                l.name AS location_name
            FROM testing_shapes w
            JOIN locations l
              ON ST_Intersects(w.geom, l.geom)
            WHERE LOWER(l.name) = LOWER(%s);
        """, (district,))
        grid_rows = cur.fetchall()

        # Get all police station data for Delhi (no district filter)
        # Return lon/lat from the geometry column if available (transform to WGS84)
        # Avoid calling ST_Transform on geometries with unknown SRID (SRID = 0)
        cur.execute("""
            SELECT name, district, x, y,
                   CASE WHEN ST_SRID(geom) = 0 THEN NULL ELSE ST_X(ST_Transform(geom, 4326)) END AS lon,
                   CASE WHEN ST_SRID(geom) = 0 THEN NULL ELSE ST_Y(ST_Transform(geom, 4326)) END AS lat
            FROM ps_location_ascii;
        """)
        ps_rows = cur.fetchall()

        print(f"✅ Query for district '{district}' returned {len(grid_rows)} grid rows and {len(ps_rows)} police stations", flush=True)
        print("Police station raw rows:", flush=True)
        for ps in ps_rows:
            print(ps, flush=True)

        # Format police station coordinates as [lng, lat] (convert x/y if needed)
        import re
        def parse_coord_str(coord_str):
            if isinstance(coord_str, (float, int)):
                return float(coord_str)
            m = re.match(r"[\d]+\s+(\d+)\s+([\d\.]+)\s*([NSEW])", coord_str)
            if not m:
                return None
            deg = float(m.group(1))
            minu = float(m.group(2))
            dir = m.group(3)
            val = deg + minu / 60.0
            if dir in ['S', 'W']:
                val = -val
            return val

        def parse_coords(x, y):
            lng = parse_coord_str(x)
            lat = parse_coord_str(y)
            return {'x': lng, 'y': lat}

        police_stations = []
        for row in ps_rows:
            lon = row.get('lon') if isinstance(row, dict) else None
            lat = row.get('lat') if isinstance(row, dict) else None
            if lon is not None and lat is not None:
                coords = {'x': float(lon), 'y': float(lat)}
            else:
                coords = parse_coords(row['x'], row['y'])
            police_stations.append({
                'name': row['name'],
                'district': row['district'],
                'coords': coords
            })

        # If there are few or no police stations, append believable mock points
        # so the frontend can render markers for testing/visualization.
        # Use a bounding box around Delhi for mock points.
        try:
            min_lng, max_lng = 76.90, 77.35
            min_lat, max_lat = 28.40, 28.90
            desired_total = 50
            existing = len([p for p in police_stations if p.get('coords') and isinstance(p['coords'].get('x'), (int, float))])
            to_add = max(0, desired_total - existing)
            for i in range(to_add):
                lng = random.uniform(min_lng, max_lng)
                lat = random.uniform(min_lat, max_lat)
                police_stations.append({
                    'name': f'PS MOCK {i+1}',
                    'district': 'MOCK',
                    'coords': {'x': lng, 'y': lat}
                })
            if to_add > 0:
                print(f'Appended {to_add} mock police station points for visualization', flush=True)
        except Exception:
            pass

        out = {
            'grids': grid_rows,
            'police_stations': police_stations
        }
        try:
            print('Sending police_stations (sample 5):', json.dumps(police_stations[:5], default=str), flush=True)
        except Exception:
            print('Could not JSON-encode police_stations for debug output', flush=True)
        return jsonify(out)
    except Exception as e:
        print('Error in get_district_data:', flush=True)
        traceback.print_exc()
        return jsonify({'error': 'internal server error', 'message': str(e)}), 500

if __name__ == "__main__":
    app.run(port=5000, debug=True)
