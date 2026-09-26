"""Incremental Phase 2 water gradients + boundary-preserving terrain display LOD.

Keeps Phase 1 x/z topology and full-resolution height surface. LOD constrained retriangulation
locks every chunk boundary and shoreline vertex; full geometry is used nearby.
"""
import math
import hashlib
import numpy as np
import rasterio
import triangle
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from shapely.ops import polygonize
from shapely.geometry import LineString
from scipy.ndimage import map_coordinates
from scipy.spatial import cKDTree
from shapely.geometry import Polygon, Point
from phase2_common import ROOT, OUT, RAW, read, write, decode, encode, register, finish

for locked in read(ROOT/'src/cities/wuhan/source-lock.json'):
    body=(RAW/locked['file']).read_bytes()
    assert len(body)==locked['bytes'] and hashlib.sha256(body).hexdigest()==locked['sha256'],locked['file']
manifest = read(OUT/'manifest.json')
terrain, ti = decode('terrain.bin',manifest['terrain'])
water, wi = decode('water.bin',manifest['water'])
waters = read(OUT/'water.json')
degree = math.pi/180*6371008.8
def project(lon,lat): return [(lon-114.32)*degree*math.cos(math.radians(30.56))/100,(30.56-lat)*degree/100]
river_ids = [i for i,w in enumerate(waters) if any(Polygon(w['rings'][0],w['rings'][1:]).covers(Point(project(*p))) for p in [(114.289,30.557),(114.271,30.563)])]
assert river_ids
with rasterio.open(RAW/'dem.tif') as dem:
    raster,inverse = dem.read(1),~dem.transform
    probes=[]
    for i in river_ids:
        poly=Polygon(waters[i]['rings'][0],waters[i]['rings'][1:]).buffer(-.5)
        x0,z0,x1,z1=poly.bounds
        for x in np.arange(x0,x1,3):
            for z in np.arange(z0,z1,3):
                if poly.contains(Point(x,z)):probes.append([x,z])
    probes=np.array(probes)*100
    col,row=inverse*(probes[:,0]/degree/math.cos(math.radians(30.56))+114.32,30.56-probes[:,1]/degree)
    observed=map_coordinates(raster,[row-.5,col-.5],order=1,mode='nearest')
    # A common continuous plane is deliberate: no separate tributary plane seam.
    longitudinal=probes@np.array([.6,-.8])
    good=(observed>=np.percentile(observed,10))&(observed<=np.percentile(observed,90))
    fitted=np.polyfit(longitudinal[good],observed[good],1)
    gradient=float(np.clip(-fitted[0],.00001,.00008))
    intercept=float(np.median(observed[good]+gradient*longitudinal[good]))
model=dict(kind='river-plane-v1',estimated=True,confidence='low',source='Copernicus GLO-30 locked DSM',method='Robust interior DSM longitudinal regression; shared Yangtze/Han plane; downstream EN direction (0.6,0.8); slope bounded 0.01–0.08 m/km. Visual stage, not real-time hydrology.',interceptMeters=intercept,gradient=gradient,direction=[.6,-.8],rawGradient=float(-fitted[0]),samples=int(good.sum()),confluenceContinuous=True)
river_polys=[Polygon(waters[i]['rings'][0],waters[i]['rings'][1:]) for i in river_ids]
import shapely
river=shapely.union_all(river_polys)
mask=shapely.intersects_xy(river,water[:,0],water[:,2])
# Float32 shoreline rounding requires a tiny inclusion tolerance, not changing rings.
mask=shapely.intersects_xy(river.buffer(.00002),water[:,0],water[:,2])
edges=np.concatenate([wi[:,[0,1]],wi[:,[1,2]],wi[:,[2,0]]])
_,labels=connected_components(coo_matrix((np.ones(len(edges)),(edges[:,0],edges[:,1])),shape=(len(water),len(water))),directed=False)
mask=np.isin(labels,np.unique(labels[mask]))
water[mask,1]=(intercept-gradient*(water[mask][:,[0,2]]*100@np.array([.6,-.8])))/100
shore=water[mask][:,[0,2]]
dist,_=cKDTree(shore).query(terrain[:,[0,2]])
bank=dist<.00003
terrain[bank,1]=(intercept-gradient*(terrain[bank][:,[0,2]]*100@np.array([.6,-.8])))/100
for i,w in enumerate(waters):
    w['id']=f'water-{i}'
    w['kind']='river' if i in river_ids else 'lake'
    if i in river_ids:w['surface']=model
manifest['terrain']=encode('terrain.bin',terrain,ti)
manifest['water']=encode('water.bin',water,wi)
write(OUT/'water.json',waters)
quality=read(OUT/'quality.json')
quality['riverSurface']=model
quality['processing']=[s for s in quality['processing'] if not s.startswith('Each connected') and not s.startswith('Continuous static')]
quality['processing'] += ['Lakes retain Phase 1 median DSM levels. Yangtze/Han use a shared continuous estimated longitudinal plane.', 'Full-resolution terrain is the stable height surface. Display LOD uses constrained retriangulation, locking shore and chunk boundaries.']
write(OUT/'quality.json',quality)
for name in ['terrain.bin','water.bin','water.json','quality.json','water-provenance.json']:
    register(manifest,name,'wuhan-geography-v2', 'phase1-locked-sources',role='foundation')

centers=terrain[ti][:,:,[0,2]].mean(axis=1)
keys=np.floor(centers/50).astype(int)
unique,inverse=np.unique(keys,axis=0,return_inverse=True)
chunks=[]
overview_vertices,overview_indices=[],[]
overview_offset=0
print(f'Generating {len(unique)} terrain chunks',flush=True)
for chunk_id,key in enumerate(unique):
    if chunk_id%10==0:print(f'LOD chunk {chunk_id}',flush=True)
    tris=ti[inverse==chunk_id]
    used,local=np.unique(tris,return_inverse=True)
    verts=terrain[used]
    local=local.reshape(-1,3)
    edges=np.sort(np.concatenate([local[:,[0,1]],local[:,[1,2]],local[:,[2,0]]]),axis=1)
    edges,count=np.unique(edges,axis=0,return_counts=True)
    locked=np.zeros(len(verts),bool);locked[np.unique(edges[count==1])]=True
    levels=[]
    for step in [0, .6, 1.2, 2.4]:
        if step==0: v,ind=verts,local
        else:
            cells=np.floor(verts[:,[0,2]]/step).astype(np.int64)
            interior=np.flatnonzero(~locked)
            _,first=np.unique(cells[interior],axis=0,return_index=True)
            selected=np.sort(np.r_[np.flatnonzero(locked),interior[first]])
            mapping=np.full(len(verts),-1,int);mapping[selected]=np.arange(len(selected))
            boundary=edges[count==1]
            points,remap=np.unique(verts[selected][:,[0,2]],axis=0,return_inverse=True)
            segments=remap[mapping[boundary]]
            segments=np.unique(np.sort(segments[segments[:,0]!=segments[:,1]],axis=1),axis=0)
            pslg=dict(vertices=points,segments=segments)
            # Every boundary is constrained. Classify nested loops against the
            # original chunk triangles, not against the surrounding land.
            candidate_polys=list(polygonize([LineString(verts[e][:,[0,2]]) for e in boundary]))
            local_tri=verts[local][:,:,[0,2]].astype(float)
            tree=cKDTree(local_tri.mean(axis=1));holes=[]
            for poly in candidate_polys:
                point=poly.representative_point();q=np.array([point.x,point.y]);_,ids=tree.query(q,k=min(64,len(local_tri)))
                t=local_tri[np.atleast_1d(ids)];a,b,c=t[:,0],t[:,1],t[:,2];u=b-a;w=c-a;d=q-a
                det=u[:,0]*w[:,1]-w[:,0]*u[:,1]
                det=np.where(abs(det)<1e-14,np.nan,det)
                aa=(d[:,0]*w[:,1]-w[:,0]*d[:,1])/det;bb=(u[:,0]*d[:,1]-d[:,0]*u[:,1])/det
                if not ((aa>=-1e-6)&(bb>=-1e-6)&(aa+bb<=1+1e-6)).any():holes.append(q)
            if holes:pslg['holes']=np.array(holes)
            result=triangle.triangulate(pslg,'pQ')
            _,nearest=cKDTree(verts[selected][:,[0,2]]).query(result['vertices'])
            v=verts[selected[nearest]]
            ind=result['triangles'][:,[0,2,1]]
        def projected_area(p,t):
            q=p[t].astype(float)
            return float(-((q[:,1,0]-q[:,0,0])*(q[:,2,2]-q[:,0,2])-(q[:,1,2]-q[:,0,2])*(q[:,2,0]-q[:,0,0])).sum()/2)
        if abs(projected_area(v,ind)-projected_area(verts,local))>.01:
            print(f'Preserve full topology for chunk {chunk_id}, LOD {step}',flush=True)
            v,ind=verts,local
        name=f'terrain-{chunk_id}-{int(step*100) or 30}.bin'
        spec=encode(name,v,ind)
        register(manifest,name,'terrain-display-lod-v1','phase1-locked-dem',role='terrain-lod',mesh=spec)
        levels.append(dict(meters=int(step*100) or 30,**spec))
    overview_indices.append(ind+overview_offset)
    overview_vertices.append(v)
    chunks.append(dict(id=chunk_id,bounds=[float(verts[:,0].min()),float(verts[:,2].min()),float(verts[:,0].max()),float(verts[:,2].max())],levels=levels,overviewVertexStart=overview_offset,overviewVertexCount=len(v),overviewTriangleStart=sum(len(i) for i in overview_indices[:-1]),overviewTriangleCount=len(ind)))
    overview_offset+=len(v)
manifest['terrainOverview']=encode('terrain-overview.bin',np.concatenate(overview_vertices),np.concatenate(overview_indices))
register(manifest,'terrain-overview.bin','terrain-display-lod-v1','phase1-locked-dem',role='foundation',mesh=manifest['terrainOverview'])
manifest['terrainChunks']=chunks
manifest['phase']=2
manifest['stableSurface']='terrain.bin'
finish(manifest)
print(f'Foundation complete; rivers {river_ids}; banks {bank.sum()}; LOD triangles '+str([sum(c['levels'][i]['triangles'] for c in chunks) for i in range(4)]),flush=True)
