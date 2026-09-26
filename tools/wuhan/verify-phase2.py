"""Independent published geometry checks, including raw provenance hashes."""
import collections
import gzip
import hashlib
import json
import math
from pathlib import Path
import numpy as np
import shapely
from shapely.geometry import Polygon, Point, LineString
from scipy.spatial import cKDTree

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'city-data/wuhan/generated'
def read(path):return json.loads(path.read_bytes())
manifest=read(OUT/'manifest.json')
for source in [*read(ROOT/'src/cities/wuhan/source-lock.json'),read(ROOT/'src/cities/wuhan/urban-source-lock.json'),*read(ROOT/'src/cities/wuhan/landmark-source-lock.json')]:
    body=(ROOT/'city-data/wuhan/raw'/source['file']).read_bytes()
    assert len(body)==source['bytes'] and hashlib.sha256(body).hexdigest()==source['sha256']
for name,info in manifest['dataFiles'].items():
    body=(OUT/name).read_bytes()
    assert len(body)==info['bytes'] and hashlib.sha256(body).hexdigest()==info['sha256'],name
    if name.endswith('.json'):assert b'\r' not in body and body.endswith(b'\n'),name
def mesh(name,spec):
    raw=gzip.decompress((OUT/name).read_bytes());n=spec['vertices']
    return np.frombuffer(raw,'<f4',n*3).reshape(-1,3),np.frombuffer(raw,'<u4',offset=n*12).reshape(-1,3)
terrain,indices=mesh('terrain.bin',manifest['terrain'])
triangles=terrain[indices].astype(float)
tree=cKDTree(triangles[:,:,[0,2]].mean(axis=1))
def height(point):
    for count in (32,128,512):
        _,ids=tree.query(point,k=count);tri=triangles[ids];a,b,c=tri[:,0][:,[0,2]],tri[:,1][:,[0,2]],tri[:,2][:,[0,2]]
        v,w,q=b-a,c-a,np.asarray(point)-a;den=v[:,0]*w[:,1]-w[:,0]*v[:,1];den=np.where(abs(den)<1e-15,np.nan,den)
        u=(q[:,0]*w[:,1]-w[:,0]*q[:,1])/den;t=(v[:,0]*q[:,1]-q[:,0]*v[:,1])/den
        valid=np.flatnonzero((u>=-1e-6)&(t>=-1e-6)&(u+t<=1+1e-6))
        if len(valid):i=valid[0];return float(tri[i,0,1]*(1-u[i]-t[i])+tri[i,1,1]*u[i]+tri[i,2,1]*t[i])
    return None
waters=read(OUT/'water.json');water_polys=[Polygon(w['rings'][0],w['rings'][1:]) for w in waters];water=shapely.union_all(water_polys);water_index=shapely.STRtree(water_polys)
buildings=[]
for chunk in manifest['urban']['buildingChunks']:buildings.extend(read(OUT/chunk['file']))
replacement_rows=read(OUT/'landmark-replacements.json')
building_ids={r['id']:r for r in buildings}
assert len(replacement_rows)==11
for replacement in replacement_rows:
    assert replacement['buildingIds'] and replacement['footprints'],replacement['id']
    assert all(replacement['id'] in building_ids[key]['landmarkIds'] for key in replacement['buildingIds'])
footprints=[];water_overlap=0;unsupported=0;max_support_error=0
for r in buildings:
    p=Polygon(r['rings'][0],r['rings'][1:]);assert p.is_valid and not p.is_empty,r['id'];footprints.append(p)
    assert r['height']>0 and r['height']<=500 and r['heightSource'] and r['sourceId']
    if sum(p.intersection(water_polys[j]).area for j in water_index.query(p,predicate='intersects'))>.00001:water_overlap+=1
    # Every footprint gets an independently located exact triangle support probe.
    point=r['rings'][0][0];h=height(point)
    if h is None:unsupported+=1
    else:max_support_error=max(max_support_error,abs(h*100-r['bottomMeters'][0][0]))
assert water_overlap==0 and unsupported==0,(water_overlap,unsupported)
assert max_support_error<.03,max_support_error
duplicates=0;overlaps=0;spatial=shapely.STRtree(footprints)
for i,p in enumerate(footprints):
    for j in spatial.query(p,predicate='intersects'):
        if j<=i:continue
        area=p.intersection(footprints[j]).area
        if area>min(p.area,footprints[j].area)*.85:duplicates+=1
        elif area>.0001:overlaps+=1
assert duplicates==0,duplicates
road_index=read(OUT/'roads.json');roads=[r for chunk in road_index['chunks'] for r in read(OUT/chunk['file'])] if isinstance(road_index,dict) else road_index;nodes=collections.defaultdict(set);ground_errors=[]
for r in roads:
    assert all(k in r for k in ['oneway','bridge','tunnel','layer','access','width','sourceId','nodes'])
    for n in r['nodes']:nodes[n].add(r['id'])
    if r['tunnel']:assert not r['profile'] and not r['rendered']
    elif not r['bridge']:
        points=[p for p in r['profile'] if p]
        for p in points[::max(1,len(points)//3)]:
            h=height([p[0],p[2]])
            if h is not None:ground_errors.append(abs(p[1]*100-h*100-.08))
for r in roads:
    if r.get('junctionNodes'):assert all(n in r['nodes'] and len(nodes[n])>1 for n in r['junctionNodes'])
assert max(ground_errors,default=0)<.04,max(ground_errors,default=0)
bridges=read(OUT/'bridges.json');assert len(bridges)==6
expected={'yangtze-first':('steel-truss',0),'yingwuzhou':('suspension',3),'yangsigang':('suspension',2),'erqi':('cable-stayed',3),'qingchuan':('arch',0),'yangtze-second':('cable-stayed',2)}
bridge_qa=[]
for b in bridges:
    assert (b['structure'],b['towerCount'])==expected[b['id']]
    p=np.array(b['profile']);d=np.linalg.norm(np.diff(p[:,[0,2]],axis=0),axis=1);slopes=np.abs(np.diff(p[:,1]))/d
    stations=np.array(b['stationsMeters']);main=np.flatnonzero((stations>=b['waterRange'][0]-.001)&(stations<=b['waterRange'][1]+.001))
    river_hits=sum(any(waters[int(k)]['kind']=='river' for k in water_index.query(Point(p[i,0],p[i,2]),predicate='within')) for i in main)
    assert len(main)>1 and river_hits/len(main)>.9,(b['id'],'main span must follow the river, not approach lakes')
    assert np.isfinite(p).all() and (d>0).all()
    endpoint_errors=[abs(p[i,1]*100-height(p[i,[0,2]])*100-.08) for i in [0,-1]]
    assert max(endpoint_errors)<.03,endpoint_errors
    clearance=[]
    for i,(x,y,z) in enumerate(p):
        for index in water_index.query(Point(x,z),predicate='within'):
            w=waters[int(index)]
            if True:
                model=w.get('surface');level=model['interceptMeters']/100-model['gradient']*(model['direction'][0]*x+model['direction'][1]*z) if model else w['levelMeters']/100
                lower=b['lowerProfile'][i][1] if b.get('lowerProfile') else y
                clearance.append((lower-level)*100);break
    assert min(clearance)>3,(b['id'],min(clearance))
    assert b['estimated'] and b['estimatedFields'] and b['sourceRoadIds']
    if b['id']=='yangtze-first':assert b['lowerDeckKind']=='rail' and b['lowerLayerId']!=b['layerId']
    bridge_qa.append(dict(id=b['id'],structure=b['structure'],towers=b['towerCount'],minLowerClearanceMeters=min(clearance),maxGrade=float(slopes.max()),endpointErrorMeters=max(endpoint_errors)))
report=dict(result='PASS',buildings=len(buildings),waterOverlap=water_overlap,duplicates=duplicates,partialOverlapPairs=overlaps,unsupported=unsupported,maxFoundationErrorMeters=max_support_error,roads=len(roads),roadContactMaxErrorMeters=max(ground_errors,default=0),bridgeChecks=bridge_qa,sourceHashes=True,assetHashes=True,LF=True)
(ROOT/'docs/wuhan-phase2-geometry-qa.json').write_bytes((json.dumps(report,ensure_ascii=False,indent=2)+'\n').encode())
print(json.dumps(report,ensure_ascii=False,indent=2))
