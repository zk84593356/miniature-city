"""Finalize cross-chunk topology and independently counted urban sample QA."""
import collections
import math
import numpy as np
import shapely
from shapely.geometry import Point,Polygon
from phase2_common import ROOT,OUT,read,write,register,finish

m=read(OUT/'manifest.json');index=read(OUT/'roads.json')
chunks=[(c,read(OUT/c['file'])) for c in index['chunks']]
nodes=collections.defaultdict(set)
for _,roads in chunks:
    for road in roads:
        for node in road['nodes']:nodes[node].add(road['id'])
fixed=0
for chunk,roads in chunks:
    for road in roads:
        if 'junctionNodes' in road:
            junctions=[n for n in road['nodes'] if len(nodes[n])>1]
            if junctions!=road['junctionNodes']:fixed+=1;road['junctionNodes']=junctions
    coordinates=np.concatenate([r['coordinates'] for r in roads]);lo=coordinates.min(axis=0);hi=coordinates.max(axis=0)
    chunk['bounds']=[float(lo[0]),float(lo[1]),float(hi[0]),float(hi[1])]
    write(OUT/chunk['file'],roads);register(m,chunk['file'],'osm-road-network-chunk-v1','urban-source-lock',role='road-topology')
write(OUT/'roads.json',index);register(m,'roads.json','osm-road-network-index-v1','urban-source-lock',role='road-topology')
buildings=[r for c in m['urban']['buildingChunks'] for r in read(OUT/c['file'])]
polys=[Polygon(r['rings'][0],r['rings'][1:]) for r in buildings];tree=shapely.STRtree(polys)
overlaps=[];duplicates=[]
for i,p in enumerate(polys):
    for j in tree.query(p,predicate='intersects'):
        if j<=i:continue
        area=p.intersection(polys[j]).area
        if area>min(p.area,polys[j].area)*.85:duplicates.append((i,int(j)))
        elif area>.0001:overlaps.append((i,int(j)))
q=read(OUT/'urban-quality.json');q['remainingOverlapPairs']=len(overlaps);q['duplicates']=len(duplicates);q['finalBuildingParts']=sum(r['isPart'] for r in buildings)
degree=math.pi/180*6371008.8/100
for region in q['regions']:
    lon,lat=region['center'];point=Point((lon-114.32)*degree*math.cos(math.radians(30.56)),(30.56-lat)*degree)
    ids=set(map(int,tree.query(point.buffer(region['radiusMeters']/100),predicate='intersects')))
    region['duplicates']=sum(i in ids or j in ids for i,j in duplicates)
    region['partialOverlapPairs']=sum(i in ids or j in ids for i,j in overlaps)
    region['highBuildingsForReview']=[dict(id=buildings[i]['id'],height=buildings[i]['height'],source=buildings[i]['sourceId']) for i in ids if buildings[i]['height']>240]
q['bridgeTagOverrides']=[dict(id=r['id'],sourceTag=r['sourceBridgeStructure'],resolved='cable-stayed',evidence='bridge-specs.json official city/constructor references') for _,roads in chunks for r in roads if r.get('majorBridge') in ('erqi','yangtze-second') and r.get('sourceBridgeStructure')=='suspension']
lock=read(ROOT/'src/cities/wuhan/urban-source-lock.json');lock.pop('endpoint',None);lock['endpoints']=['https://overpass.kumi.systems/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter']
write(ROOT/'src/cities/wuhan/urban-source-lock.json',lock);m['urban']['source']=lock;q['source']=lock
write(OUT/'urban-quality.json',q);register(m,'urban-quality.json','phase2-quality-v1','urban-source-lock',role='qa');write(ROOT/'docs/wuhan-phase2-data-qa.json',q)
m['urban']['qaViews']=q['regions']
finish(m)
print(dict(closedRoadJunctionsFixed=fixed,duplicateBuildings=len(duplicates),partialOverlapPairs=len(overlaps),finalBuildings=len(buildings)))
