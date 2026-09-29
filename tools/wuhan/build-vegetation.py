"""Deterministic inferred vegetation inside locked OSM greens, with exact support."""
import collections, hashlib, math
import numpy as np
import shapely
from shapely.geometry import Polygon, LineString, Point, shape
from shapely.ops import polygonize
from phase2_common import ROOT, RAW, OUT, read, write, decode, register, finish, TerrainSampler

def project(points):
 degree=math.pi/180*6371008.8/100
 return np.array([[(p['lon']-114.32)*degree*math.cos(math.radians(30.56)),(30.56-p['lat'])*degree] for p in points if p])
def parts(g):
 if g.geom_type=='Polygon':yield g
 elif hasattr(g,'geoms'):
  for child in g.geoms:yield from parts(child)

def main():
 m=read(OUT/'manifest.json');lock=read(ROOT/'src/cities/wuhan/vegetation-source-lock.json')
 assert hashlib.sha256((RAW/lock['file']).read_bytes()).hexdigest()==lock['sha256']
 rows=read(RAW/lock['file'])['elements'];greens=[];explicit=[];members=set()
 for row in rows:
  if row['type']!='relation':continue
  outer=[];inner=[]
  for member in row.get('members',[]):
   if member['type']!='way' or not member.get('geometry'):continue
   p=project(member['geometry'])
   if len(p)>1:(inner if member.get('role')=='inner' else outer).append(LineString(p));members.add(member['ref'])
  if outer:greens.append((row,shapely.make_valid(shapely.union_all(list(polygonize(outer))).difference(shapely.union_all(list(polygonize(inner)))))))
 for row in rows:
  if row['type']=='node' and row.get('tags',{}).get('natural')=='tree':explicit.append((row,project([row])[0]));continue
  if row['type']!='way' or row['id'] in members or not row.get('geometry'):continue
  p=project(row['geometry'])
  if len(p)>3 and np.allclose(p[0],p[-1]):greens.append((row,shapely.make_valid(Polygon(p))))
  elif row.get('tags',{}).get('natural')=='tree_row' and len(p)>1:
   line=LineString(p)
   for d in np.arange(0,line.length,.10):explicit.append((row,np.array(line.interpolate(d).coords[0])))
 print('Indexing exclusions and terrain',flush=True)
 obstacles=[Polygon(w['rings'][0],w['rings'][1:]).buffer(.015) for w in read(OUT/'water.json')]
 roads=[r for c in read(OUT/m['urban']['roads'])['chunks'] for r in read(OUT/c['file'])]
 obstacles.extend(LineString(r['coordinates']).buffer(r['width']/200+.022,join_style='mitre') for r in roads if not r['tunnel'] and len(r['coordinates'])>1)
 for b in read(OUT/m['urban']['bridges']):obstacles.append(LineString([[p[0],p[2]] for p in b['profile']]).buffer(b['widthMeters']/200+.03))
 for chunk in m['urban']['buildingChunks']:
  obstacles.extend(Polygon(b['rings'][0],b['rings'][1:]).buffer(.015) for b in read(OUT/chunk['file']))
 for landmark in read(OUT/'landmarks.json'):obstacles.append(shape(landmark['replacementFootprint']['geometry']).buffer(.025))
 # OSM railway / paved pedestrian areas in the locked urban extract are exclusions.
 urban_lock=read(ROOT/'src/cities/wuhan/urban-source-lock.json')
 for row in read(RAW/urban_lock['file'])['elements']:
  tags=row.get('tags',{});geom=row.get('geometry')
  if not geom:continue
  p=project(geom)
  if len(p)<2:continue
  if tags.get('railway'):obstacles.append(LineString(p).buffer(.04))
  if tags.get('area')=='yes' and tags.get('highway')=='pedestrian' and len(p)>3:obstacles.append(shapely.make_valid(Polygon(p)).buffer(.01))
 tree=shapely.STRtree(obstacles);sampler=TerrainSampler(*decode('terrain.bin',m['terrain']))
 chunks=collections.defaultdict(list);areas=[];counts=collections.Counter();rejected=collections.Counter();occupied=set()
 def plant(row,q,kind,rng,estimated=True):
  key=(round(q[0]/.04),round(q[1]/.04))
  if key in occupied:rejected['spacing']+=1;return
  if len(tree.query(Point(q),predicate='intersects')):rejected['exclusion']+=1;return
  h=sampler.sample([q*100])[0]
  if not np.isfinite(h):rejected['unsupported']+=1;return
  occupied.add(key);variant=int(rng.integers(0,3));height=float(rng.uniform(4.5,9) if kind=='tree' else rng.uniform(.5,1.2) if kind=='shrub' else rng.uniform(.15,.35))
  item=dict(position=[round(float(q[0]),7),round(float(h/100),7),round(float(q[1]),7)],kind=kind,variant=variant,heightMeters=round(height,2),radiusMeters=.18 if kind=='tree' else 0,sourceId=f"{row['type']}/{row['id']}",estimated=estimated)
  key=f'{math.floor(q[0]/20)+50}-{math.floor(q[1]/20)+50}';chunks[key].append(item);counts[kind]+=1
 for i,(row,g) in enumerate(sorted(greens,key=lambda item:(item[0]['type'],item[0]['id']))):
  if i%500==0:print(f'Green polygons {i}/{len(greens)}',flush=True)
  rng=np.random.default_rng(row['id']);tags=row.get('tags',{});forest=tags.get('natural')=='wood' or tags.get('landuse')=='forest'
  for poly in parts(g):
   if poly.is_empty or poly.area<.002:continue
   areas.append(dict(sourceId=f"{row['type']}/{row['id']}",tags=tags,rings=[list(poly.exterior.coords),*[list(h.coords) for h in poly.interiors]]))
   # Sparse visual samples of real areas, not a botanical inventory. Capped per area.
   n=min(1500,max(1,int(poly.area*10000/(250 if forest else 800))))
   x0,z0,x1,z1=poly.bounds
   candidates=rng.uniform([x0,z0],[x1,z1],size=(n*3,2));accepted=0
   for q in candidates:
    if not poly.contains(Point(q)):continue
    choice=rng.random();kind='tree' if choice<(.87 if forest else .60) else 'shrub' if choice<.91 else 'flower'
    plant(row,q,kind,rng);accepted+=1
    if accepted>=n:break
 for row,q in explicit:plant(row,q,'tree',np.random.default_rng(row['id']),row['type']!='node')
 specs=[]
 for key,items in sorted(chunks.items()):
  name=f'vegetation-{key}.json';write(OUT/name,items);register(m,name,'vegetation-instances-v1','vegetation-source-lock',role='vegetation')
  coords=np.array([i['position'] for i in items]);specs.append(dict(file=name,count=len(items),bounds=[float(coords[:,0].min()),float(coords[:,2].min()),float(coords[:,0].max()),float(coords[:,2].max())]))
 write(OUT/'green-areas.json',areas);register(m,'green-areas.json','osm-green-polygons-v1','vegetation-source-lock',role='vegetation')
 data=dict(schema='vegetation-index-v1',chunks=specs,counts=dict(counts),source=lock,greenAreas='green-areas.json',estimatedPlacement='All polygon / tree-row placements and all species / dimensions inferred deterministically. Only explicit OSM tree nodes have sourced positions.',rejected=dict(rejected))
 write(OUT/'vegetation.json',data);register(m,'vegetation.json','vegetation-index-v1','vegetation-source-lock',role='vegetation');m['vegetation']='vegetation.json';finish(m)
 write(ROOT/'docs/wuhan-phase6-vegetation-qa.json',dict(counts=dict(counts),areas=len(areas),rejected=dict(rejected),sourceSha256=lock['sha256']))
 print(dict(counts),flush=True)

if __name__=='__main__':main()
