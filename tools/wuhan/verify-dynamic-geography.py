"""Independent frozen-data and whole-footprint checks, not producer assertions."""
import hashlib,json,math,subprocess
import numpy as np
import shapely
from shapely.geometry import Polygon,LineString,Point,box,shape
from shapely.affinity import rotate,translate
from phase2_common import ROOT,OUT,read,write
m=read(OUT/'manifest.json');base=json.loads(subprocess.check_output(['git','show',m['dynamics']['baseline']+':city-data/wuhan/generated/manifest.json'],cwd=ROOT))
for name,info in base['dataFiles'].items():assert m['dataFiles'][name]==info and hashlib.sha256((OUT/name).read_bytes()).hexdigest()==info['sha256'],name
for key in ['projection','bounds','terrain','water','terrainChunks','stableSurface','urban','landmarks']:assert m[key]==base[key],key
for name,info in m['dataFiles'].items():
    payload=(OUT/name).read_bytes();assert len(payload)==info['bytes'] and hashlib.sha256(payload).hexdigest()==info['sha256'],name
    if name.endswith('.json'):assert b'\r' not in payload and payload.endswith(b'\n'),name
waters=read(OUT/'water.json');water=shapely.union_all([Polygon(w['rings'][0],w['rings'][1:]) for w in waters]);shapely.prepare(water)
network=read(OUT/'traffic-network.json');bridges={b['id']:b for b in read(OUT/'bridges.json')}
roads={r['osmId']:r for c in read(OUT/'roads.json')['chunks'] for r in read(OUT/c['file'])}
buildings=[b for c in m['urban']['buildingChunks'] for b in read(OUT/c['file'])];polys=[Polygon(b['rings'][0],b['rings'][1:]) for b in buildings];polys += [shape(l['replacementFootprint']['geometry']) for l in read(OUT/'landmarks.json')];tree=shapely.STRtree(polys)
for l in network['lanes']:
    r=roads[l['road']];assert l['fromNode'] in r['nodes'] and l['toNode'] in r['nodes']
    assert r['nodes'][l['fromIndex']]==l['fromNode'] and r['nodes'][l['toIndex']]==l['toNode']
    assert (l['toIndex']-l['fromIndex'])*l['direction']>0
    assert r['roadClass']==l['roadClass'] and r['layer']==l['layer']
    line=LineString([(p[0],p[2]) for p in l['path']]);footprint=line.buffer(.013,cap_style=2)
    if not(l['tunnel'] or l['bridge'] or l['majorBridge']):assert not water.intersects(footprint),('road-water',l['id'])
    if not l['tunnel']:
        for i in tree.query(footprint,predicate='intersects'):assert i<len(buildings) and min(p[1] for p in l['path'])>=(buildings[i]['foundationMeters']+buildings[i]['height'])/100+.02,('building',l['id'])
    if l['majorBridge']:
        b=bridges[l['majorBridge']];bp=np.array(b['profile']);bl=LineString(bp[:,[0,2]]);ds=np.r_[0,np.cumsum(np.linalg.norm(np.diff(bp[:,[0,2]],axis=0),axis=1))]
        for x,y,z in l['path']:
            s=bl.project(Point(x,z));assert abs(y-np.interp(s,ds,bp[:,1]))<.002,('deck-height',l['id'])
            assert bl.distance(Point(x,z))<b['widthMeters']/200-.009,('deck-width',l['id'])
for c in network['connections']:
    a=network['lanes'][c['fromLane']];b=network['lanes'][c['toLane']];assert a['toNode']==b['fromNode']==c['node']
    if a['layer']!=b['layer']:
        for l in [a,b]:assert c['node'] in [roads[l['road']]['nodes'][0],roads[l['road']]['nodes'][-1]],('grade-transition',c['id'])
vessels=read(OUT/'vessel-routes.json');all_obstacles=[]
for bridge in vessels['obstacles']:
    for o in bridge['obstacles']:
        if o['kind']!='pier':continue
        x,_,z=o['center'];w,_,d=o['size'];all_obstacles.append(translate(rotate(box(-w/2,-d/2,w/2,d/2),-math.degrees(o.get('rotationY',0))),xoff=x,yoff=z))
obstacles=shapely.union_all(all_obstacles);clearances=[]
for r in vessels['routes']:
    w=next(w for w in waters if w['id']==r['waterBodyId']);poly=Polygon(w['rings'][0],w['rings'][1:]);line=LineString(r['path'])
    # Bounding circle covers every hull orientation, 6 m directional offset, and
    # interpolation at bends. Cargo (42 x 9 m) is the largest vessel.
    radius=(math.hypot(42,9)/2+6)/100;footprint=line.buffer(radius)
    assert poly.covers(footprint),('vessel-footprint-water',r['id'],footprint.difference(poly).area)
    assert not footprint.intersects(obstacles),('vessel-pier',r['id'])
    for c in r['bridgeConstraints']:assert c['clearanceMeters']>=c['maxVesselHeightMeters']+2;clearances.append(c['bridge'])
assert set(clearances)==set(bridges),clearances
result=dict(result='PASS',protectedAssets=len(base['dataFiles']),lanes=len(network['lanes']),connections=len(network['connections']),vesselRoutes=len(vessels['routes']),bridgeClearanceCoverage=clearances,checks=['original node identity and direction','layer transitions only at source endpoints','full vehicle width clear of ground water/buildings','published upper bridge profiles','full vessel bounding circle inside water, clear of piers','all six bridge clearances','frozen Phase 3 bytes and LF/SHA'])
write(ROOT/'docs/wuhan-phase4-geography-qa.json',result);print(json.dumps(result))
