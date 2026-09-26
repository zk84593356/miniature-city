"""Small, cached OSM identity query for formal Phase 3 places."""
import json, subprocess, sys
from phase2_common import RAW, write
target=RAW/'places-osm.json'
if not target.exists() or '--refresh' in sys.argv:
    query='[out:json][timeout:45];(relation(7160933);node(10799812648););out meta geom;'
    for endpoint in ['https://overpass.kumi.systems/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter']:
        response=subprocess.run(['curl.exe','--compressed','--fail','--silent','--show-error','--max-time','70','--get','--data-urlencode','data='+query,endpoint],capture_output=True)
        if response.returncode==0:break
    response.check_returncode()
    data=json.loads(response.stdout)
    if data.get('remark'):raise ValueError(data['remark'])
    write(target,data)
print(target.name)
