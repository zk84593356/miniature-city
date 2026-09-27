"""Independent Phase 3 provenance, geographic replacement and frozen-base QA."""
import hashlib,json,subprocess
import numpy as np
import shapely
from shapely.geometry import Polygon,shape,Point
from phase2_common import ROOT,OUT,RAW,read,write,decode,TerrainSampler

m=read(OUT/'manifest.json');audit=read(OUT/m['landmarks']['replacementAudit']);base=json.loads(subprocess.check_output(['git','show',audit['baseline']+':city-data/wuhan/generated/manifest.json'],cwd=ROOT))
assert m['phase']>=3
for field in ['projection','bounds','terrainExaggeration','terrain','terrainChunks','terrainOverview','stableSurface']:
    assert m[field]==base[field],field
changed=set(audit['changedChunks'])
for chunk in base['urban']['buildingChunks']:
    if chunk['file'] in changed:changed.update(l['file'] for l in chunk['levels'])
protected=0
for name,info in m['dataFiles'].items():
    body=(OUT/name).read_bytes();assert len(body)==info['bytes'] and hashlib.sha256(body).hexdigest()==info['sha256'],name
    if name.endswith('.json'):assert b'\r' not in body and body.endswith(b'\n'),name
    if name in base['dataFiles'] and name not in changed:assert info==base['dataFiles'][name],name;protected+=1
lock=read(ROOT/'src/cities/wuhan/places-source-lock.json');body=(RAW/lock['file']).read_bytes();assert hashlib.sha256(body).hexdigest()==lock['sha256']
buildings=[b for c in m['urban']['buildingChunks'] for b in read(OUT/c['file'])];ids={b['id'] for b in buildings};sources={b['sourceId'] for b in buildings}
assert not ids.intersection(audit['removedBuildingIds'])
assert all(s in sources for s in audit['retainedFalseMatches'])
assert len(buildings)==m['urban']['buildingCount']==base['urban']['buildingCount']-len(audit['removedBuildingIds'])
water=shapely.union_all([Polygon(w['rings'][0],w['rings'][1:]) for w in read(OUT/'water.json')])
terrain,indices=decode('terrain.bin',m['terrain']);sampler=TerrainSampler(terrain,indices)
landmarks=read(OUT/'landmarks.json');assert len(landmarks)==12
expected={'yellow-crane':[114.29,30.54,114.31,30.555],'customs':[114.285,30.575,114.3,30.59],'greenland':[114.31,30.58,114.33,30.595],'wuhan-center':[114.23,30.59,114.25,30.605],'wuhan-university':[114.35,30.54,114.365,30.55],'hubei-museum':[114.35,30.56,114.37,30.57],'calla':[114.52,30.48,114.55,30.51]}
expected.update({'qingchuan-pavilion':[114.277,30.556,114.283,30.561],'guishan-tower':[114.272,30.556,114.277,30.561],'qintai-theater':[114.25,30.56,114.26,30.57],'wuhan-station':[114.41,30.60,114.43,30.62],'xingyin':[114.369,30.565,114.374,30.57]})
checks=[]
for l in landmarks:
    for key in ['nameZh','nameEn','longitude','latitude','rotation','height','footprint','modelScale','source','sourceDate','confidence','estimatedFields','cameraPreset','replacementFootprint','baseElevation','maxHeight','collisionBounds','pickBounds']:assert key in l,(l['id'],key)
    footprint=shape(l['replacementFootprint']['geometry']);assert footprint.is_valid
    overlap=footprint.intersection(water).area*10000;assert overlap<.1,(l['id'],overlap)
    assert l['replacementFootprint']['buildingIds'] and all(b in audit['removedBuildingIds'] for b in l['replacementFootprint']['buildingIds'])
    assert 0<l['height']<500 and l['modelScale']==1
    if l['id'] in expected:
        a,b,c,d=expected[l['id']];assert a<l['longitude']<c and b<l['latitude']<d,l['id']
    for c in l['components']:
        x,y,z=c['position'];ground=sampler.sample([[x*100,z*100]])[0]
        assert np.isfinite(ground) and abs(ground-c['baseElevation'])<35,(l['id'],ground,c['baseElevation'])
        assert c['terrainRange'][0]-.01<=c['baseElevation']<=c['terrainRange'][1]+.01
    checks.append(dict(id=l['id'],removed=len(l['replacementFootprint']['buildingIds']),waterOverlapMeters2=overlap,components=len(l['components']),height=l['height'],heightStatus=l['heightStatus']))
places=read(OUT/'places.json');cameras=read(OUT/'camera-presets.json');presets={r['id'] for r in cameras['presets']};regions={r['id'] for r in m['regions']}|{'bridge-sequence'}
assert len(places)==len({r['id'] for r in places})==22
assert all(p['cameraPreset'] in presets for p in places)
assert all(stop in presets|regions for route in cameras['routes'] for stop in route['stops'])
for p in places:
    assert len(p['anchor'])==3 and np.isfinite(p['anchor']).all(),p['id']
    lon,lat=p['position'];x,_,z=p['anchor'];degree=np.pi/180*6371008.8/100
    assert abs(lon-(114.32+x/(degree*np.cos(np.radians(30.56)))))<1e-7,p['id']
    assert abs(lat-(30.56-z/degree))<1e-7,p['id']
    assert 30<=len(p['description'])<=80 and p['source'].startswith('https://'),p['id']
for c in cameras['presets']:
    assert np.isfinite(c['center']).all() and 0<c['distance']<900 and 0<c['elevation']<1,c['id']
clearance=read(OUT/'camera-clearance.json')
for b in buildings:
    point=Polygon(b['rings'][0]).representative_point();height=(b['foundationMeters']+b['height'])/100
    assert clearance['cells'][f'{int(np.floor(point.x))},{int(np.floor(point.y))}']>=height-.0001
for x,y,z in terrain:
    assert clearance['groundCells'][f'{int(np.floor(x))},{int(np.floor(z))}']>=y-.0001
report=dict(result='PASS',dataset=m['datasetId'],protectedPhase2Assets=protected,ordinaryBuildings=len(buildings),removedOrdinaryBuildings=len(audit['removedBuildingIds']),retainedFalseMatches=audit['retainedFalseMatches'],places=len(places),landmarks=checks,LF=True,hashes=True)
write(ROOT/'docs/wuhan-phase3-data-qa.json',report);print(json.dumps(report,ensure_ascii=False))
