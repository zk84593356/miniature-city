"""Explicit, sourced bridge access links; only canonical presentation is adjusted."""
import numpy as np
import shapely
from shapely.geometry import Point, LineString


def limit_mesh_grade(positions, indices, road, patches):
    """Constrain the visible triangle planes, keeping shared endpoint planes fixed.

    A wide, bent access ribbon has shorter inner edges than its centreline. A
    centreline-only grade limit therefore does not bound its actual face normals.
    Project excessive face gradients onto a 25-degree cone; no physics tolerance
    changes and no hidden support geometry are involved.
    """
    vertices=np.asarray(positions,dtype=float);faces=np.asarray(indices,dtype=int)
    q,first,inverse=np.unique(vertices[:,[0,2]],axis=0,return_index=True,return_inverse=True)
    h=vertices[first,1].copy();initial=h.copy();ix=inverse[faces]
    t=q[ix];u=t[:,1]-t[:,0];v=t[:,2]-t[:,0];den=u[:,0]*v[:,1]-u[:,1]*v[:,0]
    safe=np.abs(den)>1e-13;ix=ix[safe];u=u[safe];v=v[safe];den=den[safe]
    gx=np.column_stack([u[:,1]-v[:,1],v[:,1],-u[:,1]])/den[:,None]
    gz=np.column_stack([v[:,0]-u[:,0],-v[:,0],u[:,0]])/den[:,None]
    line=LineString([p[::2] for p in road['profile'] if p]);station=np.array([line.project(Point(p)) for p in q])
    fixed=np.zeros(len(q),dtype=bool)
    for patch in patches:
        if road['id'] in patch['roadIds']:
            at=line.project(Point(patch['position']));fixed|=np.abs(station-at)<patch['radius']+.005
    limit=np.tan(np.deg2rad(25));free=~fixed[ix]
    for iteration in range(3000):
        hx=(gx*h[ix]).sum(axis=1);hz=(gz*h[ix]).sum(axis=1);norm=np.hypot(hx,hz)
        bad=norm>limit+1e-6
        if not bad.any():break
        gradient=(gx[bad]*hx[bad,None]+gz[bad]*hz[bad,None])/norm[bad,None]*free[bad]
        denom=(gradient*gradient).sum(axis=1)
        movable=denom>1e-15
        correction=-(norm[bad][movable]-limit)[:,None]*gradient[movable]/denom[movable,None]
        delta=np.zeros(len(q));count=np.zeros(len(q));affected=ix[bad][movable]
        np.add.at(delta,affected,correction);np.add.at(count,affected,free[bad][movable])
        h+=.9*delta/np.maximum(1,count)
    final_gradient=np.hypot((gx*h[ix]).sum(axis=1),(gz*h[ix]).sum(axis=1))
    if not np.isfinite(h).all() or (len(final_gradient) and final_gradient.max()>np.tan(np.deg2rad(26))):
        raise ValueError(f"Access mesh grade did not converge safely: {road['id']}")
    vertices[:,1]=h[inverse]
    return vertices,dict(maxAdjustmentMeters=float(np.max(np.abs(h-initial))*100),iterations=iteration,maxSlopeDegrees=float(np.rad2deg(np.arctan(np.max(norm)))) if len(norm) else 0,method='Projected actual triangle gradients, fixed shared endpoint planes',estimated=True)


def build_connections(config, roads, bridges, sampler):
    by_id = {r['id']: r for r in roads}
    bridge_by_id = {b['id']: b for b in bridges}
    selected = {id for c in config['connections'] for s in c['sides'] for id in s['roadIds']}
    nodes = {}
    for id in sorted(selected):
        r = by_id[id]
        for end in (0, -1):
            node = r['nodes'][end]
            nodes.setdefault(node, {'position': r['coordinates'][end], 'roads': set()})['roads'].add(id)
    for c in config['connections']:
        b = bridge_by_id['bridge-' + c['bridgeId']]
        for side in c['sides']:
            node = side['node']
            if node not in nodes:
                continue
            nodes[node]['major'] = b
            nodes[node]['roads'].update(side['roadIds'][:1])
    patches = []
    for node, item in nodes.items():
        q = np.array(item['position']); links = [by_id[id] for id in sorted(item['roads'])]
        if not any(r['bridge'] for r in links):
            continue
        major = item.get('major')
        if major:
            v = np.asarray(major['xyz'])[np.asarray(major['indices'])]
            a = v[:, 0, [0, 2]]; u = v[:, 1, [0, 2]]-a; w = v[:, 2, [0, 2]]-a
            den = u[:, 0]*w[:, 1]-u[:, 1]*w[:, 0]
            safe = np.where(np.abs(den)>1e-15, den, 1)
            d = q-a; x = (d[:, 0]*w[:, 1]-d[:, 1]*w[:, 0])/safe; y = (u[:, 0]*d[:, 1]-u[:, 1]*d[:, 0])/safe
            choices = np.where((np.abs(den)>1e-15)&(x>=-1e-6)&(y>=-1e-6)&(x+y<=1.000001))[0]
            if not len(choices):
                raise ValueError(f'OSM bridge connection node {node} not on canonical top')
            i = choices[0]; uy=v[i,1,1]-v[i,0,1]; wy=v[i,2,1]-v[i,0,1]
            gradient=[(uy*w[i,1]-wy*u[i,1])/den[i],(u[i,0]*wy-w[i,0]*uy)/den[i]]
            height=float(v[i,0,1]+x[i]*uy+y[i]*wy); kind='major'
        elif any(not r['bridge'] for r in links):
            height=float(sampler.sample(q[None,:]*100)[0]/100+.0008);gradient=[0,0];kind='ground'
        else:
            height=max(min((p for p in r['profile'] if p),key=lambda p:np.linalg.norm(np.array(p)[[0,2]]-q))[1] for r in links)
            gradient=[0,0];kind='connector'
        width=max(r['width'] for r in links)/200
        patch=dict(majorSurfaceId=major['id'] if major else None,node=node,position=q.tolist(),height=height,gradient=gradient,kind=kind,roadIds=sorted(item['roads']),radius=width+.08,estimated=True,source='OSM shared node',reason='Canonical grade joins existing access road and bridge; no source alignment changes')
        patches.append(patch)
    def height_for(f, q, base):
        # Endpoint grades are continuous before applying the local shared plane.
        relevant=[p for p in patches if f['id'] in p['roadIds']]
        if not relevant:return base
        r=by_id[f['id']];line=LineString([p[::2] for p in r['profile'] if p]);length=line.length
        station=np.array([line.project(Point(v)) for v in q]);correction=np.zeros(len(q))
        for end in (0,-1):
            source=np.array(r['profile'][end]);p=next((p for p in relevant if np.linalg.norm(np.array(p['position'])-source[[0,2]])<1e-5),None)
            if p:
                weight=1-station/length if end==0 else station/length
                correction+=(p['height']-source[1])*weight
        result=base+correction
        for p in relevant:
            delta=q-np.array(p['position']);distance=np.abs(station-line.project(Point(p['position'])))
            blend=max(.05,min(1.5,length/2-p['radius']));t=np.clip((distance-p['radius'])/blend,0,1);weight=1-t*t*(3-2*t)
            target=sampler.sample(q*100)/100+.0008 if p['kind']=='ground' else p['height']+delta@p['gradient']
            result=result*(1-weight)+target*weight
        return result
    junctions=[]
    for p in patches:
        q=np.array(p['position']);radius=min(by_id[id]['width'] for id in p['roadIds'])/200;arms=[q+np.array([np.cos(a),np.sin(a)])*radius for a in np.linspace(0,2*np.pi,16,endpoint=False)]
        for id in p['roadIds']:
            r=by_id[id];j=r['nodes'].index(p['node']);w=r['width']/200
            for k in (j-1,j+1):
                if not 0<=k<len(r['coordinates']):continue
                d=np.array(r['coordinates'][k])-q;length=np.linalg.norm(d)
                if length<1e-7:continue
                d/=length;n=np.array([-d[1],d[0]]);center=q+d*min(length,p['radius'])
                arms.extend([center+n*w,center-n*w])
        if len(arms)>=3:
            poly=shapely.MultiPoint(arms).convex_hull
            if poly.geom_type=='Polygon':junctions.append((p,poly))
    return selected,patches,junctions,height_for
