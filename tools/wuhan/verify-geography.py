"""Independent source/mesh checks and east-west profiles for four hill windows."""
import csv
import gzip
import hashlib
import json
import math
from pathlib import Path
import numpy as np
import rasterio
import shapely
from scipy.ndimage import map_coordinates
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'city-data/wuhan/generated'
manifest = json.loads((DATA / 'manifest.json').read_text(encoding='utf8'))
quality = json.loads((DATA / 'quality.json').read_text(encoding='utf8'))
for source in manifest['sources']:
    body = (ROOT / 'city-data/wuhan/raw' / source['file']).read_bytes()
    assert hashlib.sha256(body).hexdigest() == source['sha256'], source['file']

def read_mesh(name):
    spec = manifest[name]
    body = (DATA / spec['file']).read_bytes()
    if manifest['dataFiles'][spec['file']].get('compression') == 'gzip':
        body = gzip.decompress(body)
    vertices = np.frombuffer(body, dtype='<f4', count=spec['vertices'] * 3).reshape(-1, 3).astype(np.float64)
    indices = np.frombuffer(body, dtype='<u4', offset=spec['vertices'] * 12).reshape(-1, 3)
    return vertices, indices

vertices, indices = read_mesh('terrain')
wv, wi = read_mesh('water')
triangles = vertices[indices]
def area(tris):
    a = tris[:, 1] - tris[:, 0]
    b = tris[:, 2] - tris[:, 0]
    return np.abs(a[:, 0] * b[:, 2] - a[:, 2] * b[:, 0]).sum() / 2 * .01
areas = dict(landKm2=float(area(triangles)), waterKm2=float(area(wv[wi])))
assert abs(areas['landKm2'] - quality['landAreaKm2']) < .005
assert abs(areas['waterKm2'] - quality['waterAreaKm2']) < .005

waters = json.loads((DATA / 'water.json').read_text(encoding='utf8'))
water_geometry = shapely.union_all([shapely.Polygon(w['rings'][0], w['rings'][1:]) for w in waters])
shore = shapely.get_coordinates(shapely.segmentize(water_geometry.boundary, .2))
shore_tree = cKDTree(shore)
projection = manifest['projection']
degree = math.pi / 180 * projection['earthRadiusMeters'] / projection['worldUnitMeters']
cos = math.cos(math.radians(projection['origin'][1]))
def project(lon, lat):
    return (lon - projection['origin'][0]) * degree * cos, (projection['origin'][1] - lat) * degree

with rasterio.open(ROOT / 'city-data/wuhan/raw/dem.tif') as dem:
    raster, inverse = dem.read(1), ~dem.transform
def source_height(points):
    lon = points[:, 0] / (degree * cos) + projection['origin'][0]
    lat = projection['origin'][1] - points[:, 1] / degree
    col, row = inverse * (lon, lat)
    return map_coordinates(raster, [row - .5, col - .5], order=1, mode='nearest')

rng = np.random.default_rng(20260926)
selection = rng.choice(len(indices), min(100000, len(indices)), replace=False)
chosen = triangles[selection]
# Independent barycentric positions, not the builder's centroid criterion.
weights = rng.dirichlet([2, 2, 2], len(chosen))
samples = np.einsum('nij,ni->nj', chosen, weights)
distance = shore_tree.query(samples[:, [0, 2]])[0] * 100
interior = distance > 100
errors = np.abs(samples[:, 1] * 100 - source_height(samples[:, [0, 2]]))
water_overlap = shapely.contains_xy(water_geometry, samples[:, 0], samples[:, 2]) & (distance > .1)
assert not water_overlap.any(), 'Land mesh enters a water polygon'

def summary(mask):
    values = errors[mask & interior]
    return dict(samples=len(values), p95Meters=round(float(np.percentile(values, 95)), 3), maxMeters=round(float(values.max()), 3))
core = manifest['bounds']['core']
cx0, cz1 = project(core[0], core[1]); cx1, cz0 = project(core[2], core[3])
core_mask = (samples[:, 0] > cx0) & (samples[:, 0] < cx1) & (samples[:, 2] > cz0) & (samples[:, 2] < cz1)
result = dict(datasetId=manifest['datasetId'], sourceHashesVerified=True, projectedAreas=areas, landWaterOverlapSamples=int(water_overlap.sum()), randomInteriorError=summary(np.ones(len(samples), dtype=bool)), coreRandomInteriorError=summary(core_mask), sampling='100000 fixed-seed barycentric samples; exclude 100 m hydro-conditioned shoreline buffer; units metres; not absolute real-world DEM accuracy', hills=[])

profile_rows = []
for place in manifest['places']:
    if place['kind'] != 'hill': continue
    x, z = project(*place['position'])
    mask = (np.min(triangles[:, :, 0], axis=1) <= x + 13) & (np.max(triangles[:, :, 0], axis=1) >= x - 13) & (np.min(triangles[:, :, 2], axis=1) <= z + 11) & (np.max(triangles[:, :, 2], axis=1) >= z - 11)
    local = triangles[mask]
    polygons = shapely.polygons(local[:, :, [0, 2]])
    tree = shapely.STRtree(polygons)
    xvalues = np.linspace(x - 12, x + 12, 81)
    points = np.column_stack([xvalues, np.full(len(xvalues), z)])
    heights = source_height(points)
    for position, source in zip(points, heights):
        matches = tree.query(shapely.Point(position), predicate='intersects')
        height = None
        if len(matches):
            triangle = local[matches[0]]
            matrix = np.column_stack([triangle[:, 0], triangle[:, 2], np.ones(3)]).T
            bary = np.linalg.solve(matrix, [*position, 1])
            height = float(bary @ triangle[:, 1] * 100)
        profile_rows.append([place['name'], round((position[0] - x) * 100, 1), round(float(source), 3), None if height is None else round(height, 3), 'water' if water_geometry.contains(shapely.Point(position)) else 'land'])
    local_samples = (np.abs(samples[:, 0] - x) < 12) & (np.abs(samples[:, 2] - z) < 10)
    result['hills'].append(dict(name=place['name'], **summary(local_samples)))

assert result['coreRandomInteriorError']['p95Meters'] < 2
(ROOT / 'docs/wuhan-qa.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
with (ROOT / 'docs/wuhan-profiles.csv').open('w', encoding='utf-8-sig', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['hill', 'distance_from_anchor_m', 'source_dsm_m', 'mesh_m', 'surface'])
    writer.writerows(profile_rows)
print(json.dumps(result, ensure_ascii=False, indent=2))
