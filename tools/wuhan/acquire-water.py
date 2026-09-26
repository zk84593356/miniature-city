"""Fixed-release Overture / OSM water fallback for unavailable Geofabrik nodes."""
import hashlib
import json
from pathlib import Path
import urllib.request
import io
import sys
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
import pyarrow.parquet as pq
from shapely import from_wkb
from shapely.geometry import mapping

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'city-data/wuhan/raw'
RELEASE = '2026-09-23.0'
RAW.mkdir(parents=True, exist_ok=True)
target = RAW / 'water-overture-2026-09-23.geojson'
if target.exists() and (RAW / 'sources.json').exists() and '--refresh' not in sys.argv:
    previous = json.loads((RAW / 'sources.json').read_text(encoding='utf8'))
    match = next((s for s in previous if s['file'] == target.name), None)
    if match and hashlib.sha256(target.read_bytes()).hexdigest() == match['sha256']:
        print('Verified cached water snapshot; use --refresh to download again.')
        raise SystemExit(0)
urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({})))

BASE = 'https://overturemapswestus2.blob.core.windows.net/release'
index_url = BASE + '?restype=container&comp=list&prefix=' + RELEASE + '/theme=base/type=water/'
index_path = RAW / 'azure-water-index.xml'
if not index_path.exists():
    index_path.write_bytes(urllib.request.urlopen(index_url, timeout=60).read())
blobs = ET.fromstring(index_path.read_bytes()).findall('./Blobs/Blob')

class RangeReader(io.RawIOBase):
    """Anonymous HTTPS range reads; never downloads entire global parquet shards."""
    def __init__(self, url, size):
        self.url, self.size, self.position = url, size, 0
        self.cache = {}
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.position
    def seek(self, offset, whence=0):
        self.position = offset if whence == 0 else (self.position if whence == 1 else self.size) + offset
        return self.position
    def read(self, count=-1):
        if count < 0: count = self.size - self.position
        if count == 0: return b''
        start = self.position
        key = (start, count)
        if key not in self.cache:
            request = urllib.request.Request(self.url, headers={'Range': f'bytes={start}-{start + count - 1}'})
            for attempt in range(3):
                try:
                    with urllib.request.urlopen(request, timeout=60) as response:
                        if response.status != 206: raise ValueError('Server did not honor range')
                        self.cache[key] = response.read()
                    break
                except Exception:
                    if attempt == 2: raise
        self.position += len(self.cache[key])
        return self.cache[key]

def extract(blob):
    url = BASE + '/' + blob.findtext('Name')
    file = pq.ParquetFile(RangeReader(url, int(blob.findtext('./Properties/Content-Length'))))
    result = []
    for i in range(file.metadata.num_row_groups):
        group = file.metadata.row_group(i)
        stats = {group.column(j).path_in_schema: group.column(j).statistics for j in range(group.num_columns)}
        if (stats['bbox.xmin'].min > 114.65 or stats['bbox.xmax'].max < 114.02 or stats['bbox.ymin'].min > 30.83 or stats['bbox.ymax'].max < 30.30):
            continue
        rows = file.read_row_group(i, columns=['id', 'geometry', 'bbox', 'names', 'sources', 'subtype', 'class'], use_threads=False).to_pylist()
        for row in rows:
            b = row['bbox']
            if b['xmin'] > 114.65 or b['xmax'] < 114.02 or b['ymin'] > 30.83 or b['ymax'] < 30.30: continue
            geometry = from_wkb(row.pop('geometry'))
            if geometry.geom_type in ('Polygon', 'MultiPolygon'):
                result.append(dict(type='Feature', geometry=mapping(geometry), properties=row))
    print(f"Scanned {blob.findtext('Name').split('/')[-1][:10]}: {len(result)} features", flush=True)
    return result

with ThreadPoolExecutor(max_workers=6) as pool:
    features = [feature for result in pool.map(extract, blobs) for feature in result]
assert len(features) > 50
target.write_text(json.dumps(dict(type='FeatureCollection', features=features), ensure_ascii=False, default=str), encoding='utf8')
sources = []
for file, url, license in [
    ('dem.tif', 'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N30_00_E114_00_DEM/Copernicus_DSM_COG_10_N30_00_E114_00_DEM.tif', 'Copernicus DEM GLO-30 free license'),
    (target.name, 'https://docs.overturemaps.org/blog/2026/09/23/release-notes/', 'ODbL-1.0; original per-feature sources retained'),
]:
    b = (RAW / file).read_bytes()
    sources.append(dict(file=file, url=url, license=license, bytes=len(b), sha256=hashlib.sha256(b).hexdigest()))
(RAW / 'sources.json').write_text(json.dumps(sources, indent=2) + '\n', encoding='utf8')
print(json.dumps(sources, indent=2), flush=True)
