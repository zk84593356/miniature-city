"""Bind named buildings/site envelopes; no synthetic exclusion circles."""
import hashlib
import math
import re
import numpy as np
from shapely.geometry import Polygon
from phase2_common import ROOT,RAW,OUT,read,write,register,finish

m=read(OUT/'manifest.json');replacements=read(OUT/'landmark-replacements.json')
patterns={r['id']:r['matchPattern'] for r in replacements}
patterns['wuhan-station']='武汉(火车)?站'
patterns['calla']='马蹄莲|新能源研究院'
degree=math.pi/180*6371008.8/100
site=next(r for r in read(RAW/'landmark-osm.json')['elements'] if r['id']==363656371)
envelope=Polygon([[(p['lon']-114.32)*degree*math.cos(math.radians(30.56)),(30.56-p['lat'])*degree] for p in site['geometry']])
sources=[]
for name in ['landmark-osm.json','landmark-extra-osm.json']:
    body=(RAW/name).read_bytes();data=read(RAW/name)
    sources.append(dict(file=name,bytes=len(body),sha256=hashlib.sha256(body).hexdigest(),source='OpenStreetMap',endpoint='https://maps.mail.ru/osm/tools/overpass/api/interpreter',snapshot=data['osm3s']['timestamp_osm_base'],acquisitionDate='2026-09-26',license='ODbL-1.0',crs='EPSG:4326',purpose='landmark identity/site envelopes only'))
records=[]
for c in m['urban']['buildingChunks']:
    rows=read(OUT/c['file'])
    for row in rows:
        keys=set(row['landmarkIds'])
        for key,pattern in patterns.items():
            if re.search(pattern,row['name']):keys.add(key)
        polygon=Polygon(row['rings'][0],row['rings'][1:])
        if envelope.covers(polygon.representative_point()):keys.add('hubei-museum')
        row['landmarkIds']=sorted(keys);row['landmarkReplacement']=bool(keys)
    write(OUT/c['file'],rows);register(m,c['file'],'building-footprint-v1','urban-source-lock',role='buildings');records.extend(rows)
for r in replacements:
    selected=[row for row in records if r['id'] in row['landmarkIds']]
    r.update(matchPattern=patterns[r['id']],buildingIds=[row['id'] for row in selected],footprints=[row['rings'] for row in selected],status='source-footprint' if selected else 'missing-source-footprint-review-required')
    if r['id']=='hubei-museum':r.update(sourceEnvelopeId='way/363656371',sourceEnvelope=list(envelope.exterior.coords),method='building footprint representative point inside named OSM museum campus')
assert all(r['buildingIds'] for r in replacements),[(r['id'],len(r['buildingIds'])) for r in replacements]
write(OUT/'landmark-replacements.json',replacements);register(m,'landmark-replacements.json','landmark-replacement-v1','urban-source-lock + landmark-source-lock',role='qa')
write(ROOT/'src/cities/wuhan/landmark-source-lock.json',sources);m['urban']['replacementSources']=sources
q=read(OUT/'urban-quality.json');q['landmarkReplacementCoverage']={r['id']:len(r['buildingIds']) for r in replacements}
write(OUT/'urban-quality.json',q);register(m,'urban-quality.json','phase2-quality-v1','urban-source-lock',role='qa');write(ROOT/'docs/wuhan-phase2-data-qa.json',q)
finish(m)
print(q['landmarkReplacementCoverage'])
