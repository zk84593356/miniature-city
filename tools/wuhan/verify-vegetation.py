"""Independent checks of the saved vegetation, sourced polygons and terrain."""
import collections,hashlib,math
import numpy as np
import shapely
from shapely.geometry import Polygon,Point,LineString,shape
from phase2_common import ROOT,OUT,RAW,read,write,decode,TerrainSampler

m=read(OUT/'manifest.json');index=read(OUT/m['vegetation']);lock=index['source']
assert hashlib.sha256((RAW/lock['file']).read_bytes()).hexdigest()==lock['sha256']
sources={f"{r['type']}/{r['id']}":r for r in read(RAW/lock['file'])['elements']}
polygons=collections.defaultdict(list)
for a in read(OUT/index['greenAreas']):polygons[a['sourceId']].append(Polygon(a['rings'][0],a['rings'][1:]))
water=shapely.STRtree([Polygon(w['rings'][0],w['rings'][1:]) for w in read(OUT/'water.json')])
roads=[r for c in read(OUT/m['urban']['roads'])['chunks'] for r in read(OUT/c['file'])]
excluded=[LineString(r['coordinates']).buffer(r['width']/200+.0018) for r in roads if not r['tunnel'] and len(r['coordinates'])>1]
for c in m['urban']['buildingChunks']:excluded.extend(Polygon(b['rings'][0],b['rings'][1:]) for b in read(OUT/c['file']))
for landmark in read(OUT/'landmarks.json'):excluded.append(shape(landmark['replacementFootprint']['geometry']))
urban_lock=read(ROOT/'src/cities/wuhan/urban-source-lock.json');degree=math.pi/180*6371008.8/100
for row in read(RAW/urban_lock['file'])['elements']:
 tags=row.get('tags',{});geom=row.get('geometry')
 if not geom:continue
 q=[[(p['lon']-114.32)*degree*math.cos(math.radians(30.56)),(30.56-p['lat'])*degree] for p in geom if p]
 if len(q)>1 and tags.get('railway'):excluded.append(LineString(q).buffer(.039))
 if len(q)>3 and tags.get('area')=='yes' and tags.get('highway')=='pedestrian':excluded.append(shapely.make_valid(Polygon(q)))
exclusion=shapely.STRtree(excluded);terrain=TerrainSampler(*decode('terrain.bin',m['terrain']));counts=collections.Counter();maxError=0
for ci,c in enumerate(index['chunks']):
 if ci%100==0:print('Vegetation verification chunk',ci,flush=True)
 rows=read(OUT/c['file']);positions=np.array([r['position'] for r in rows]);q=positions[:,[0,2]];points=shapely.points(q)
 assert not water.query(points,predicate='intersects').shape[1],c['file']+' water'
 assert not exclusion.query(points,predicate='intersects').shape[1],c['file']+' road/building'
 h=terrain.sample(q*100)/100;assert np.isfinite(h).all();error=float(np.max(np.abs(h-positions[:,1])));maxError=max(maxError,error);assert error<.000001
 for row,point in zip(rows,points):
  source=sources[row['sourceId']];counts[row['kind']]+=1
  if row['sourceId'] in polygons:assert any(p.covers(point) for p in polygons[row['sourceId']]);assert row['estimated']
  else:assert source.get('tags',{}).get('natural') in ('tree','tree_row')
assert dict(counts)==index['counts']
report=dict(result='PASS',counts=dict(counts),maxTerrainErrorMeters=maxError*100,sourceSha256=lock['sha256'],checks=['locked OSM provenance','all polygon placements inside sourced greens','no water / road / building / landmark / railway / hard plaza intersections','exact terrain support','explicit inferred placements'])
write(ROOT/'docs/wuhan-phase6-vegetation-qa.json',report);print(report,flush=True)
