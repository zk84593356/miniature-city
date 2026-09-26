"""Phase 3 increment over a pinned, independently verified Phase 2 pack.

No terrain, water, bridge or road is regenerated. Replacement uses OSM identity
and actual footprint containment, never broad proximity deletion.
"""
import hashlib, math, subprocess
import numpy as np
import shapely
from shapely.geometry import Polygon, Point, LineString
from phase2_common import ROOT, RAW, OUT, read, write, decode, encode, register, finish, TerrainSampler

BASE='05f27f5ef7292ca86326664216ea088c19d1074a'
def original(name):
    return __import__('json').loads(subprocess.check_output(['git','show',BASE+':city-data/wuhan/generated/'+name],cwd=ROOT))
m=original('manifest.json')
specs=read(ROOT/'src/cities/wuhan/landmark-specs.json')
raw=read(RAW/'urban-osm.json')['elements'];raw_map={f'{r["type"]}/{r["id"]}':r for r in raw}
raw_body=(RAW/'urban-osm.json').read_bytes();assert hashlib.sha256(raw_body).hexdigest()==m['urban']['source']['sha256']
terrain,indices=decode('terrain.bin',m['terrain']);sampler=TerrainSampler(terrain,indices)
degree=math.pi/180*6371008.8/100;cos=math.cos(math.radians(30.56))
def project(lon,lat):return [(lon-114.32)*degree*cos,(30.56-lat)*degree]
def inverse(x,z):return [114.32+x/degree/cos,30.56-z/degree]
def poly(row):return Polygon(row['rings'][0],row['rings'][1:])
chunks={}
for c in m['urban']['buildingChunks']:
    body=(OUT/c['file']).read_bytes()
    chunks[c['file']]=read(OUT/c['file']) if hashlib.sha256(body).hexdigest()==m['dataFiles'][c['file']]['sha256'] else original(c['file'])
buildings=[r for rows in chunks.values() for r in rows];shapes=[poly(r) for r in buildings];tree=shapely.STRtree(shapes)
old_replacements=original('landmark-replacements.json')
replaced={};landmarks=[]
def source_polygon(source_id):
    r=raw_map.get(source_id,{})
    if r.get('geometry'):
        return shapely.make_valid(Polygon([project(p['lon'],p['lat']) for p in r['geometry']]))
    rows=[shapes[i] for i,b in enumerate(buildings) if b['sourceId']==source_id]
    return shapely.union_all(rows)
def component(shape, source_id, name, height):
    # OBB axes derive from the actual source footprint; angle uses world x/z.
    rect=shape.minimum_rotated_rectangle;v=np.asarray(rect.exterior.coords)[:4];edges=np.roll(v,-1,axis=0)-v
    lengths=np.linalg.norm(edges,axis=1);i=int(np.argmax(lengths));axis=edges[i]/lengths[i]
    center=np.mean(v,axis=0);ring=np.array(shape.exterior.coords) if shape.geom_type=='Polygon' else np.array(rect.exterior.coords)
    sampled=sampler.sample(ring*100);finite=sampled[np.isfinite(sampled)]
    assert len(finite),source_id
    base=float(np.median(finite));bottom=float(finite.min());top=float(finite.max())
    return dict(sourceId=source_id,name=name,position=[float(center[0]),base/100,float(center[1])],rotation=float(-math.atan2(axis[1],axis[0])),width=float(lengths[i]*100),depth=float(lengths[(i+1)%4]*100),height=height,baseElevation=base,terrainRange=[bottom,top],footprint=shapely.geometry.mapping(shape),estimated=True)
for s in specs:
    source_ids=s.get('sourceIds') or sorted({b['sourceId'] for b in buildings if s['replacementGroup'] in b.get('landmarkIds',[])})
    envelopes=[source_polygon(i) for i in source_ids];envelope=shapely.union_all(envelopes)
    selected=[]
    for i in tree.query(envelope,predicate='intersects'):
        b=buildings[int(i)];shape=shapes[int(i)]
        if b['sourceId'] in source_ids or shape.intersection(envelope).area/max(shape.area,1e-12)>.8:
            assert b['id'] not in replaced,(b['id'],s['id'])
            replaced[b['id']]=s['id'];selected.append(b)
    assert selected,s['id']
    parts=[]
    primary=s.get('primarySourceId',source_ids[0])
    for source_id,shape in zip(source_ids,envelopes):
        b=next((b for b in selected if b['sourceId']==source_id),None)
        if not b or shape.is_empty:continue
        name=b['name'];h=s['height']
        if s['model']=='university' and source_id!=primary:h=16 if '樱园' in name else 19
        if s['model']=='museum':h=36 if '主馆' in name else min(20,max(7,math.sqrt(shape.area)*10))
        parts.append(component(shape,source_id,name,h))
    anchor=next((p for p in parts if p['sourceId']==primary),parts[0]);lon,lat=inverse(anchor['position'][0],anchor['position'][2])
    actual=shapely.union_all([poly(b) for b in selected])
    corners=[]
    for p in parts:
        angle=-p['rotation'];co,si=math.cos(angle),math.sin(angle)
        for u in [-p['width']*.006,p['width']*.006]:
            for v in [-p['depth']*.006,p['depth']*.006]:corners.append([p['position'][0]+u*co-v*si,p['position'][2]+u*si+v*co])
    bounds=shapely.MultiPoint(corners).bounds;base=min(p['baseElevation'] for p in parts);max_y=max(p['baseElevation']+p['height'] for p in parts)+1
    excluded_fields=['roof geometry','facade proportions','rotation inferred from OSM oriented bounding rectangle','DSM base elevation','cameraPreset']
    if s['heightStatus']=='estimated':excluded_fields.append('height')
    landmark=dict(s,longitude=lon,latitude=lat,rotation=anchor['rotation'],modelScale=1,footprint=shapely.geometry.mapping(actual),replacementFootprint=dict(buildingIds=sorted(b['id'] for b in selected),sourceIds=source_ids,geometry=shapely.geometry.mapping(actual)),components=parts,baseElevation=base,maxHeight=max_y-base,collisionBounds=[bounds[0],base/100,bounds[1],bounds[2],max_y/100,bounds[3]],pickBounds=[bounds[0],base/100,bounds[1],bounds[2],max_y/100,bounds[3]],sourceDate=s['sourceDate'],checkedAt='2026-09-26',estimated=True,confidence='medium' if s['heightStatus'].startswith('published') else 'low',estimatedFields=excluded_fields,positionSource=[f'https://www.openstreetmap.org/{i}' for i in source_ids],cameraPreset='place-'+s['id'])
    landmarks.append(landmark)
    landmark['coordinateSpace']='local world x/z, 100 metres per unit; height/baseElevation/maxHeight in metres'
    landmark['collisionBounds'][1]=min(p['terrainRange'][0] for p in parts)/100
    landmark['pickBounds']=landmark['collisionBounds'].copy()

def polygons(geom):
    if geom.geom_type=='Polygon':yield geom
    elif hasattr(geom,'geoms'):
        for child in geom.geoms:yield from polygons(child)
def building_mesh(items,tolerance):
    xyz=[];ind=[]
    for r in items:
        p=poly(r).simplify(tolerance/100,preserve_topology=True);top=(r['foundationMeters']+r['height'])/100
        for face in polygons(shapely.constrained_delaunay_triangles(shapely.make_valid(p))):
            v=np.array(face.exterior.coords)[:3];offset=len(xyz);signed=(v[1,0]-v[0,0])*(v[2,1]-v[0,1])-(v[1,1]-v[0,1])*(v[2,0]-v[0,0]);xyz.extend([[x,top,z] for x,z in v]);ind.append([offset,offset+2,offset+1] if signed>0 else [offset,offset+1,offset+2])
        for ring in [p.exterior,*p.interiors]:
            v=np.array(ring.coords)[:-1];bottom=sampler.sample(v*100)/100
            for i,a in enumerate(v):
                j=(i+1)%len(v);b=v[j];ya,yb=bottom[i],bottom[j]
                if r['minHeightMeters']>0:ya=yb=(r['foundationMeters']+r['minHeightMeters'])/100
                n=len(xyz);xyz.extend([[a[0],ya,a[1]],[b[0],yb,b[1]],[b[0],top,b[1]],[a[0],top,a[1]]]);ind.extend([[n,n+2,n+1],[n,n+3,n+2]])
    return np.asarray(xyz),np.asarray(ind)
changed=[]
for chunk in m['urban']['buildingChunks']:
    rows=chunks[chunk['file']];kept=[r for r in rows if r['id'] not in replaced]
    if len(kept)==len(rows):continue
    assert kept,chunk['file']
    write(OUT/chunk['file'],kept);register(m,chunk['file'],'building-footprint-v1','urban-source-lock',role='buildings');chunk['count']=len(kept)
    for tolerance,spec in zip([0,2],chunk['levels']):
        v,i=building_mesh(kept,tolerance);updated=encode(spec['file'],v,i);spec.update(updated);register(m,spec['file'],'building-display-v1','urban-source-lock',role='buildings',mesh=updated)
    changed.append(chunk['file'])
m['urban']['buildingCount']=len(buildings)-len(replaced)
write(OUT/'landmarks.json',landmarks);register(m,'landmarks.json','landmark-v1','landmark-specs + urban-source-lock',role='landmarks')

places=[];presets=[]
for l in landmarks:
    a=next((p for p in l['components'] if p['sourceId']==l.get('primarySourceId')),l['components'][0]);x,y,z=a['position'];h=a['height']/100
    span=max(a['width'],a['depth'])/100
    distance=max(1.8,span*2.2,h*2.5)
    if l['id'] in ('wuhan-university','hubei-museum'):distance=max(distance,5)
    places.append(dict(id=l['id'],nameZh=l['nameZh'],nameEn=l['nameEn'],kind='landmark',district=l['district'],description=l['description'],position=[l['longitude'],l['latitude']],anchor=[x,y+h+.07,z],priority=100 if l['id']=='yellow-crane' else 70,source=l['source'],cameraPreset=l['cameraPreset'],maxLabelDistance=130 if h>1 else 55))
    presets.append(dict(id=l['cameraPreset'],name=l['nameZh'],caption=l['district'],center=[l['longitude'],l['latitude']],targetHeight=y+h*.45,distance=distance,bearing=l['cameraBearing'],elevation=.55,placeId=l['id']))
for b in read(OUT/'bridges.json'):
    stations=np.array(b['stationsMeters']);p=np.array(b['profile']);station=sum(b['waterRange'])/2;xyz=[float(np.interp(station,stations,p[:,i])) for i in range(3)];ll=inverse(xyz[0],xyz[2])
    pid='bridge-'+b['id'];places.append(dict(id=pid,nameZh=b['name'],nameEn={'yangtze-first':'Wuhan Yangtze River Bridge','yingwuzhou':'Yingwuzhou Bridge','yangsigang':'Yangsigang Bridge','erqi':'Erqi Bridge','qingchuan':'Qingchuan Bridge','yangtze-second':'Second Wuhan Yangtze River Bridge'}[b['id']],kind='bridge',district='武汉 · 两江',description={'steel-truss':'钢桁架横跨长江，上层公路与下层铁路构成双层通道。两岸山体与桥头建筑共同形成武汉经典的江城画面。','suspension':'主缆在塔间形成舒展的曲线，吊索把桥面悬起。跨江通道连接两岸城区，也为江面带来鲜明的桥梁轮廓。','cable-stayed':'扇形斜拉索从桥塔伸向桥面，以轻盈的线条跨越长江。顺着江岸望去，可以观察它与其他桥梁不同的结构。','arch':'红色拱肋跨过汉江，靠近两江交汇处。桥面与晴川阁、龟山和汉口江岸一起，构成紧凑而丰富的滨水景观。'}[b['structure']],position=ll,anchor=[xyz[0],xyz[1]+.25,xyz[2]],priority=45,source=b['source'],cameraPreset='place-'+pid,maxLabelDistance=160))
    presets.append(dict(id='place-'+pid,name=b['name'],caption='桥梁与两岸城市',center=ll,targetHeight=xyz[1],distance=max(15,(b['waterRange'][1]-b['waterRange'][0])/100*1.6),bearing=165,elevation=.4,placeId=pid))

# Point anchors come from source geometry, not GCJ-02 map coordinates.
extra=read(RAW/'places-osm.json');extra_sources={}
curated=read(ROOT/'src/cities/wuhan/place-anchor-sources.json')
for row in extra['elements']:
    name=row.get('tags',{}).get('name','')
    if name=='沙湖':extra_sources['沙湖']=row
    if '汉口江滩' in name and row.get('tags',{}).get('leisure')=='park':extra_sources['汉口江滩']=row
def row_point(r):
    if 'position' in r:return r['position']
    if 'lon' in r:return [r['lon'],r['lat']]
    g=r.get('geometry') or max((member['geometry'] for member in r['members'] if member.get('geometry') and member.get('role')=='outer'),key=len)
    shape=Polygon([project(p['lon'],p['lat']) for p in g]) if g[0]==g[-1] else LineString([project(p['lon'],p['lat']) for p in g])
    pt=shape.representative_point() if shape.geom_type=='Polygon' else shape.interpolate(.5,normalized=True)
    return inverse(pt.x,pt.y)
natural=[('moshan-chutian','磨山 · 楚天台','Moshan · Chutian Terrace',raw_map['way/236231353'],'湖山','沿着磨山山脊观察东湖的湖汊与半岛。楚天台所在区域提供了文化景观与真实山体共同构成的湖区视角。',30),('hankou-riverfront','汉口江滩','Hankou Riverfront',extra_sources.get('汉口江滩'),'江岸','从滨江步道望向长江，历史街区、高层建筑与跨江桥梁层层展开。这里把城市日常生活与宽阔江面连接在一起。',35),('shahu','沙湖','Shahu Lake',extra_sources.get('沙湖'),'湖泊','沙湖嵌在武昌城市之中，水面与密集街区相邻。沿湖观察，可以感受到武汉湖泊与现代城市共存的空间尺度。',42),('donghu-greenway','东湖绿道','East Lake Greenway',raw_map['way/700522545'],'湖岸','绿道沿真实湖岸和道路延伸，将校园、林地与湖区景观连接起来。推荐从武大出发，依次浏览听涛、省博和磨山。',35)]
for pid,name,en,row,kind,description,distance in natural:
    if row is None:row=curated.get(pid)
    assert row is not None,name
    ll=row_point(row);x,z=project(*ll);h=sampler.sample([[x*100,z*100]])[0];h=float(h/100) if np.isfinite(h) else .2
    source=row['source'] if 'source' in row else f'https://www.openstreetmap.org/{row["type"]}/{row["id"]}'
    places.append(dict(id=pid,nameZh=name,nameEn=en,kind='nature',district='武汉 · '+kind,description=description,position=ll,anchor=[x,h+.15,z],priority=35,source=source,estimated=row.get('estimated',False),confidence=row.get('confidence','medium'),checkedAt='2026-09-26',cameraPreset='place-'+pid,maxLabelDistance=130))
    presets.append(dict(id='place-'+pid,name=name,caption=kind,center=ll,targetHeight=h,distance=distance,bearing=165,elevation=.67,placeId=pid))
assert len(places)==22
presets.append(dict(id='wuhan-iconic',name='龟蛇锁大江',caption='龟山 · 长江大桥 · 蛇山 · 黄鹤楼',center=[114.287,30.551],distance=34,bearing=235,elevation=.32))
presets.append(dict(id='campus-lake',name='珞珈山与东湖',caption='武大历史建筑群 · 珞珈山 · 东湖',center=[114.364,30.540],distance=28,bearing=175,elevation=.48))
routes=[dict(id='wuhan-identity',name='江城地标',stops=['confluence','wuhan-iconic','place-yellow-crane','place-customs','place-wuhan-center','place-greenland','bridge-sequence']),dict(id='east-lake',name='走近东湖',stops=['place-greenland','place-wuhan-university','luojia','donghu','place-xingyin','place-hubei-museum','place-donghu-greenway','place-moshan-chutian','moshan'])]
write(OUT/'places.json',places);register(m,'places.json','places-v1','OSM + landmark-specs',role='landmarks')
write(OUT/'camera-presets.json',dict(presets=presets,routes=routes));register(m,'camera-presets.json','camera-presets-v1','authored framing of verified coordinates',role='landmarks')
write(OUT/'landmark-replacement-audit.json',dict(baseline=BASE,removedBuildingIds=replaced,changedChunks=changed,retainedFalseMatches=['way/1216374520','way/1092815747','relation/19725659'],method='exact source identity or >80% footprint coverage'))
register(m,'landmark-replacement-audit.json','replacement-audit-v1','OSM identities',role='qa')
body=(RAW/'places-osm.json').read_bytes();write(ROOT/'src/cities/wuhan/places-source-lock.json',dict(file='places-osm.json',bytes=len(body),sha256=hashlib.sha256(body).hexdigest(),snapshot=extra['osm3s']['timestamp_osm_base'],acquisitionDate='2026-09-26',source='OpenStreetMap',license='ODbL-1.0',crs='EPSG:4326'))
m['phase']=3;m['landmarks']=dict(definitions='landmarks.json',places='places.json',cameras='camera-presets.json',count=len(landmarks),customCount=11,supplementaryCount=1,replacementAudit='landmark-replacement-audit.json')
clearance={}
def fill_clearance(bounds,height):
    x0,z0,x1,z1=bounds
    for x in range(math.floor(x0),math.floor(x1)+1):
        for z in range(math.floor(z0),math.floor(z1)+1):
            key=f'{x},{z}';clearance[key]=round(max(clearance.get(key,0),height),4)
for b,shape in zip(buildings,shapes):
    if b['id'] not in replaced:fill_clearance(shape.bounds,(b['foundationMeters']+b['height'])/100)
for l in landmarks:
    b=l['collisionBounds'];fill_clearance([b[0],b[2],b[3],b[5]],b[4])
ground={}
t=terrain[indices];mins=np.floor(t[:,:,[0,2]].min(axis=1)).astype(int);maxs=np.floor(t[:,:,[0,2]].max(axis=1)).astype(int);heights=t[:,:,1].max(axis=1)
for lo,hi,height in zip(mins,maxs,heights):
    for x in range(lo[0],hi[0]+1):
        for z in range(lo[1],hi[1]+1):
            key=f'{x},{z}';ground[key]=max(ground.get(key,0),math.ceil(float(height)*10000)/10000)
write(OUT/'camera-clearance.json',dict(cellMeters=100,cells=clearance,groundCells=ground,method='conservative footprint AABB maximum roof and original terrain triangle AABB maxima; navigation only'))
register(m,'camera-clearance.json','camera-clearance-v1','published building footprints and landmark bounds',role='landmarks');m['landmarks']['clearance']='camera-clearance.json';finish(m)
print(dict(dataset=m['datasetId'],landmarks=len(landmarks),places=len(places),replaced=len(replaced),changedChunks=changed))
