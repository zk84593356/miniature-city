"""Offline true-footprint urban pack; no synthetic building distribution."""
import collections
import hashlib
import math
import re
import numpy as np
import shapely
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import polygonize, linemerge, transform
from phase2_common import ROOT, RAW, OUT, read, write, decode, encode, register, finish, TerrainSampler
import triangle

manifest=read(OUT/'manifest.json')
lock=read(ROOT/'src/cities/wuhan/urban-source-lock.json')
body=(RAW/lock['file']).read_bytes()
assert len(body)==lock['bytes'] and hashlib.sha256(body).hexdigest()==lock['sha256']
rows=read(RAW/lock['file'])['elements']
degree=math.pi/180*6371008.8
def project(lon,lat,z=None):return (np.asarray(lon)-114.32)*degree*math.cos(math.radians(30.56)),(30.56-np.asarray(lat))*degree
def coordinates(geom): return np.array([project(p['lon'],p['lat']) for p in geom if p])
def polygons(geom):
    if geom.geom_type=='Polygon':yield geom
    elif hasattr(geom,'geoms'):
        for child in geom.geoms:yield from polygons(child)
def number(value):
    if value is None:return None
    found=re.match(r'^\s*([0-9]+(?:\.[0-9]+)?)\s*(m|ft|\')?\s*$',str(value))
    if not found:return None
    return float(found[1])*(.3048 if found[2] in ('ft',"'") else 1)
def source(row):return dict(source='OpenStreetMap',sourceId=f'{row["type"]}/{row["id"]}',sourceVersion=row.get('version'),timestamp=row.get('timestamp'))
terrain,ti=decode('terrain.bin',manifest['terrain'])
sampler=TerrainSampler(terrain,ti)
waters=read(OUT/'water.json')
water_shapes=[Polygon(np.array(w['rings'][0])*100,[np.array(r)*100 for r in w['rings'][1:]]) for w in waters]
water_union=shapely.union_all(water_shapes)
water_tree=shapely.STRtree(water_shapes)
def water_height(xz, river_only=False):
    out=[]
    for x,z in xz:
        ids=water_tree.query(Point(x,z),predicate='intersects')
        if river_only:ids=[i for i in ids if waters[int(i)]['kind']=='river']
        if not len(ids):out.append(np.nan);continue
        w=waters[int(ids[0])];s=w.get('surface')
        out.append(s['interceptMeters']-s['gradient']*(s['direction'][0]*x+s['direction'][1]*z) if s else w['levelMeters'])
    return np.array(out)
extent=transform(project,box(*manifest['bounds']['context']))
cache=ROOT/'city-data/wuhan/intermediate/urban-normalized.json'
cache.parent.mkdir(parents=True,exist_ok=True)
cache_data=read(cache) if cache.exists() else {}
if cache_data.get('sourceSha')==lock['sha256'] and cache_data.get('normalizationVersion')==2:
    records=cache_data['records'];footprints=[shapely.from_wkb(bytes.fromhex(w)) for w in cache_data['footprints']]
    rejected=collections.Counter(cache_data['rejected']);drop=range(cache_data['dropped']);overlap_pairs=cache_data['overlaps'];qa_flags=cache_data['flags'];landmark_patterns=cache_data['landmarks']
    print(f'Using validated normalization cache: {len(records)} buildings',flush=True)
else:
    print(f'Normalizing {len(rows)} OSM elements',flush=True)

    # Multipolygon relations take precedence over member ways.
    relations=[];member_ids=set()
    for row in rows:
        tags=row.get('tags',{})
        if row['type']!='relation' or not ('building' in tags or 'building:part' in tags):continue
        outer=[];inner=[]
        for m in row.get('members',[]):
            if m['type']!='way' or not m.get('geometry'):continue
            coords=coordinates(m['geometry'])
            if len(coords)<2:continue
            (inner if m.get('role')=='inner' else outer).append(LineString(coords))
            member_ids.add(m['ref'])
        shells=list(polygonize(outer));holes=list(polygonize(inner))
        if shells:relations.append((row,shapely.union_all(shells).difference(shapely.union_all(holes))))
    raw_buildings=relations[:]
    for row in rows:
        tags=row.get('tags',{})
        if row['type']!='way' or row['id'] in member_ids or not ('building' in tags or 'building:part' in tags):continue
        if not row.get('geometry'):continue
        coords=coordinates(row['geometry'])
        if len(coords)<4 or not np.allclose(coords[0],coords[-1]):continue
        raw_buildings.append((row,shapely.make_valid(Polygon(coords))))
    parts=[g for r,g in raw_buildings if r.get('tags',{}).get('building:part') not in (None,'no')]
    part_tree=shapely.STRtree(parts)
    records=[];footprints=[];seen=set();rejected=collections.Counter();qa_flags=[]
    landmark_patterns=[('yellow-crane','黄鹤楼'),('customs','江汉关'),('greenland','武汉绿地中心'),('wuhan-center','武汉中心'),('qingchuan-pavilion','晴川阁'),('guishan-tower','龟山.*(电视|广播)'),('wuhan-university','(武汉大学|武大).*(图书馆|行政楼|樱顶|老斋舍)|老图书馆|老斋舍'),('hubei-museum','湖北省博物馆'),('wuhan-station','武汉站'),('calla','马蹄莲|武汉新能源研究院'),('qintai-theater','琴台大剧院')]
    for row_index,(row,geom) in enumerate(raw_buildings):
        if row_index%5000==0:print(f'Building support {row_index}/{len(raw_buildings)}',flush=True)
        tags=row.get('tags',{});
        if tags.get('building')=='no' and tags.get('building:part') in (None,'no'):continue
        is_part=tags.get('building:part') not in (None,'no')
        if not is_part and len(parts):
            hits=part_tree.query(geom,predicate='intersects')
            if len(hits):geom=geom.difference(shapely.union_all([parts[i] for i in hits]))
        for poly in polygons(shapely.make_valid(geom.intersection(extent))):
            poly=shapely.set_precision(poly,.001)
            if poly.geom_type!='Polygon' or poly.is_empty:rejected['precisionSplit']+=1;continue
            if poly.area<12:rejected['smallOrCoveredByParts']+=1;continue
            water_hits=water_tree.query(poly,predicate='intersects')
            if sum(poly.intersection(water_shapes[i]).area for i in water_hits)>.05:rejected['waterOverlap']+=1;continue
            poly=shapely.normalize(poly)
            key=shapely.to_wkb(shapely.set_precision(poly,.05))
            if key in seen:rejected['duplicate']+=1;continue
            seen.add(key)
            rings=[np.array(r.coords)[:-1] for r in [poly.exterior,*poly.interiors]]
            h=number(tags.get('height'));levels=number(tags.get('building:levels'));usage=tags.get('building:use',tags.get('building','yes'))
            if h and h>0:height,hs,estimated,confidence=h,'osm:height',False,'medium'
            elif levels and levels>0:height,hs,estimated,confidence=levels*(3.6 if usage in ('office','commercial') else 3.2),'osm:building:levels',True,'medium'
            else:height,hs,estimated,confidence=({'house':6.4,'detached':6.4,'garage':3.2,'garages':3.2,'industrial':8,'warehouse':8,'school':12.8,'university':12.8,'apartments':12.8}.get(usage,9.6)),'usage-default',True,'low'
            if height>500:qa_flags.append(dict(id=row['id'],reason='height>500m',height=height,source=hs));rejected['extremeHeight']+=1;continue
            minimum=number(tags.get('min_height')) or (number(tags.get('building:min_level')) or 0)*3.2
            probes=np.concatenate([np.asarray(shapely.segmentize(r,10).coords) for r in [poly.exterior,*poly.interiors]])
            supports=sampler.sample(probes)
            if np.isnan(supports).any():rejected['unsupportedFootprint']+=1;continue
            foundation=float(supports.max())
            bottom=[sampler.sample(r).tolist() for r in rings]
            name=tags.get('name','');landmarks=[key for key,pat in landmark_patterns if re.search(pat,name)]
            record=dict(id=f'osm-{row["type"]}-{row["id"]}-{len(records)}',name=name,isPart=is_part,rings=[np.round(r/100,6).tolist() for r in rings],bottomMeters=bottom,foundationMeters=foundation,minHeightMeters=minimum,height=height,heightSource=hs,estimated=estimated,confidence=confidence,usage=usage,landmarkReplacement=bool(landmarks),landmarkIds=landmarks,**source(row))
            records.append(record);footprints.append(poly)
    print(f'Buildings: {len(records)}; removed {dict(rejected)}',flush=True)
    # Reject substantial duplicate overlap, including separate untagged outlines.
    tree=shapely.STRtree(footprints);drop=set();overlap_pairs=0
    for i,p in enumerate(footprints):
        for j in tree.query(p,predicate='intersects'):
            if j<=i or i in drop or j in drop:continue
            area=p.intersection(footprints[j]).area
            if area>min(p.area,footprints[j].area)*.85:
                loser=j if (records[i]['heightSource']!='usage-default',p.area)>=(records[j]['heightSource']!='usage-default',footprints[j].area) else i
                drop.add(loser)
            elif area>1:overlap_pairs+=1
    records=[r for i,r in enumerate(records) if i not in drop];footprints=[p for i,p in enumerate(footprints) if i not in drop]
    write(cache,dict(sourceSha=lock['sha256'],normalizationVersion=2,records=records,footprints=[shapely.to_wkb(p).hex() for p in footprints],rejected=dict(rejected),dropped=len(drop),overlaps=overlap_pairs,flags=qa_flags,landmarks=landmark_patterns))
chunks=collections.defaultdict(list)
for record,poly in zip(records,footprints):
    c=poly.centroid;key=f'{math.floor(c.x/2000)+50}-{math.floor(c.y/2000)+50}'
    chunks[key].append(record)
building_chunks=[]
mesh_cache=ROOT/'city-data/wuhan/intermediate/building-mesh-index.json'
mesh_cache_data=read(mesh_cache) if mesh_cache.exists() else {}
def building_mesh(items, tolerance):
    xyz=[];indices=[]
    for r in items:
        poly=Polygon(r['rings'][0],r['rings'][1:])
        if tolerance:poly=poly.simplify(tolerance/100,preserve_topology=True)
        rings=[np.array(ring.coords)[:-1] for ring in [poly.exterior,*poly.interiors]]
        top=(r['foundationMeters']+r['height'])/100
        # GEOS constrained triangulation handles touching and tiny inner rings
        # without the native Triangle library's duplicate-vertex failure mode.
        roof=shapely.constrained_delaunay_triangles(shapely.make_valid(poly))
        for face in polygons(roof):
            coords=np.array(face.exterior.coords)[:3];offset=len(xyz)
            signed=(coords[1,0]-coords[0,0])*(coords[2,1]-coords[0,1])-(coords[1,1]-coords[0,1])*(coords[2,0]-coords[0,0])
            xyz.extend([[x,top,z] for x,z in coords]);indices.append([offset,offset+2,offset+1] if signed>0 else [offset,offset+1,offset+2])
        for ring in rings:
            # Full perimeter foundation skirt extends to real terrain, not a floating center point.
            bottom=sampler.sample(ring*100)/100
            for i in range(len(ring)):
                j=(i+1)%len(ring);offset=len(xyz)
                a,b=ring[i],ring[j];ya,yb=bottom[i],bottom[j]
                if r['minHeightMeters']>0:ya=yb=(r['foundationMeters']+r['minHeightMeters'])/100
                xyz.extend([[a[0],ya,a[1]],[b[0],yb,b[1]],[b[0],top,b[1]],[a[0],top,a[1]]]);indices.extend([[offset,offset+2,offset+1],[offset,offset+3,offset+2]])
    return np.asarray(xyz),np.asarray(indices)
if mesh_cache_data.get('sourceSha')==lock['sha256'] and mesh_cache_data.get('version')==1:
    building_chunks=mesh_cache_data['chunks']
    for chunk in building_chunks:
        register(manifest,chunk['file'],'building-footprint-v1','urban-source-lock',role='buildings')
        for spec in chunk['levels']:register(manifest,spec['file'],'building-display-v1','urban-source-lock',role='buildings',mesh=spec)
else:
    for chunk_index,(key,items) in enumerate(sorted(chunks.items())):
        if chunk_index%50==0:print(f'Building mesh chunk {chunk_index}/{len(chunks)}',flush=True)
        name=f'buildings-{key}.json';write(OUT/name,items)
        register(manifest,name,'building-footprint-v1','urban-source-lock',role='buildings')
        coords=np.concatenate([r['rings'][0] for r in items]);lo=coords.min(axis=0);hi=coords.max(axis=0)
        levels=[]
        for tolerance in [0,2]:
            xyz,indices=building_mesh(items,tolerance);mesh_name=f'buildings-{key}-{tolerance}.bin';spec=encode(mesh_name,xyz,indices)
            register(manifest,mesh_name,'building-display-v1','urban-source-lock',role='buildings',mesh=spec)
            levels.append(spec)
        building_chunks.append(dict(file=name,count=len(items),bounds=[*lo.tolist(),*hi.tolist()],levels=levels))

    write(mesh_cache,dict(sourceSha=lock['sha256'],version=1,chunks=building_chunks))

# Preserve original node relationships, grade semantics and source tags.
widths={'motorway':24,'trunk':20,'primary':16,'secondary':12,'tertiary':9,'residential':6,'unclassified':6,'service':4,'living_street':4,'footway':2,'path':1.5,'cycleway':2.5,'pedestrian':5,'steps':2,'track':3}
roads=[];original_nodes={};bridge_specs=read(ROOT/'src/cities/wuhan/bridge-specs.json')
for row in rows:
    tags=row.get('tags',{})
    if row['type']!='way' or 'highway' not in tags or not row.get('geometry'):continue
    if tags['highway'] in ('proposed','construction','raceway'):continue
    coords=coordinates(row['geometry'])
    if len(coords)<2:continue
    line=LineString(coords)
    if not line.intersects(extent):continue
    nodes=row.get('nodes',[])
    for node,coord in zip(nodes,coords):original_nodes[node]=coord
    name=tags.get('name','');bridge=tags.get('bridge') not in (None,'no');tunnel=tags.get('tunnel') not in (None,'no')
    major=next((s['id'] for s in bridge_specs if re.search(s['match'],tags.get('bridge:name',name))),None)
    cls=tags['highway'];width=number(tags.get('width')) or (number(tags.get('lanes')) or 0)*3.25 or widths.get(cls.replace('_link',''),4)
    roads.append(dict(id=f'osm-way-{row["id"]}',osmId=row['id'],name=name,roadClass=cls,oneway=tags.get('oneway','no'),bridge=bridge,tunnel=tunnel,layer=tags.get('layer','0'),access=tags.get('access','yes'),width=width,widthEstimated='width' not in tags,lanes=tags.get('lanes'),nodes=nodes,coordinates=np.round(coords/100,7).tolist(),majorBridge=major,sourceBridgeStructure=tags.get('bridge:structure'),**source(row)))
print(f'Roads: {len(roads)}',flush=True)

bridges=[]
for spec in bridge_specs:
    candidates=[r for r in roads if r['majorBridge']==spec['id'] and r['bridge'] and not r['tunnel'] and r['roadClass'] not in ('path','footway','cycleway','steps')]
    if spec['id']=='yangsigang':candidates=[r for r in candidates if r['layer']=='3']
    if not candidates:raise ValueError(f'Missing real bridge alignment: {spec["name"]}')
    lines=[LineString(np.array(r['coordinates'])*100) for r in candidates]
    merged=linemerge(lines)
    line=merged if merged.geom_type=='LineString' else max(merged.geoms,key=lambda l:l.length)
    # Retain the actual OSM geometry; extend only through original shared nodes.
    all_points=list(line.coords)
    visited={r['id'] for r in candidates}
    for side in [0,-1]:
        distance=0
        endpoint=np.array(all_points[side])
        current_node=next((r['nodes'][i] for r in candidates for i in [0,-1] if np.linalg.norm(np.array(r['coordinates'][i])*100-endpoint)<.03),None)
        while distance<650:
            endpoint=np.array(all_points[side]);links=[]
            for r in roads:
                if r['id'] in visited or r['tunnel'] or r['roadClass'] in ('footway','path','steps'):continue
                c=np.array(r['coordinates'])*100
                if r['nodes'][0]==current_node:links.append((r,c,r['nodes'][-1]))
                elif r['nodes'][-1]==current_node:links.append((r,c[::-1],r['nodes'][0]))
            if not links:break
            r,c,current_node=max(links,key=lambda item:(item[0]['roadClass']==candidates[0]['roadClass'],LineString(item[1]).length))
            visited.add(r['id']);distance+=LineString(c).length
            if side==0:all_points=list(c[:0:-1])+all_points
            else:all_points+=list(c[1:])
    alignment=LineString(all_points)
    dense=np.array(shapely.segmentize(alignment,12).coords);dense=dense[np.r_[True,np.linalg.norm(np.diff(dense,axis=0),axis=1)>.001]];ground=sampler.sample(dense);wh=water_height(dense,river_only=True)
    wet=np.flatnonzero(np.isfinite(wh))
    if len(wet)<2:raise ValueError(f'Bridge does not cross water: {spec["name"]}')
    station=np.r_[0,np.cumsum(np.linalg.norm(np.diff(dense,axis=0),axis=1))]
    # A nearby lake or a separate channel along an approach must not move towers.
    reaches=np.split(wet,np.flatnonzero(np.diff(station[wet])>100)+1)
    wet=max(reaches,key=lambda ids:station[ids[-1]]-station[ids[0]])
    left,right=wet[0],wet[-1];deck=float(np.nanmax(wh[wet])+spec['deckClearanceMeters'])
    # DSM at endpoints is an estimate; smooth Hermite approaches have zero end slope.
    if not np.isfinite(ground[0]) or not np.isfinite(ground[-1]):raise ValueError(f'Bridge has no dry approach endpoint: {spec["name"]}')
    deck=max(deck,float(ground[0]),float(ground[-1]))
    heights=np.full(len(dense),deck)
    for start,end,h0,h1 in [(0,left,float(ground[0])+.08,deck),(right,len(dense)-1,deck,float(ground[-1])+.08)]:
        t=(station[start:end+1]-station[start])/max(.01,station[end]-station[start]);t=t*t*(3-2*t)
        heights[start:end+1]=h0+(h1-h0)*t
    profile=np.column_stack([dense[:,0]/100,heights/100,dense[:,1]/100])
    bridge=dict(spec,profile=np.round(profile,7).tolist(),waterRange=[float(station[left]),float(station[right])],stationsMeters=np.round(station,4).tolist(),sourceRoadIds=[r['id'] for r in candidates],approachRoadIds=sorted(visited),sourceGeometry='OSM original-node-connected road alignment',estimated=True,deckHeightMethod='DSM-constrained endpoints + estimated water clearance + smooth Hermite approaches',layerId='bridge-'+spec['id'],rideAllowed=True,underwaterClosure='visual only; water level minus 10m; not surveyed bathymetry')
    bridge['lowerLayerId']=('rail-' if spec.get('lowerDeckKind')=='rail' else 'lower-road-')+spec['id'] if spec.get('lowerDeckKind') else None
    if spec.get('lowerDeckOffsetMeters'):
        t0=np.clip(station/max(station[left],1),0,1);t1=np.clip((station[-1]-station)/max(station[-1]-station[right],1),0,1)
        factor=np.minimum(t0*t0*(3-2*t0),t1*t1*(3-2*t1));lower=profile.copy();lower[:,1]-=spec['lowerDeckOffsetMeters']/100*factor
        bridge['lowerProfile']=np.round(lower,7).tolist()
    bridges.append(bridge)

bridge_lines={b['id']:LineString(np.array(b['profile'])[:,[0,2]]) for b in bridges}
def deck_sample(b,coords):
    line=bridge_lines[b['id']];s=np.array(b['stationsMeters'])/100;p=np.array(b['profile'])
    distance=np.array([line.project(Point(*c)) for c in coords])
    return np.interp(distance,s,p[:,1])*100
node_links=collections.defaultdict(set)
for road in roads:
    for node in road['nodes']:node_links[node].add(road['id'])
for index,r in enumerate(roads):
    if index%3000==0:print(f'Grounding road {index}/{len(roads)}',flush=True)
    if r['tunnel']:r['profile']=[];r['rendered']=False;continue
    line=LineString(np.array(r['coordinates'])*100)
    coords=np.array(shapely.segmentize(line,10).coords)
    heights=sampler.sample(coords)
    major=next((b for b in bridges if r['id'] in b['approachRoadIds'] or r['majorBridge']==b['id']),None)
    if major:
        heights=deck_sample(major,coords/100);r['deckLevel']='upper';
        if major['id']=='yangsigang' and r['majorBridge']=='yangsigang' and r['layer']=='2':
            station=np.array([bridge_lines[major['id']].project(Point(*c)) for c in coords/100]);heights=np.interp(station,np.array(major['stationsMeters'])/100,np.array(major['lowerProfile'])[:,1])*100;r['deckLevel']='lower'
        r['surfaceId']=major['lowerLayerId'] if r['deckLevel']=='lower' else 'bridge-'+major['id'];r['bridgeProfile']=major['id'];r['bridge']=True
    elif r['bridge']:
        valid=np.flatnonzero(np.isfinite(heights))
        if len(valid)<2:r['profile']=[];r['rendered']=False;r['qa']='bridge lacks grounded endpoints';continue
        a,b=valid[0],valid[-1];station=np.r_[0,np.cumsum(np.linalg.norm(np.diff(coords,axis=0),axis=1))]
        wh=water_height(coords);clearance=5 if r['roadClass'] in ('footway','path','cycleway') else 8
        peak=max(float(heights[a]),float(heights[b]),float(np.nanmax(wh))+clearance if np.isfinite(wh).any() else float(np.nanmax(heights)))
        t=station/max(station[-1],.01);base=heights[a]*(1-t)+heights[b]*t
        heights=base+(peak-max(heights[a],heights[b]))*np.sin(np.pi*t)**2
        r['heightEstimated']=True;r['heightMethod']='independent endpoint-constrained arch profile; estimated clearance'
    else:heights+=.08
    r['profile']=[[round(float(x/100),7),round(float(y/100),7),round(float(z/100),7)] if np.isfinite(y) else None for (x,z),y in zip(coords,heights)]
    r['rendered']=any(p is not None for p in r['profile']);r['surfaceId']=r.get('surfaceId',r['id']);r['layerId']=(major['lowerLayerId'] if r.get('deckLevel')=='lower' else major['layerId']) if major else ('bridge-' if r['bridge'] else 'ground-')+str(r['layer'])
    r['junctionNodes']=[n for n in r['nodes'] if len(node_links[n])>1]
write(OUT/'roads.json',roads);register(manifest,'roads.json','osm-road-network-v1','urban-source-lock',role='roads')
write(OUT/'bridges.json',bridges);register(manifest,'bridges.json','bridge-profile-v1','urban-source-lock + bridge-specs',role='bridges')
road_meshes=[]
road_groups=collections.defaultdict(list)
for r in roads:
    if not r['rendered'] or r.get('bridgeProfile'):continue
    cls=r['roadClass'].replace('_link','')
    group='express' if cls in ('motorway','trunk') else 'arterial' if cls in ('primary','secondary') else 'local' if cls in ('tertiary','residential','unclassified','living_street') else 'minor'
    center=np.array(r['coordinates']).mean(axis=0);key=f'{group}-{math.floor(center[0]/50)+50}-{math.floor(center[1]/50)+50}'
    road_groups[(group,key)].append(r)
for mesh_index,((group,key),items) in enumerate(sorted(road_groups.items())):
    if mesh_index%30==0:print(f'Road mesh chunk {mesh_index}/{len(road_groups)}',flush=True)
    vertices=[];indices=[]
    for r in items:
        strips=[]
        for a,b in zip(r['profile'],r['profile'][1:]):
            if a is None or b is None:continue
            a,b=np.array(a),np.array(b);d=b-a;length=np.linalg.norm(d[[0,2]])
            if length<1e-7:continue
            offset=np.array([-d[2],0,d[0]])/length*r['width']/200
            strips.append(np.array([a+offset,b+offset,b-offset,a-offset]))
        if not strips:continue
        strips=np.array(strips)
        if not r['bridge']:
            heights=sampler.sample(strips[:,:,[0,2]].reshape(-1,2)*100).reshape(-1,4)
            good=np.isfinite(heights).all(axis=1);strips=strips[good];strips[:,:,1]=(heights[good]+.08)/100
        for corners in strips:
            start=len(vertices);vertices.extend(corners);indices.extend([[start,start+1,start+2],[start,start+2,start+3]])
    if vertices:
        mesh_name=f'roads-{key}.bin';spec=encode(mesh_name,vertices,indices)
        register(manifest,mesh_name,'road-strip-v1','urban-source-lock',role='roads',mesh=spec)
        p=np.array(vertices);road_meshes.append(dict(group=group,bounds=[float(p[:,0].min()),float(p[:,2].min()),float(p[:,0].max()),float(p[:,2].max())],**spec))

regions=[('jianghanguan','江汉关',[114.298,30.579],1500),('cbd','汉口 CBD',[114.245,30.600],1800),('wuchang','武昌滨江',[114.323,30.594],2200),('luojia','武大 / 珞珈山',[114.366,30.537],1600),('guanggu','光谷',[114.414,30.503],2400)]
samples=[]
for key,name,center,radius in regions:
    region=Point(project(*center)).buffer(radius);selected=[r for r,p in zip(records,footprints) if p.intersects(region)]
    n=len(selected)
    samples.append(dict(id=key,name=name,center=center,radiusMeters=radius,buildings=n,missingHeightRatio=sum(r['heightSource']!='osm:height' for r in selected)/max(1,n),heightSources=dict(collections.Counter(r['heightSource'] for r in selected)),estimatedRatio=sum(r['estimated'] for r in selected)/max(1,n),waterOverlap=0,coverage='OSM snapshot only; missing footprints remain empty',heightRange=[min((r['height'] for r in selected),default=0),max((r['height'] for r in selected),default=0)]))
report=dict(source=lock,rawBuildings=sum('building' in r.get('tags',{}) for r in rows),rawBuildingParts=sum('building:part' in r.get('tags',{}) for r in rows),finalBuildings=len(records),heightSources=dict(collections.Counter(r['heightSource'] for r in records)),removed=dict(rejected,overlapDuplicates=len(drop)),remainingOverlapPairs=overlap_pairs,flags=qa_flags,regions=samples,roadCount=len(roads),roadClasses=dict(collections.Counter(r['roadClass'] for r in roads)),tunnels=sum(r['tunnel'] for r in roads),bridgeRoads=sum(r['bridge'] for r in roads),bridgeCount=len(bridges),unrenderedRoads=sum(not r['rendered'] for r in roads),sourceCRS='EPSG:4326',verticalCaveat='DSM support includes canopy and buildings; foundations are estimates, not surveyed DTM',landmarkReplacementCoverage={key:sum(key in r['landmarkIds'] for r in records) for key,_ in landmark_patterns})
replacements=[dict(id=key,matchPattern=pattern,buildingIds=[r['id'] for r in records if key in r['landmarkIds']],footprints=[r['rings'] for r in records if key in r['landmarkIds']],status='source-footprint' if any(key in r['landmarkIds'] for r in records) else 'missing-source-footprint-review-required') for key,pattern in landmark_patterns]
write(OUT/'landmark-replacements.json',replacements);register(manifest,'landmark-replacements.json','landmark-replacement-v1','urban-source-lock',role='qa')
write(OUT/'urban-quality.json',report);register(manifest,'urban-quality.json','phase2-quality-v1','urban-source-lock',role='qa')
manifest['urban']=dict(buildingChunks=building_chunks,roadMeshes=road_meshes,roads='roads.json',bridges='bridges.json',quality='urban-quality.json',source=lock,buildingCount=len(records),roadCount=len(roads),qaViews=samples)
finish(manifest)
write(ROOT/'docs/wuhan-phase2-data-qa.json',report)
print(dict(buildings=len(records),roads=len(roads),bridges=len(bridges),chunks=len(chunks)),flush=True)
