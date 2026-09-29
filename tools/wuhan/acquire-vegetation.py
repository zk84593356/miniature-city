"""Fetch and lock OSM green areas offline. Runtime never calls Overpass."""
import hashlib, json, subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
RAW=ROOT/'city-data/wuhan/raw'
QUERY='''[out:json][timeout:90];(
 nwr[leisure~"^(park|garden)$"](30.30,114.02,30.83,114.65);
 nwr[landuse~"^(grass|forest)$"](30.30,114.02,30.83,114.65);
 nwr[natural~"^(wood|tree|tree_row|scrub)$"](30.30,114.02,30.83,114.65);
);out meta geom;'''
ENDPOINTS=['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter']
def write(p,data):p.write_bytes((json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n').encode('utf-8'))
if __name__=='__main__':
 output=RAW/'vegetation-osm.json'
 for endpoint in ENDPOINTS:
  print('Fetching green areas: '+endpoint,flush=True)
  try:
   r=subprocess.run(['curl.exe','--ssl-no-revoke','--fail','--silent','--show-error','--compressed','--connect-timeout','15','--max-time','130','--get','--data-urlencode','data='+QUERY,endpoint],capture_output=True,check=True)
   data=json.loads(r.stdout)
   if data.get('remark'):raise ValueError(data['remark'])
   data['elements']=[{k:v for k,v in e.items() if k not in ('uid','user','changeset')} for e in data['elements']]
   write(output,data);body=output.read_bytes()
   write(ROOT/'src/cities/wuhan/vegetation-source-lock.json',dict(file=output.name,source='OpenStreetMap',endpoint=endpoint,snapshot=data['osm3s']['timestamp_osm_base'],retrievedAt=datetime.now(timezone.utc).isoformat(),query=QUERY,bytes=len(body),sha256=hashlib.sha256(body).hexdigest(),elements=len(data['elements']),license='ODbL-1.0',attribution='© OpenStreetMap contributors',tagDocumentation=['https://wiki.openstreetmap.org/wiki/Vegetation','https://wiki.openstreetmap.org/wiki/Tag:leisure=park'],proceduralPlacement='Only inside sourced green polygons; each inferred plant marked estimated.'))
   print(f'Locked {len(data["elements"])} elements / {len(body)} bytes',flush=True);break
  except Exception as error:print(str(error),getattr(error,'stderr',b'').decode(errors='replace')[-1000:],flush=True)
 else:raise RuntimeError('All OSM green-area endpoints failed; no invented polygons substituted.')
