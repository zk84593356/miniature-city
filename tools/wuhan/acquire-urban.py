"""Fetch a bounded OSM snapshot for offline Phase 2; never called by runtime."""
import concurrent.futures
import hashlib
import json
import time
import os
import subprocess
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'city-data/wuhan/raw'
ENDPOINT = os.environ.get('WUHAN_OVERPASS', 'https://overpass.kumi.systems/api/interpreter')
urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({})))
RAW.mkdir(parents=True, exist_ok=True)

def fetch(tile):
    x,y=tile[:2]; grid=tile[2] if len(tile)>2 else 4
    path = RAW / (f'urban-osm-{x}-{y}.json' if grid==4 else f'urban-osm-{x}-{y}-{grid}.json')
    if path.exists():
        return json.loads(path.read_bytes())
    west, east = 114.02 + .63*x/grid, 114.02 + .63*(x+1)/grid
    south, north = 30.30 + .53*y/grid, 30.30 + .53*(y+1)/grid
    bbox = f'{south},{west},{north},{east}'
    query = f'''[out:json][timeout:90];(
      way[highway]({bbox}); way[building]({bbox}); way["building:part"]({bbox});
      relation[type=multipolygon][building]({bbox});
      relation[type=multipolygon]["building:part"]({bbox});
      way[waterway=river][name~"长江|汉江|汉水"]({bbox});
    );out meta geom;'''
    for attempt in range(2):
        try:
            request = urllib.request.Request(ENDPOINT, data=urllib.parse.urlencode({'data': query}).encode(), headers={'User-Agent': 'MiniatureCityAtlas/Phase2 offline research'})
            if os.environ.get('WUHAN_CURL'):
                response=subprocess.run(['curl.exe','--compressed','--fail','--silent','--show-error','--max-time','120','--get','--data-urlencode','data='+query,ENDPOINT],capture_output=True,check=True)
                data=json.loads(response.stdout)
            else:
                with urllib.request.urlopen(request, timeout=120) as response:
                    data = json.load(response)
            if data.get('remark'): raise ValueError(data['remark'])
            path.write_bytes((json.dumps(data, ensure_ascii=False, separators=(',', ':'))+'\n').encode())
            print(f'Tile {x},{y}: {len(data["elements"])}', flush=True)
            return data
        except Exception:
            if attempt == 1:
                if grid>=16:raise
                parts=[fetch((x*2+dx,y*2+dy,grid*2)) for dx in range(2) for dy in range(2)]
                merged={}
                for part in parts:
                    for row in part['elements']:merged[(row['type'],row['id'])]=row
                data={'osm3s':{'timestamp_osm_base':min(p['osm3s']['timestamp_osm_base'] for p in parts)},'elements':list(merged.values())}
                path.write_bytes((json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n').encode())
                print(f'Combined tile {x},{y}/{grid}: {len(merged)}',flush=True)
                return data
            time.sleep(5*(attempt+1))

if __name__ == '__main__':
    elements, timestamps = {}, set()
    failures=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures={pool.submit(fetch,(x,y)):(x,y) for x in range(4) for y in range(4)}
        for future in concurrent.futures.as_completed(futures):
            try: data=future.result()
            except Exception as error:
                failures.append(futures[future]);print(f'Failed {futures[future]}: {error}',flush=True);continue
            timestamps.add(data['osm3s']['timestamp_osm_base'])
            for row in data['elements']:
                # User names and editing-account metadata are not needed for geometry.
                row = {k:v for k,v in row.items() if k not in ('user','uid','changeset')}
                key=(row['type'],row['id']);old=elements.get(key)
                if old is None or (row.get('version',0),row.get('timestamp',''))>(old.get('version',0),old.get('timestamp','')):elements[key]=row
    if failures: raise RuntimeError(f'Rerun to retry failed tiles: {failures}')
    output = RAW / 'urban-osm.json'
    payload = {'schema': 'osm-overpass-meta-geom-v1', 'elements': sorted(elements.values(), key=lambda e:(e['type'],e['id']))}
    output.write_bytes((json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n').encode())
    body = output.read_bytes()
    lock = {'file':output.name,'source':'OpenStreetMap','endpoints':['https://overpass.kumi.systems/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter'],'snapshot':sorted(timestamps),'retrievedAt':datetime.now(timezone.utc).isoformat(),'crs':'EPSG:4326','license':'ODbL-1.0','attribution':'© OpenStreetMap contributors','url':'https://www.openstreetmap.org/copyright','bytes':len(body),'sha256':hashlib.sha256(body).hexdigest(),'elements':len(elements),'bounds':[114.02,30.30,114.65,30.83],'snapshotNote':'Merged cached tiles from Kumi and VK public Overpass mirrors; osm_base dates vary as listed. Per-element version/timestamp preserved; newest duplicate version wins. Not a uniform September snapshot.'}
    (ROOT/'src/cities/wuhan/urban-source-lock.json').write_bytes((json.dumps(lock,ensure_ascii=False,indent=2)+'\n').encode())
    print(json.dumps(lock,ensure_ascii=False),flush=True)
