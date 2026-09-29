"""Scan actual float32 rendered road tops at 1 m intervals, including footprint.

No height/proximity tolerance can turn a missing polygon into a passing sample.
Terminal vehicle overhang is tested by the separate shared-node/bridge ride tests.
"""
import collections, math
import numpy as np
import shapely
from shapely.geometry import LineString, Point
from phase2_common import OUT, ROOT, read, write, decode, TerrainSampler

def main():
 m=read(OUT/'manifest.json');index=read(OUT/m['urban']['surfaces'])
 roads={r['id']:r for c in read(OUT/m['urban']['roads'])['chunks'] for r in read(OUT/c['file'])}
 terrain=TerrainSampler(*decode('terrain.bin',m['terrain']))
 water_shapes=np.array([shapely.Polygon(w['rings'][0],w['rings'][1:]) for w in read(OUT/'water.json')],dtype=object)
 shapely.prepare(water_shapes);waters=shapely.STRtree(water_shapes)
 def water_hits(points):
  pairs=waters.query(points)
  if not pairs.shape[1]:return pairs
  return pairs[:,shapely.intersects(water_shapes[pairs[1]],points[pairs[0]])]
 bridges={b['id']:b for b in index['bridges']};counts=collections.Counter({k:0 for k in ['gapCount','heightSeamCount','missingSurfaceCount','waterLeakCount','layerMismatchCount']});failures=[];summary=[];source_findings=[]
 for ci,spec in enumerate(index['chunks']):
  if ci%100==0:print(f'Road continuity chunks {ci}/{len(index["chunks"])}',flush=True)
  xyz,ix=decode(spec['file'],spec)
  for f in read(OUT/spec['metadata'])['features']:
   if f['kind']=='junction' or not f['rideAllowed']:continue
   road=roads.get(f['id']);bridge=bridges.get(f['id'])
   if not road and not bridge:continue
   if road and road['roadClass'] not in {'primary','secondary','tertiary','residential','unclassified','service','cycleway','living_street','trunk','trunk_link'}:continue
   p=np.array(road['coordinates'] if road else [[p[0],p[2]] for p in bridge['profile']]);line=LineString(p);length=line.length
   if length<.025:continue
   stations=np.arange(.010,length-.010,.01);center=shapely.line_interpolate_point(line,stations);xy=shapely.get_coordinates(center)
   before=shapely.get_coordinates(shapely.line_interpolate_point(line,stations-.0001));after=shapely.get_coordinates(shapely.line_interpolate_point(line,stations+.0001));d=after-before;d/=np.linalg.norm(d,axis=1)[:,None];normal=np.column_stack([-d[:,1],d[:,0]])
   probes=[xy,xy+normal*.002,xy-normal*.002]
   for forward in [-.0058,.0058]:
    for side in [-.0044,.0044]:probes.append(xy+d*forward+normal*side)
   q=np.concatenate(probes);tri=xyz[ix[f['triangleStart']:f['triangleStart']+f['triangleCount']]].astype(float)
   shapes=shapely.polygons(tri[:,:,[0,2]]);tree=shapely.STRtree(shapes);hits=tree.query(shapely.points(q),predicate='intersects');covered=np.zeros(len(q),bool);covered[hits[0]]=True
   vertices=tri.reshape(-1,3);_,inverse=np.unique(vertices[:,[0,2]],axis=0,return_inverse=True)
   lo=np.full(inverse.max()+1,np.inf);hi=np.full(len(lo),-np.inf);np.minimum.at(lo,inverse,vertices[:,1]);np.maximum.at(hi,inverse,vertices[:,1]);counts['heightSeamCount']+=int(((hi-lo)>.001).sum())
   if road and f['layerId']!=road['layerId']:counts['layerMismatchCount']+=1
   if road and not road['bridge']:
    wet_points=shapely.points(q[covered]);wet_hits=water_hits(wet_points)
    for j in np.unique(wet_hits[0]):
     position=q[covered][j];ids=wet_hits[1,wet_hits[0]==j]
     clearance=min(shapely.distance(wet_points[j],water_shapes[k].boundary) for k in ids)
     # The rendered road is Float32; the source water ring is Float64. Resolve
     # only representational boundary contact (two Float32 ULPs), never a road
     # inside water. Preserve the coordinates and measured distance for review.
     precision=float(np.max(np.spacing(np.abs(position).astype(np.float32)))*2)
     if clearance<=precision:
      counts['float32WaterBoundaryContacts']+=1
      source_findings.append(dict(roadId=f['id'],position=position.tolist(),reason='Float32 road / Float64 shoreline boundary contact',distanceMeters=float(clearance*100),precisionMeters=precision*100))
     else:
      counts['waterLeakCount']+=1;failures.append(dict(roadId=f['id'],osmIds=f.get('osmIds'),surfaceIds=[f['id']],position=position.tolist(),reason='Ground road inside immutable water polygon',distanceMeters=float(clearance*100)))
   counts['roadCount']+=1;counts['sampleCount']+=len(q)
   missing=np.flatnonzero(~covered)
   # OSM ways can extend beyond the pack or disagree with the frozen water mask.
   # Report those unavailable source sections separately; never invent a bridge.
   degree=math.pi/180*6371008.8/100
   outside=(q[:,0]<(114.02-114.32)*degree*math.cos(math.radians(30.56)))|(q[:,0]>(114.65-114.32)*degree*math.cos(math.radians(30.56)))|(q[:,1]<(30.56-30.83)*degree)|(q[:,1]>(30.56-30.30)*degree)
   counts['outsidePackSamples']+=int(outside[missing].sum());missing=missing[~outside[missing]]
   if len(missing):
    wet_hits=water_hits(shapely.points(q[missing]));wet=np.zeros(len(missing),bool);wet[wet_hits[0]]=True
    for j in missing[wet][:3]:source_findings.append(dict(roadId=f['id'],osmIds=f.get('osmIds'),position=q[j].tolist(),reason='OSM road footprint conflicts with immutable water mask; no invented surface'))
    counts['sourceWaterConflictSamples']+=int(wet.sum());missing=missing[~wet]
   if len(missing):
    supported=np.isfinite(terrain.sample(q[missing]*100));counts['sourceUnsupportedSamples']+=int((~supported).sum());missing=missing[supported]
   if len(missing) and road:
    outline=line.buffer(road['width']/200,cap_style='flat',join_style='mitre',mitre_limit=2.5)
    within=shapely.intersects(outline,shapely.points(q[missing]));counts['footprintOutsideSourceRoadSamples']+=int((~within).sum());missing=missing[within]
   counts['missingSurfaceCount']+=len(missing)
   counts['gapCount']+=int(bool(len(missing)))
   if len(missing):
    counts['roadsWithGaps']+=1
    for j in missing[:30]:
     x,z=q[j];degree=math.pi/180*6371008.8/100
     failures.append(dict(roadId=f['id'],osmIds=f.get('osmIds'),surfaceIds=[f['id']],layerId=f['layerId'],position=[float(x),float(z)],longitude=114.32+x/(degree*math.cos(math.radians(30.56))),latitude=30.56-z/degree,probe=int(j//len(xy)),reason='No canonical triangle at required footprint point'))
   if bridge:summary.append(dict(id=bridge['id'],samples=len(q),missingSurfaceCount=len(missing)))
 failed=any(counts[k] for k in ['gapCount','heightSeamCount','missingSurfaceCount','waterLeakCount','layerMismatchCount'])
 report=dict(result='FAIL' if failed else 'PASS',datasetId=m['datasetId'],spacingMeters=1,footprint='center, +/-20cm wheel lines, all four 58cm x 44cm corners',counts=dict(counts),bridges=summary,failures=failures,sourceFindings=source_findings,scope='Every supported main rideable road ribbon, excluding <2.5m short ways and terminal 1m overhang; topology transitions additionally checked by runtime suite. Height seams compare coincident XY vertices, not the legitimate grade between samples.')
 write(ROOT/'docs/wuhan-phase6-road-continuity-qa.json',report);print(dict(counts),flush=True)
 if failed:raise SystemExit(1)

if __name__=='__main__':main()
