"""Deterministic pack IO and exact Phase 1 triangle height queries (metres)."""
import gzip
import hashlib
import json
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'city-data/wuhan/generated'
RAW = ROOT / 'city-data/wuhan/raw'

def read(path):
    return json.loads(Path(path).read_bytes())

def write(path, value):
    Path(path).write_bytes((json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)+'\n').encode('utf-8'))

def decode(name, spec):
    data = gzip.decompress((OUT/name).read_bytes())
    n = spec['vertices']
    return np.frombuffer(data, '<f4', n*3).reshape(-1,3).copy(), np.frombuffer(data, '<u4', offset=n*12).reshape(-1,3).copy()

def encode(name, xyz, indices):
    data = np.asarray(xyz, '<f4').tobytes()+np.asarray(indices, '<u4').tobytes()
    (OUT/name).write_bytes(gzip.compress(data,compresslevel=6,mtime=0))
    return dict(file=name,vertices=len(xyz),triangles=len(indices),encoding='float32-xyz-uint32-triangles-le')

def register(manifest, name, schema, source, **extra):
    body = (OUT/name).read_bytes()
    metadata = dict(bytes=len(body),sha256=hashlib.sha256(body).hexdigest(),schema=schema,source=source,encoding='utf-8-lf' if name.endswith('.json') else 'float32-xyz-uint32-triangles-le',**extra)
    if name.endswith('.bin'):
        metadata.update(compression='gzip',decodedBytes=len(gzip.decompress(body)))
    manifest['dataFiles'][name] = metadata

def finish(manifest):
    manifest['datasetId'] = hashlib.sha256(json.dumps(manifest['dataFiles'],sort_keys=True).encode()).hexdigest()[:16]
    write(OUT/'manifest.json',manifest)

class TerrainSampler:
    """Queries original triangles; LOD is never used for physics or grounding."""
    def __init__(self, xyz, indices):
        self.xyz = xyz.astype(np.float64)*100
        self.indices = indices
        self.centers = self.xyz[indices][:,:,[0,2]].mean(axis=1)
        self.tree = cKDTree(self.centers)

    def sample(self, xz):
        points = np.asarray(xz,dtype=float).reshape(-1,2)
        output = np.full(len(points),np.nan)
        for start in range(0,len(points),2000):
            p = points[start:start+2000]
            for k in (12,64,256):
                todo = np.isnan(output[start:start+len(p)])
                if not todo.any(): break
                _, ids = self.tree.query(p[todo],k=k)
                t = self.xyz[self.indices[ids]]
                a,b,c = t[:,:,0][:,:,[0,2]],t[:,:,1][:,:,[0,2]],t[:,:,2][:,:,[0,2]]
                v0,v1,v2 = b-a,c-a,p[todo,None,:]-a
                den = v0[:,:,0]*v1[:,:,1]-v1[:,:,0]*v0[:,:,1]
                den = np.where(abs(den)<1e-12,np.nan,den)
                u = (v2[:,:,0]*v1[:,:,1]-v1[:,:,0]*v2[:,:,1])/den
                v = (v0[:,:,0]*v2[:,:,1]-v2[:,:,0]*v0[:,:,1])/den
                inside = (u>=-1e-6)&(v>=-1e-6)&(u+v<=1+1e-6)
                found = inside.any(axis=1)
                column = inside.argmax(axis=1)
                rows = np.arange(len(column))
                h = t[rows,column,0,1]*(1-u[rows,column]-v[rows,column])+t[rows,column,1,1]*u[rows,column]+t[rows,column,2,1]*v[rows,column]
                output[start+np.flatnonzero(todo)[found]] = h[found]
        return output
