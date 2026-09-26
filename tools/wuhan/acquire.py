"""Acquire fixed source editions; large raw files stay outside Git."""
import hashlib
import json
from pathlib import Path
import urllib.request
import sys
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'city-data/wuhan/raw'
SOURCES = [
    ('dem.tif', 'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N30_00_E114_00_DEM/Copernicus_DSM_COG_10_N30_00_E114_00_DEM.tif'),
    ('hubei-260924.osm.pbf', 'https://download.geofabrik.de/asia/china/hubei-260924.osm.pbf'),
]

def acquire(source):
    name, url = source
    target = RAW / name
    if not target.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'MiniatureCityAtlas/0.1 (Wuhan geographic prototype)'})
        # Ignore environment proxy configuration; these are public anonymous sources.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(request, timeout=180) as response, target.with_suffix('.part').open('wb') as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        target.with_suffix('.part').replace(target)
    result = dict(file=name, url=url, bytes=target.stat().st_size,
                  sha256=hashlib.sha256(target.read_bytes()).hexdigest())
    print(json.dumps(result), flush=True)
    return result

if __name__ == '__main__':
    RAW.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=2) as executor:
        sources = list(executor.map(acquire, SOURCES if '--with-hubei' in sys.argv else SOURCES[:1]))
    existing = json.loads((RAW / 'sources.json').read_text(encoding='utf8')) if (RAW / 'sources.json').exists() else []
    merged = {s['file']: s for s in existing}
    merged.update({s['file']: s for s in sources})
    (RAW / 'sources.json').write_text(json.dumps(list(merged.values()), indent=2) + '\n', encoding='utf8')
