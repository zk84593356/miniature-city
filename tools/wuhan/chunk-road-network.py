"""Publish topology as bounded spatial JSON files, suitable for Pages limits."""
import collections
import math
import numpy as np
from phase2_common import OUT, read, write, register, finish

m=read(OUT/'manifest.json')
network=read(OUT/'roads.json')
if isinstance(network,dict):
    print('Road topology already chunked.')
else:
    chunks=collections.defaultdict(list)
    for r in network:
        p=np.array(r['coordinates']);x,z=p.mean(axis=0)
        chunks[f'{math.floor(x/20)+50}-{math.floor(z/20)+50}'].append(r)
    items=[]
    for key,roads in sorted(chunks.items()):
        name=f'road-network-{key}.json';write(OUT/name,roads)
        register(m,name,'osm-road-network-chunk-v1','urban-source-lock',role='road-topology')
        items.append(dict(file=name,count=len(roads)))
    write(OUT/'roads.json',dict(schema='osm-road-network-index-v1',count=len(network),chunks=items))
    register(m,'roads.json','osm-road-network-index-v1','urban-source-lock',role='road-topology')
    finish(m)
    print(f'{len(network)} roads in {len(items)} topology files')
