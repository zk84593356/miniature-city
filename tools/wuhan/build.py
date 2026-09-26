"""Wuhan geographic pack: real DSM, constrained land mesh, OSM water holes.

Run with PYTHONPATH=.tools/geo. Coordinates in output: x east, y up, z south;
100 metres per unit. No procedural hill generation or vertical exaggeration.
"""
import hashlib
import json
import math
import gzip
from pathlib import Path
import numpy as np
import osmium
import rasterio
import shapely
from shapely.geometry import shape, box, Polygon
from shapely.ops import transform
from scipy.ndimage import map_coordinates
from scipy.spatial import cKDTree
import triangle

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'city-data/wuhan/raw'
OUT = ROOT / 'city-data/wuhan/generated'
CONFIG = json.loads((ROOT / 'src/cities/wuhan/config.json').read_text(encoding='utf8'))
DEG = math.pi / 180 * 6371008.8
COS = math.cos(math.radians(30.56))

def project(lon, lat, z=None):
    return (np.asarray(lon) - 114.32) * DEG * COS, (30.56 - np.asarray(lat)) * DEG

def polygons(g):
    if g.geom_type == 'Polygon':
        yield g
    elif hasattr(g, 'geoms'):
        for p in g.geoms:
            yield from polygons(p)

def dump(name, data):
    # Hashes describe the Git/Pages bytes: text-mode writes translate LF to
    # CRLF on Windows, whereas .gitattributes checks JSON out with LF.
    payload = (json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
    (OUT / name).write_bytes(payload)

def planar(vertices, segments, holes):
    # Valid OSM polygons may have rings touching at one vertex; Triangle needs
    # a single vertex index for that shared point, including across rings.
    unique, inverse = np.unique(np.round(vertices, 6), axis=0, return_inverse=True)
    edges = inverse[np.asarray(segments)]
    edges = edges[edges[:, 0] != edges[:, 1]]
    edges = np.unique(np.sort(edges, axis=1), axis=0)
    data = dict(vertices=unique, segments=edges)
    if holes:
        data['holes'] = np.asarray(holes)
    return data

def mesh(name, positions, indices):
    positions = np.asarray(positions, dtype='<f4')
    indices = np.asarray(indices, dtype='<u4')
    # Triangle is CCW in x/z; reverse for upward-facing Three geometry.
    indices = indices[:, [0, 2, 1]]
    raw = positions.tobytes() + indices.tobytes()
    (OUT / (name + '.bin')).write_bytes(gzip.compress(raw, compresslevel=6, mtime=0))
    return dict(file=name + '.bin', vertices=len(positions), triangles=len(indices),
                encoding='float32-xyz-uint32-triangles-le')

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sources = json.loads((ROOT / 'src/cities/wuhan/source-lock.json').read_text(encoding='utf8'))
    for source in sources:
        body = (RAW / source['file']).read_bytes()
        if len(body) != source['bytes'] or hashlib.sha256(body).hexdigest() != source['sha256']:
            raise ValueError(f"Source snapshot differs from source-lock.json: {source['file']}")
    bounds = shapely.segmentize(transform(project, box(*CONFIG['bounds']['context'])), 60)
    core = transform(project, box(*CONFIG['bounds']['core']))
    with rasterio.open(RAW / 'dem.tif') as dem:
        raster = dem.read(1)
        inverse = ~dem.transform

    def sample(xz):
        xy = np.asarray(xz)
        lon = xy[:, 0] / (DEG * COS) + 114.32
        lat = 30.56 - xy[:, 1] / DEG
        col, row = inverse * (lon, lat)
        return map_coordinates(raster, [row - .5, col - .5], order=1, mode='nearest')

    waters, names, peaks = [], [], []
    factory = osmium.geom.GeoJSONFactory()
    geographic_bounds = box(*CONFIG['bounds']['context'])

    class Extract(osmium.SimpleHandler):
        def area(self, area):
            if not (area.tags.get('natural') == 'water' or area.tags.get('waterway') == 'riverbank' or area.tags.get('landuse') == 'reservoir'):
                return
            try:
                geom = shape(json.loads(factory.create_multipolygon(area)))
                if not geom.intersects(geographic_bounds):
                    return
                geom = transform(project, shapely.make_valid(geom).intersection(geographic_bounds))
                for poly in polygons(geom):
                    if poly.area >= 3000:
                        waters.append(poly)
                        names.append(dict(osmId=int(area.orig_id()), type='way' if area.from_way() else 'relation', name=area.tags.get('name', ''), areaM2=round(poly.area)))
            except (RuntimeError, ValueError):
                raise RuntimeError(f'Cannot decode water OSM area {area.id}')

        def node(self, node):
            if node.tags.get('natural') in ('peak', 'hill') and node.location.valid():
                lon, lat = node.location.lon, node.location.lat
                if geographic_bounds.covers(shapely.Point(lon, lat)):
                    peaks.append(dict(name=node.tags.get('name', ''), position=[lon, lat], osmId=int(node.id), elevationTag=node.tags.get('ele')))

    print('Extracting source water polygons...', flush=True)
    overture = RAW / 'water-overture-2026-09-23.geojson'
    if overture.exists():
        for feature in json.loads(overture.read_text(encoding='utf8'))['features']:
            geom = shape(feature['geometry'])
            if not geom.intersects(geographic_bounds):
                continue
            geom = transform(project, shapely.make_valid(geom).intersection(geographic_bounds))
            properties = feature['properties']
            for poly in polygons(geom):
                if poly.area >= 3000:
                    waters.append(poly)
                    names.append(dict(id=properties['id'], name=(properties.get('names') or {}).get('primary', ''), sources=properties.get('sources'), areaM2=round(poly.area)))
    else:
        Extract().apply_file(str(RAW / 'hubei-260924.osm.pbf'), locations=True, idx='flex_mem')
    assert len(waters) > 50, f'Unexpectedly sparse water coverage: {len(waters)}'
    # Snapping to a centimetre grid removes numerical slivers where separately
    # projected/cropped OSM members share a boundary. Record this precision below.
    waters = [shapely.set_precision(shapely.make_valid(p), .01) for p in waters]
    water = shapely.make_valid(shapely.union_all(waters, grid_size=.01).simplify(3, preserve_topology=True))
    water = shapely.union_all(list(polygons(water)), grid_size=.01).intersection(bounds)
    water_polys = [p for p in polygons(water) if p.area > 1]
    water = shapely.union_all(water_polys)
    land = bounds.difference(water)
    print(f'{len(waters)} source water features; {len(water_polys)} connected polygons', flush=True)

    # Sample observed interior DSM to estimate a flat level per connected body.
    water_positions, water_indices, water_features = [], [], []
    shore_points, shore_heights = [], []
    for water_index, poly in enumerate(water_polys):
        if water_index % 100 == 0:
            print(f'Triangulating water {water_index}/{len(water_polys)}', flush=True)
        minx, minz, maxx, maxz = poly.bounds
        xx, zz = np.meshgrid(np.arange(minx, maxx, 150), np.arange(minz, maxz, 150))
        probes = np.column_stack([xx.ravel(), zz.ravel()])
        inside = shapely.contains_xy(poly.buffer(-25), probes[:, 0], probes[:, 1])
        probes = probes[inside]
        if len(probes) == 0:
            p = poly.representative_point()
            probes = np.array([[p.x, p.y]])
        level = float(np.median(sample(probes)))
        rings = [np.asarray(r.coords)[:-1] for r in [poly.exterior, *poly.interiors]]
        verts, segments, holes = [], [], []
        for ring in rings:
            start = len(verts)
            verts.extend(ring)
            segments.extend((start + i, start + (i + 1) % len(ring)) for i in range(len(ring)))
        for ring in poly.interiors:
            p = Polygon(ring).representative_point()
            holes.append([p.x, p.y])
        pslg = planar(verts, segments, holes)
        result = triangle.triangulate(pslg, 'pQ')
        offset = len(water_positions)
        water_positions.extend([[x / 100, level / 100, z / 100] for x, z in result['vertices']])
        water_indices.extend(result['triangles'] + offset)
        shore_points.extend(verts)
        shore_heights.extend([level] * len(verts))
        water_features.append(dict(levelMeters=round(level, 3), rings=[np.round(r / 100, 5).tolist() for r in rings]))
    water_meta = mesh('water', water_positions, water_indices)
    shore_tree = cKDTree(shore_points)
    shore_heights = np.array(shore_heights)
    dense_shore = np.concatenate([np.asarray(r.coords) for p in water_polys for r in [shapely.segmentize(p.exterior, 20), *[shapely.segmentize(h, 20) for h in p.interiors]]])
    distance_tree = cKDTree(dense_shore)

    # One continuous constrained mesh: no independently simplified tile edges.
    # 120 m background / 60 m core / 30 m hill windows, all source heights intact.
    minx, minz, maxx, maxz = bounds.bounds
    xx, zz = np.meshgrid(np.arange(minx, maxx, 60), np.arange(minz, maxz, 60))
    candidates = np.column_stack([xx.ravel(), zz.ravel()])
    inside_core = shapely.contains_xy(core, candidates[:, 0], candidates[:, 1])
    coarse = (np.indices(xx.shape).sum(axis=0).ravel() % 2 == 0)
    # checkerboard gives ~85 m context triangles, preserving more than budgeted 120 m.
    candidates = candidates[inside_core | coarse]
    hill_windows = []
    for place in CONFIG['places']:
        if place['kind'] != 'hill':
            continue
        x, z = project(*place['position'])
        region = box(x - 1200, z - 1000, x + 1200, z + 1000)
        hill_windows.append((place['name'], region))
        hx, hz = np.meshgrid(np.arange(x - 1200, x + 1201, 30), np.arange(z - 1000, z + 1001, 30))
        candidates = candidates[~shapely.contains_xy(region, candidates[:, 0], candidates[:, 1])]
        candidates = np.concatenate([candidates, np.column_stack([hx.ravel(), hz.ravel()])])
    candidates = np.unique(np.round(candidates, 6), axis=0)
    land_positions, land_indices = [], []
    shoreline_count = 0
    for poly in polygons(land):
        verts, segments, holes = [], [], []
        for ring in [poly.exterior, *poly.interiors]:
            coords = np.asarray(ring.coords)[:-1]
            start = len(verts)
            verts.extend(coords)
            segments.extend((start + i, start + (i + 1) % len(coords)) for i in range(len(coords)))
        edge_count = len(verts)
        for ring in poly.interiors:
            p = Polygon(ring).representative_point()
            holes.append([p.x, p.y])
        probes = candidates[shapely.contains_xy(poly, candidates[:, 0], candidates[:, 1])]
        verts.extend(probes)
        pslg = planar(verts, segments, holes)
        for refinement in range(7):
            result = triangle.triangulate(pslg, 'pQ')
            v = result['vertices']
            y = sample(v)
            d, nearest = shore_tree.query(v)
            bank = d < .01
            y[bank] = shore_heights[nearest[bank]]
            tris = result['triangles']
            centers = v[tris].mean(axis=1)
            error = np.abs(y[tris].mean(axis=1) - sample(centers))
            distances, _ = distance_tree.query(centers)
            tolerance = np.where(shapely.contains_xy(core, centers[:, 0], centers[:, 1]), 1.4, 3.5)
            bad = (error > tolerance) & (distances > 100)
            if not bad.any() or refinement == 6:
                break
            selected = v[tris[bad]]
            additions = np.concatenate([centers[bad], (selected[:, 0] + selected[:, 1]) / 2, (selected[:, 1] + selected[:, 2]) / 2, (selected[:, 0] + selected[:, 2]) / 2])
            all_vertices = np.concatenate([pslg['vertices'], additions])
            # Keep segment indices tied to their original vertex list.
            pslg = planar(all_vertices, pslg['segments'], holes)
            print(f'Refine land {refinement + 1}: {bad.sum()} triangles', flush=True)
        shoreline_count += int(bank.sum())
        offset = len(land_positions)
        land_positions.extend(np.column_stack([v[:, 0] / 100, y / 100, v[:, 1] / 100]))
        land_indices.extend(result['triangles'] + offset)
    terrain_meta = mesh('terrain', land_positions, land_indices)
    print(f'Terrain: {terrain_meta}', flush=True)

    # Quantify mesh interpolation against source at triangle centroids, by region.
    vertices = np.array(land_positions) * 100
    triangles = vertices[np.array(land_indices)]
    centers = triangles.mean(axis=1)
    errors = np.abs(centers[:, 1] - sample(centers[:, [0, 2]]))
    bank_distance, _ = distance_tree.query(centers[:, [0, 2]])
    interior = bank_distance > 100
    def error_summary(mask):
        e = errors[mask & interior]
        return dict(samples=len(e), p95Meters=round(float(np.percentile(e, 95)), 3), maxMeters=round(float(e.max()), 3)) if len(e) else None
    hill_qa = []
    for name, region in hill_windows:
        mask = shapely.contains_xy(region, vertices[:, 0], vertices[:, 2])
        cmask = shapely.contains_xy(region, centers[:, 0], centers[:, 2])
        hill_qa.append(dict(name=name, minMeters=round(float(vertices[mask, 1].min()), 2), maxMeters=round(float(vertices[mask, 1].max()), 2), interpolation=error_summary(cmask)))
    report = dict(sourceKind='DSM, not bare-earth DTM', exaggeration=1, waterFeatures=len(waters), waterBodies=len(water_polys), waterHoles=sum(len(p.interiors) for p in water_polys), waterAreaKm2=round(water.area / 1e6, 3), landAreaKm2=round(land.area / 1e6, 3), shorelineVertices=shoreline_count, shoreSimplificationMeters=3, topologySnapMeters=.01, interiorErrorExcludesShoreMeters=100, interpolation=error_summary(np.ones(len(centers), dtype=bool)), coreInterpolation=error_summary(shapely.contains_xy(core, centers[:, 0], centers[:, 2])), hills=hill_qa, osmPeaks=peaks, processing=['Bilinear DSM sampling; no global smoothing or arbitrary height cutoff.', 'Water union preserves holes, clipped to study extent; source features under 3000 m2 omitted; numerical fragments under 1 m2 removed.', 'Each connected water body uses median interior DSM level; not a measured current water stage.', 'Land bank vertices share water level; all interior elevations retain DSM values.', 'Adaptive subdivision of interior triangles above 1.4 m core / 3.5 m background centroid error, up to six rounds.', 'Continuous static mesh; dynamic LOD deferred to avoid seam/collision divergence.'])
    dump('water.json', water_features)
    dump('water-provenance.json', names)
    dump('quality.json', report)
    files = {}
    for name in ['terrain.bin', 'water.bin', 'water.json', 'water-provenance.json', 'quality.json']:
        b = (OUT / name).read_bytes()
        files[name] = dict(bytes=len(b), sha256=hashlib.sha256(b).hexdigest())
    for name in ['terrain.bin', 'water.bin']:
        files[name]['compression'] = 'gzip'
        files[name]['decodedBytes'] = len(gzip.decompress((OUT / name).read_bytes()))
    dataset = hashlib.sha256(json.dumps(dict(config=CONFIG, files=files, sources=sources), sort_keys=True).encode()).hexdigest()[:16]
    manifest = dict(CONFIG, datasetId=dataset, dataRoot='../../data/wuhan/', dataFiles=files, terrain=terrain_meta, water=water_meta, sources=sources, attribution='© OpenStreetMap contributors (ODbL 1.0); Copernicus DEM GLO-30 © DLR e.V. 2010–2014 / © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA; all rights reserved.')
    dump('manifest.json', manifest)
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)

if __name__ == '__main__':
    main()
