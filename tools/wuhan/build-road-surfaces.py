"""Phase 6 canonical road tops: the SAME float32 triangles render and support Ride.

Ground ribbons are clipped against immutable terrain triangles, preserving their
planes exactly. Topology patches only join shared OSM nodes on compatible layers.
Whole features are assigned to chunks AFTER construction; no tile-local caps.
"""
import collections, hashlib, math, sys
import numpy as np
import shapely
from shapely.geometry import Polygon, LineString, Point
from ride_connections import build_connections, limit_mesh_grade
from phase2_common import ROOT, OUT, read, write, decode, encode, register, finish, TerrainSampler

CLASSES={'primary','secondary','tertiary','residential','unclassified','service','cycleway','living_street','pedestrian','footway','path','trunk','trunk_link'}
ACCESS_CORRIDORS={'osm-way-50538708','osm-way-99463459'}
def parts(g):
 if g.is_empty:return
 if g.geom_type=='Polygon':yield g
 elif hasattr(g,'geoms'):
  for child in g.geoms:yield from parts(child)
def group_for(r):
 c=r['roadClass'].replace('_link','')
 return 'express' if c in ('motorway','trunk') else 'arterial' if c in ('primary','secondary') else 'local' if c in ('tertiary','residential','unclassified','living_street') else 'minor'
def road_allowed(r):return r['access']!='no' and not r['tunnel'] and (not r['roadClass'].startswith(('motorway','trunk')) or r['id'] in ACCESS_CORRIDORS)

def main():
 m=read(OUT/'manifest.json'); cached=[];cached_ids=set();cached_road_ids={}
 if '--reuse-ground' in sys.argv and m['urban'].get('surfaces'):
  cache_index=read(OUT/m['urban']['surfaces'])
  assert cache_index['audit']['sourceTerrainSha256']==m['dataFiles']['terrain.bin']['sha256'],'Ground cache terrain changed'
  for spec in cache_index['chunks']:
   v,ix=decode(spec['file'],spec)
   for f in read(OUT/spec['metadata'])['features']:
    if f['kind'] not in ('road','junction'):continue
    start=f['vertexStart'];cached.append((f,v[start:start+f['vertexCount']],ix[f['triangleStart']:f['triangleStart']+f['triangleCount']]-start));cached_ids.add(f['id']);cached_road_ids[f['id']]=set(f['roadIds'])
 index=read(OUT/m['urban']['roads']);roads=[r for c in index['chunks'] for r in read(OUT/c['file'])]
 bridges=read(OUT/m['urban']['bridges']); bridge_map={b['id']:b for b in bridges}
 connection_config=read(ROOT/'src/cities/wuhan/ride-connections.json')
 ACCESS_CORRIDORS.update(id for c in connection_config['connections'] for side in c['sides'] for id in side['roadIds'])
 xyz,tri=decode('terrain.bin',m['terrain']);sampler=TerrainSampler(xyz,tri)
 print('Indexing exact terrain planes',flush=True)
 terrain_tri=xyz[tri].astype(np.float64); terrain_polys=shapely.polygons(terrain_tri[:,:,[0,2]])
 terrain_tree=shapely.STRtree(terrain_polys)
 by_node=collections.defaultdict(list)
 for r in roads:
  if r['tunnel'] or not r.get('rendered'):continue
  for node,p in zip(r['nodes'],r['coordinates']):by_node[node].append((r,p))
 # Shared-node elevated connectors get one common support plane. Unrelated
 # overlapping layers are never included. Fields only modify actual road polygons.
 transitions=[]
 for b in bridges:
  for end in [0,-1]:
   q=np.array(b['profile'][end])[ [0,2] ];links=[];node=None
   for r in roads:
    if r.get('bridgeProfile') or not r['bridge'] or not r['profile']:continue
    for j in [0,-1]:
     if r['profile'][j] and np.linalg.norm(np.array(r['coordinates'][j])-q)<.00001:links.append(r);node=r['nodes'][j]
   if not links:continue
   radius=max(b['widthMeters'],*[r['width'] for r in links])/200
   angle=np.linspace(0,math.pi*2,32,endpoint=False);samples=q+np.column_stack([np.cos(angle),np.sin(angle)])*radius
   heights=sampler.sample(samples*100)/100
   y=max(float(np.nanmax(heights))+.0008,b['profile'][end][1],*[p[1] for r in links for p in [r['profile'][0],r['profile'][-1]] if p and np.linalg.norm(np.array(p)[[0,2]]-q)<.00001])
   transitions.append(dict(bridge=b['id'],node=node,position=q.tolist(),height=y,widthMeters=max(r['width'] for r in links),flatRadius=radius+.15,roadIds=[r['id'] for r in links],estimated=True,reason='Shared OSM node support envelope, visible road-only transition'))
   ACCESS_CORRIDORS.update(r['id'] for r in links)
 def transition_height(id,q,h):
  for tr in transitions:
   if id not in tr['roadIds'] and id!='bridge-'+tr['bridge']:continue
   distance=np.linalg.norm(q-np.array(tr['position']),axis=-1)
   t=np.clip((distance-tr['flatRadius'])/1,0,1);weight=1-t*t*(3-2*t)
   h=h*(1-weight)+tr['height']*weight
  return h
 baseline=[];bridge_defs=[]
 # Construct deck cross-sections once. At each dry end they exactly follow the
 # terrain crossfall; within 100m that crossfall blends into the elevated deck.
 for b in bridges:
  original_station=np.array(b['stationsMeters']);original_p=np.array(b['profile'],dtype=float)
  dense=np.r_[np.arange(0,b['waterRange'][0],2),np.arange(b['waterRange'][1],original_station[-1],2)]
  # Keep source stations verbatim, but avoid millimetre slivers between a source
  # station and the regular grid: float32 height rounding makes those unstable.
  dense=dense[np.min(np.abs(dense[:,None]-original_station[None,:]),axis=1)>.2]
  tangents=np.diff(original_p[:,[0,2]],axis=0);tangents/=np.linalg.norm(tangents,axis=1)[:,None]
  angles=np.arccos(np.clip(np.sum(tangents[:-1]*tangents[1:],axis=1),-1,1))
  clearance=b['widthMeters']/2*np.tan(angles/2)+.5
  dense=dense[np.all(np.abs(dense[:,None]-original_station[None,1:-1])>clearance[None,:],axis=1)]
  station=np.unique(np.r_[original_station,dense])
  p=np.column_stack([np.interp(station,original_station,original_p[:,j]) for j in range(3)]);width=b['widthMeters']/200
  tangents=np.diff(p[:,[0,2]],axis=0);tangents/=np.linalg.norm(tangents,axis=1)[:,None]
  incoming=np.vstack([tangents[0],tangents]);outgoing=np.vstack([tangents,tangents[-1]])
  d=incoming+outgoing;d/=np.linalg.norm(d,axis=1)[:,None]
  # Intersection of the two offset edges, not an unscaled averaged normal.
  normal=np.column_stack([-d[:,1],d[:,0]])/np.maximum(.4,np.sum(d*incoming,axis=1))[:,None]
  across=np.linspace(-1,1,max(5,math.ceil(b['widthMeters']/2)+1))
  widths=np.full(len(station),width)
  for tr in transitions:
   if tr['bridge']!=b['id']:continue
   end=0 if np.linalg.norm(p[0,[0,2]]-tr['position'])<.001 else -1
   distance=station if end==0 else station[-1]-station
   t=np.clip(distance/100,0,1);t=t*t*(3-2*t)
   widths=np.minimum(widths,tr['widthMeters']/200+(width-tr['widthMeters']/200)*t)
  xz=p[:,None,[0,2]]+normal[:,None,:]*widths[:,None,None]*across[None,:,None]
  heights=sampler.sample(xz.reshape(-1,2)*100).reshape(len(p),-1)/100
  for end in [0,-1]:
   baseline.append(dict(bridge=b['id'],end=end,center=p[end].tolist(),terrainEdgesMeters=(heights[end,[0,-1]]*100).tolist(),edgeSeamMeters=((heights[end,[0,-1]]-p[end,1])*100).tolist(),roadIds=[r['id'] for r in roads if any(np.linalg.norm(np.asarray(c)-p[end,[0,2]])<.001 for c in [r['coordinates'][0],r['coordinates'][-1]])]))
  # A DSM is not surveyed bare-earth road grade. Raise only dry approach sections
  # to their sampled support envelope and record this as an estimated foundation.
  dry=(station<b['waterRange'][0])|(station>b['waterRange'][1])
  envelope=np.where(np.isfinite(heights),heights+.0008,-np.inf).max(axis=1)
  target=p[:,1].copy();target[dry]=np.maximum(target[dry],envelope[dry])
  # Upper Lipschitz envelope removes abrupt peaks without lowering the source DSM.
  for i in range(1,len(p)):target[i]=max(target[i],target[i-1]-(station[i]-station[i-1])*.12/100)
  for i in range(len(p)-2,-1,-1):target[i]=max(target[i],target[i+1]-(station[i+1]-station[i])*.12/100)
  joins=[0,float(station[-1])]
  approach_nodes={node for r in roads if r['id'] in b['approachRoadIds'] for node in r['nodes']}
  for node in approach_nodes:
   links=by_node.get(node,[])
   if not any(not r.get('bridgeProfile') and not r['bridge'] and r['roadClass'] in CLASSES for r,_ in links):continue
   q=links[0][1];j=np.linalg.norm(p[:,[0,2]]-q,axis=1).argmin()
   if dry[j] and np.linalg.norm(p[j,[0,2]]-q)<.002:joins.append(float(station[j]))
  blend=np.clip((np.min(np.abs(station[:,None]-np.array(joins)[None,:]),axis=1)-100)/100,0,1);blend=blend*blend*(3-2*blend)
  top=np.repeat(target[:,None],len(across),axis=1)
  for i in range(len(p)):
   if np.isfinite(heights[i]).all():top[i]=top[i]*blend[i]+(heights[i]+.0008)*(1-blend[i])
  top=transition_height('bridge-'+b['id'],xz,top)
  if b['id']=='qingchuan':
   # DSM-supported approaches need a grade envelope at every lateral station,
   # not only the centre: isolated side samples otherwise exceed riding slope.
   for i in range(1,len(p)):top[i]=np.maximum(top[i],top[i-1]-(station[i]-station[i-1])*.25/100)
   for i in range(len(p)-2,-1,-1):top[i]=np.maximum(top[i],top[i+1]-(station[i+1]-station[i])*.25/100)
  vertices=np.stack([xz[:,:,0],top,xz[:,:,1]],axis=-1).reshape(-1,3)
  faces=[];n=len(across)
  for i in range(len(p)-1):
   for j in range(n-1):
    a=i*n+j;faces.extend([[a,a+n,a+n+1],[a,a+n+1,a+1]])
  center=top[:,len(across)//2] if len(across)%2 else (top[:,len(across)//2-1]+top[:,len(across)//2])/2
  canonical_profile=original_p.copy();canonical_profile[:,1]=np.interp(original_station,station,center)
  bridge_defs.append(dict(id='bridge-'+b['id'],kind='bridge',layerId=b['layerId'],rideAllowed=True,roadIds=b['approachRoadIds'],profile=canonical_profile.tolist(),foundationProfile=np.column_stack([station,top.min(axis=1)]).tolist(),width=b['widthMeters'],xyz=vertices,indices=np.array(faces),estimated=True,reason='DSM supported approach envelope and full-width terminal crossfall; original OSM alignment preserved'))
 selected,connection_patches,connection_junctions,connection_height=build_connections(connection_config,roads,bridge_defs,sampler)
 for c in connection_config['connections']:
  major=next(b for b in bridge_defs if b['id']=='bridge-'+c['bridgeId']);major['accessProfiles']=[]
  for id in sorted({id for side in c['sides'] for id in side['roadIds']}):
   r=next(r for r in roads if r['id']==id);rp=np.array(r['profile']);rs=np.r_[0,np.cumsum(np.linalg.norm(np.diff(rp[:,[0,2]],axis=0),axis=1))];stations=np.unique(np.r_[rs,np.arange(0,rs[-1],.02)])
   points=np.column_stack([np.interp(stations,rs,rp[:,j]) for j in range(3)]);q=points[:,[0,2]]
   points[:,1]=connection_height(r,q,transition_height(id,q,points[:,1])) if r['bridge'] else sampler.sample(q*100)/100+.0008
   major['accessProfiles'].append(dict(id=id,width=r['width'],profile=points.tolist()))
 print('Constructing ribbons and real-node junction patches',flush=True)
 features=[]
 for r in roads:
  if r['tunnel'] or not r.get('rendered') or r.get('bridgeProfile'):continue
  line=LineString(r['coordinates'])
  if line.length<.00001:continue
  poly=line.buffer(r['width']/200,cap_style='flat',join_style='mitre',mitre_limit=2.5)
  features.append(dict(id=r['id'],roadIds=[r['id']],osmIds=[r['osmId']],kind='bridge' if r['bridge'] else 'road',layerId=r['layerId'],rideAllowed=road_allowed(r),group=group_for(r),polygon=poly,profile=r['profile'],width=r['width']))
 junctions=0
 for node,links in by_node.items():
  groups=collections.defaultdict(list)
  for r,p in links:
   if r['bridge'] and not r.get('bridgeProfile'):continue
   groups['ground-0' if r.get('bridgeProfile') else r['layerId']].append((r,p))
  for layer,links in groups.items():
   unique={r['id']:(r,p) for r,p in links}
   if len(unique)<2 or all(r.get('bridgeProfile') for r,_ in unique.values()):continue
   links=list(unique.values());p=links[0][1];arms=[]
   for r,_ in links:
    j=r['nodes'].index(node);coords=r['coordinates'];w=r['width']/200
    for k in [j-1,j+1]:
     if k<0 or k>=len(coords):continue
     d=np.array(coords[k])-p;length=np.linalg.norm(d)
     if length<1e-7:continue
     d/=length;n=np.array([-d[1],d[0]])
     center=np.array(p)+d*min(length,w*1.5)
     arms.extend([center+n*w,center-n*w])
   if len(arms)<4:continue
   poly=shapely.MultiPoint(arms).convex_hull
   if poly.geom_type!='Polygon':continue
   junctions+=1
   features.append(dict(id=f'junction-{node}-{layer}',roadIds=list(unique),osmIds=[r['osmId'] for r,_ in links],nodeId=node,kind='junction',layerId=layer,rideAllowed=any(road_allowed(r) for r,_ in links),group='local',polygon=poly,profile=None,width=max(r['width'] for r,_ in links)))
 for tr in transitions:
  arms=[];q=np.array(tr['position']);b=bridge_map[tr['bridge']]
  for r,_ in by_node[tr['node']]:
   if r['id'] not in tr['roadIds'] and r['id'] not in b['approachRoadIds']:continue
   j=r['nodes'].index(tr['node']);w=(tr['widthMeters'] if r.get('bridgeProfile') else r['width'])/200
   for k in [j-1,j+1]:
    if not 0<=k<len(r['coordinates']):continue
    d=np.array(r['coordinates'][k])-q;length=np.linalg.norm(d)
    if length<1e-7:continue
    d/=length;n=np.array([-d[1],d[0]]);center=q+d*min(length,.1);arms.extend([center+n*w,center-n*w])
  poly=shapely.MultiPoint(arms).convex_hull
  if poly.geom_type=='Polygon':
   features.append(dict(id=f"transition-{tr['node']}",roadIds=tr['roadIds']+b['approachRoadIds'],osmIds=[],nodeId=tr['node'],kind='bridge',layerId=b['layerId'],rideAllowed=True,group='arterial',polygon=poly,profile=[[q[0],tr['height'],q[1]],[q[0]+.01,tr['height'],q[1]]],width=b['widthMeters'],estimated=True,reason=tr['reason']))
 for patch,poly in connection_junctions:
  ground=patch['kind']=='ground'
  features.append(dict(id=f"ride-transition-{patch['node']}",roadIds=patch['roadIds']+([patch['majorSurfaceId']] if patch['majorSurfaceId'] else []),osmIds=[],nodeId=patch['node'],kind='junction' if ground else 'bridge',layerId='ground-0' if ground else f"connection-{patch['node']}",rideAllowed=True,group='arterial',polygon=poly,profile=None,width=10,connectionPatch=patch,estimated=True,reason=patch['reason']))
 # No road shape is inferred from chunk coordinates. Chunking changes storage only.
 chunks=collections.defaultdict(list);audit={'sourceTerrainSha256':m['dataFiles']['terrain.bin']['sha256'],'roadFeatures':len(features),'junctions':junctions,'bridgeEndsBefore':baseline,'transitions':transitions,'unsupported':[],'rideConnectionPatches':connection_patches}
 def emit(f,positions,indices):
  if not len(indices):return
  v=np.asarray(positions,np.float32);ix=np.asarray(indices,np.uint32)
  center=v[:,[0,2]].mean(axis=0);key=f'{math.floor(center[0]/20)+50}-{math.floor(center[1]/20)+50}'
  meta={k:val for k,val in f.items() if k not in ('polygon','profile','xyz','indices','connectionPatch')}
  if meta['id'] in ACCESS_CORRIDORS:meta.update(rideAllowed=True,virtualBridgeAccess=True,reason='Virtual moped access on sourced bridge connector; not a statement of legal road access')
  meta['bounds']=[float(v[:,0].min()),float(v[:,2].min()),float(v[:,0].max()),float(v[:,2].max())]
  chunks[key].append((meta,v,ix))
 current={f['id']:f for f in features}
 reusable={id for id in cached_ids if id in current and set(current[id]['roadIds'])==cached_road_ids[id]}
 for f,v,ix in cached:
  if f['id'] in reusable:emit({**f,'rideAllowed':current[f['id']]['rideAllowed']},v,ix)
 for counter,f in enumerate(features):
  if f['id'] in reusable:continue
  if counter%2000==0:print(f'Canonical road tops {counter}/{len(features)}',flush=True)
  poly=f['polygon'];positions=[];indices=[]
  if f['kind']=='bridge' and f.get('connectionPatch'):
   patch=f['connectionPatch'];q0=np.array(patch['position'])
   for face in parts(shapely.constrained_delaunay_triangles(shapely.segmentize(poly,.03))):
    q=np.array(face.exterior.coords)[:3];h=patch['height']+(q-q0)@patch['gradient'];a=len(positions);positions.extend(np.column_stack([q[:,0],h,q[:,1]]));indices.append([a,a+2,a+1])
  elif f['kind']=='bridge':
   # Minor bridges retain their published grade; triangulate their mitered outline.
   line=LineString([p[::2] for p in f['profile'] if p]);p=np.array([p for p in f['profile'] if p]);s=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p[:,[0,2]],axis=0),axis=1))]
   for face in parts(shapely.constrained_delaunay_triangles(shapely.segmentize(poly,.05) if f['id'] in ACCESS_CORRIDORS else poly)):
    q=np.array(face.exterior.coords)[:3];station=np.array([line.project(Point(v)) for v in q]);h=transition_height(f['id'],q,np.interp(station,s,p[:,1]));h=connection_height(f,q,h);a=len(positions);positions.extend(np.column_stack([q[:,0],h,q[:,1]]));indices.append([a,a+2,a+1])
  else:
   ids=terrain_tree.query(poly,predicate='intersects')
   for tid in ids:
    clipped=terrain_polys[tid].intersection(poly)
    t=terrain_tri[tid];a,b,c=t[:,[0,2]];uv=np.column_stack([b-a,c-a]);den=np.linalg.det(uv)
    if abs(den)<1e-15:continue
    inv=np.linalg.inv(uv)
    for part in parts(clipped):
     for face in parts(shapely.constrained_delaunay_triangles(part)):
      q=np.asarray(face.exterior.coords)[:3];weights=(q-a)@inv.T;h=t[0,1]+weights@(t[1:,1]-t[0,1])+.0008
      start=len(positions);positions.extend(np.column_stack([q[:,0],h,q[:,1]]));indices.append([start,start+2,start+1])
   if not indices:audit['unsupported'].append(dict(id=f['id'],roadIds=f['roadIds'],bounds=list(poly.bounds),reason='No stable land triangles; source may be over water or outside pack.'))
  if f['id'] in selected and f['kind']=='bridge' and len(indices):
   positions,grade=limit_mesh_grade(positions,indices,next(r for r in roads if r['id']==f['id']),connection_patches);f['gradeAdjustment']=grade
  emit(f,positions,indices)
 for f in bridge_defs:emit({**f,'group':'arterial','osmIds':[]},f['xyz'],f['indices'])
 specs=[]
 for key,items in sorted(chunks.items()):
  positions=[];indices=[];metadata=[]
  for meta,v,ix in items:
   meta.update(vertexStart=len(positions),vertexCount=len(v),triangleStart=len(indices),triangleCount=len(ix));indices.extend(ix+len(positions));positions.extend(v);metadata.append(meta)
  name=f'road-surface-{key}.bin';spec=encode(name,positions,indices);spec['bounds']=[min(f['bounds'][0] for f in metadata),min(f['bounds'][1] for f in metadata),max(f['bounds'][2] for f in metadata),max(f['bounds'][3] for f in metadata)]
  spec['maxHeight']=max(float(v[:,1].max()) for _,v,_ in items)
  meta_name=f'road-surface-{key}.json';write(OUT/meta_name,dict(schema='canonical-road-triangles-v1',features=metadata));spec['metadata']=meta_name;spec['bridgeIds']=[f['id'] for f in metadata if f['id'].startswith('bridge-')]
  feature_roads={id for f in metadata for id in f.get('roadIds',[])}
  spec['bridgeAccessIds']=['bridge-'+c['bridgeId'] for c in connection_config['connections'] if any(id in feature_roads for side in c['sides'] for id in side['roadIds'])]
  register(m,name,'canonical-road-triangles-v1','urban-source-lock + immutable terrain',role='road-surfaces',mesh=spec);register(m,meta_name,'canonical-road-features-v1','urban-source-lock',role='road-surfaces');specs.append(spec)
 definitions=[{k:v for k,v in f.items() if k not in ('xyz','indices')} for f in bridge_defs]
 name='road-surfaces.json';write(OUT/name,dict(schema='canonical-road-index-v1',chunks=specs,bridges=definitions,rideConnections=connection_config['connections'],groundOffsetMeters=.08,construction='Miter/bevel ribbons and actual-node patches clipped to immutable terrain planes; float32 tops shared by renderer and sampler',audit=audit))
 register(m,name,'canonical-road-index-v1','urban-source-lock + immutable terrain',role='road-surfaces');m['urban']['surfaces']=name;m['phase']=6;finish(m)
 write(ROOT/'docs/wuhan-phase6-road-construction-qa.json',audit)
 print(f'Canonical tops: {len(features)} features, {junctions} junctions, {len(specs)} chunks',flush=True)

if __name__=='__main__':main()
