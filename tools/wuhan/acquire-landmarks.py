"""Optional OSM site envelopes used only for stable future model replacement."""
import json
import subprocess
from pathlib import Path

raw=Path(__file__).resolve().parents[2]/'city-data/wuhan/raw'
queries={
    'landmark-osm.json':'nwr["name"~"^(湖北省博物馆|武汉站|武汉新能源研究院|光谷马蹄莲)$"](30.3,114.02,30.83,114.65);',
    'landmark-extra-osm.json':'(nwr["name"~"马蹄莲|新能源"](30.3,114.02,30.83,114.65);nwr["railway"="station"]["name"~"武汉"](30.3,114.02,30.83,114.65););',
}
for name,query in queries.items():
    if (raw/name).exists():continue
    query='[out:json][timeout:45];'+query+'out meta geom;'
    response=subprocess.run(['curl.exe','--compressed','--fail','--silent','--show-error','--max-time','120','--get','--data-urlencode','data='+query,'https://maps.mail.ru/osm/tools/overpass/api/interpreter'],capture_output=True,check=True)
    data=json.loads(response.stdout)
    if data.get('remark'):raise ValueError(data['remark'])
    (raw/name).write_bytes((json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n').encode())
