"""Actual canonical top vs retained building footprint and vertical-interval audit."""
import collections
import numpy as np
import shapely
from shapely.geometry import Polygon, LineString, box
from phase2_common import ROOT, OUT, read, write, decode

m=read(OUT/'manifest.json');index=read(OUT/m['urban']['surfaces'])
buildings=[b for c in m['urban']['buildingChunks'] for b in read(OUT/c['file']) if not b['landmarkReplacement']]
polygons=np.array([Polygon(b['rings'][0],b['rings'][1:]) for b in buildings],dtype=object)
tree=shapely.STRtree(polygons)
roads={r['id']:r for c in read(OUT/m['urban']['roads'])['chunks'] for r in read(OUT/c['file'])}
overlaps=[];examined=0;separated=0
for ci,c in enumerate(index['chunks']):
    v,ix=decode(c['file'],c)
    for f in read(OUT/c['metadata'])['features']:
        if not f['rideAllowed'] or f['kind']=='junction':continue
        ids=tree.query(box(*f['bounds']),predicate='intersects')
        if not len(ids):continue
        faces=v[ix[f['triangleStart']:f['triangleStart']+f['triangleCount']]]
        triangles=shapely.polygons(faces[:,:,[0,2]])
        shape=shapely.union_all(triangles);examined+=1
        for bid in ids:
            b=buildings[bid];overlap=shape.intersection(polygons[bid]);area=overlap.area*10000
            if area<.1:continue
            bottom=(b['foundationMeters']+b['minHeightMeters'] if b['minHeightMeters']>0 else min(b['foundationMeters'],*[y for ring in b['bottomMeters'] for y in ring]))/100
            top=(b['foundationMeters']+b['height'])/100
            touching=shapely.intersects(triangles,overlap)
            heights=faces[touching,:,1]
            if not len(heights) or heights.max()+.0175<=bottom or heights.min()>=top:
                separated+=1;continue
            centers=[]
            for id in f['roadIds']:
                r=roads.get(id)
                if r:centers.append(LineString(r['coordinates']))
            center_length=sum(line.intersection(polygons[bid]).length*100 for line in centers)
            overlaps.append(dict(roadId=f['id'],roadSourceIds=f.get('osmIds',[]),buildingId=b['id'],buildingSourceId=b['sourceId'],buildingName=b.get('name',''),bridgeId=f['id'] if f['id'].startswith('bridge-') else None,overlapSquareMeters=area,centerlineIntersectionMeters=center_length,buildingMinHeightMeters=b['minHeightMeters'],bounds=list(overlap.bounds),visualResidentPolicy='Same retained footprint in visual building mesh and collision; ride loads both',classification='source-overlap-review' if center_length>2 else 'road-width-edge-overlap',action='retain visible solid; do not disable collision or silently change source geometry'))
    if ci%100==0:print(f'Building overlap {ci}/{len(index["chunks"])}: {len(overlaps)}',flush=True)
report=dict(datasetId=m['datasetId'],result='AUDIT',examinedSurfaces=examined,verticallySeparatedPairs=separated,counts=dict(collections.Counter(o['classification'] for o in overlaps)),overlaps=overlaps,scope='Exact Float32 projected canonical tops and retained building rings; vertical broad interval and centerline intersections identify review candidates. Not a claim that every OSM overlap is a source error.')
write(ROOT/'docs/wuhan-phase61-road-building-qa.json',report)
print(report['counts'],flush=True)
