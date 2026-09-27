"""Phase 4: derive demonstration routes without modifying any Phase 3 asset.

Run export-dynamic-obstacles.mjs first. All distances in world units (100 m).
Raw OSM is the locked Phase 2 download; no network request is made here.
"""
import hashlib, heapq, json, math, random, subprocess
from collections import Counter, defaultdict
import numpy as np
import shapely
from shapely.geometry import Point, Polygon, LineString, box, shape
from shapely.ops import substring
from phase2_common import ROOT, OUT, RAW, read, write, register, finish, decode

BASE='aadd2ea6db91a6c5df5a335c2a8961c542327573'
m=json.loads(subprocess.check_output(['git','show',BASE+':city-data/wuhan/generated/manifest.json'],cwd=ROOT))
for name,info in m['dataFiles'].items():
    assert hashlib.sha256((OUT/name).read_bytes()).hexdigest()==info['sha256'],name
lock=read(ROOT/'src/cities/wuhan/urban-source-lock.json')
raw=read(RAW/'urban-osm.json')
assert hashlib.sha256((RAW/'urban-osm.json').read_bytes()).hexdigest()==lock['sha256']
tags={e['id']:e.get('tags',{}) for e in raw['elements'] if e['type']=='way'}
waters=read(OUT/'water.json'); bridges=read(OUT/'bridges.json'); bridge_map={b['id']:b for b in bridges}
water=shapely.union_all([Polygon(w['rings'][0],w['rings'][1:]) for w in waters]);shapely.prepare(water)
river=next(w for w in waters if w['kind']=='river'); river_poly=Polygon(river['rings'][0],river['rings'][1:])
buildings=[b for c in m['urban']['buildingChunks'] for b in read(OUT/c['file'])]
building_polys=[Polygon(b['rings'][0],b['rings'][1:]) for b in buildings]
building_polys += [shape(l['replacementFootprint']['geometry']) for l in read(OUT/'landmarks.json')]
building_tree=shapely.STRtree(building_polys)
roads=[r for c in read(OUT/'roads.json')['chunks'] for r in read(OUT/c['file'])]
allowed={'motorway','trunk','primary','secondary','tertiary','residential','unclassified','service','living_street'}
allowed |= {c+'_link' for c in ['motorway','trunk','primary','secondary','tertiary']}
rejected=Counter();selected=[]
for r in roads:
    t=tags.get(r['osmId'],{});reason=None
    access=next((t[k] for k in ['motorcar','motor_vehicle','vehicle','access'] if k in t),'yes')
    if r['roadClass'] not in allowed:reason='non-motor-road'
    elif access not in ['yes','permissive','designated']:reason='restricted-access'
    elif any('conditional' in k or ':lanes' in k or k in ['turn:lanes','restriction'] for k in t):reason='conditional-or-lane-restriction'
    elif t.get('service') in ['parking_aisle','driveway','emergency_access','drive-through']:reason='limited-service'
    elif r['width']<4.5:reason='narrow-road'
    elif r.get('deckLevel')=='lower':reason='lower-deck-excluded'
    elif t.get('oneway:motor_vehicle',t.get('oneway',r['oneway'])) not in ['yes','no','-1','1','true','false','0','']:reason='ambiguous-direction'
    elif t.get('lanes')=='1' and t.get('oneway',r['oneway']) not in ['yes','1','true','-1']:reason='single-lane-two-way'
    elif not r['tunnel'] and (not r['profile'] or any(p is None for p in r['profile'])):reason='incomplete-profile'
    elif not any(abs(x)<165 and abs(z)<155 for x,z in r['coordinates']) and not r.get('bridgeProfile'):reason='outside-demo-core'
    if reason:rejected[reason]+=1;continue
    selected.append(r)
shared=Counter(n for r in selected for n in set(r['nodes']))
lanes=[];lookup={};junctions=defaultdict(lambda:dict(incoming=[],outgoing=[]));safety=Counter()

def distance(a,b):return math.dist(a,b)
def count_value(s,default):
    try:return max(1,min(8,int(s)))
    except (ValueError,TypeError):return default

def lane_safe(path,r):
    footprint=LineString([(p[0],p[2]) for p in path]).buffer(.013,cap_style=2)
    if not r['tunnel'] and not r['bridge'] and not r.get('bridgeProfile') and shapely.intersects(water,footprint):return 'water-conflict'
    if not r['tunnel']:
        for i in building_tree.query(footprint,predicate='intersects'):
            if i>=len(buildings) or min(p[1] for p in path)<(buildings[i]['foundationMeters']+buildings[i]['height'])/100+.02:return 'building-conflict'
    return None

for r in selected:
    t=tags.get(r['osmId'],{});original=np.array(r['coordinates'],float)
    source_line=LineString(original); node_s=np.r_[0,np.cumsum(np.linalg.norm(np.diff(original,axis=0),axis=1))]
    if node_s[-1]<.1:continue
    direction=t.get('oneway:motor_vehicle',t.get('oneway','yes' if t.get('junction')=='roundabout' or r['roadClass']=='motorway' else r['oneway']))
    if not direction:direction='yes' if t.get('junction')=='roundabout' or r['roadClass']=='motorway' else 'no'
    directions=[-1] if direction=='-1' else [1] if direction in ['yes','1','true'] else [1,-1]
    total=count_value(t.get('lanes'),2 if len(directions)==2 else (3 if r['roadClass'] in ['motorway','trunk'] else 2))
    splits=[i for i,n in enumerate(r['nodes']) if i in [0,len(r['nodes'])-1] or shared[n]>1]
    if r['tunnel']:
        # Hidden logical coordinates; endpoint heights are joined only to valid portals below.
        profile=np.array([[x,0,z] for x,z in original]);profile_s=node_s
    else:
        profile=np.array(r['profile']); profile_s=np.r_[0,np.cumsum(np.linalg.norm(np.diff(profile[:,[0,2]],axis=0),axis=1))]
        profile_s*=node_s[-1]/max(profile_s[-1],1e-9)
    for a,b in zip(splits,splits[1:]):
        length=node_s[b]-node_s[a]
        if length<.08:continue
        samples=np.unique(np.r_[node_s[a],profile_s[(profile_s>node_s[a])&(profile_s<node_s[b])],node_s[b]])
        path=np.column_stack([np.interp(samples,profile_s,profile[:,i]) for i in range(3)])
        bridge=bridge_map.get(r.get('bridgeProfile'))
        if bridge:
            bp=np.array(bridge['profile']);bl=LineString(bp[:,[0,2]]);bs=np.r_[0,np.cumsum(np.linalg.norm(np.diff(bp[:,[0,2]],axis=0),axis=1))]
            at=np.array([bl.project(Point(p[0],p[2])) for p in path]);path=np.column_stack([np.interp(at,bs,bp[:,i]) for i in range(3)])
        path=path[np.r_[True,np.linalg.norm(np.diff(path[:,[0,2]],axis=0),axis=1)>1e-5]]
        if len(path)<2:continue
        for d in directions:
            p=path.copy() if d==1 else path[::-1].copy();delta=np.gradient(p[:,[0,2]],axis=0);norm=np.linalg.norm(delta,axis=1);norm[norm<1e-8]=1
            directional=count_value(t.get('lanes:forward' if d==1 else 'lanes:backward'),max(1,total//len(directions)))
            # One representative lane per direction. Full tagged counts remain metadata;
            # no invented lane changes or detailed intersection lane assignment.
            offset=min(.0175,r['width']/400) if len(directions)==2 or bridge or directional%2==0 else 0
            p[:,0]-=delta[:,1]/norm*offset;p[:,2]+=delta[:,0]/norm*offset
            p=np.round(p,6);reason=lane_safe(p.tolist(),r)
            if reason:safety[reason]+=1;continue
            start=r['nodes'][a if d==1 else b];end=r['nodes'][b if d==1 else a]
            lane=dict(id=len(lanes),road=r['osmId'],roadClass=r['roadClass'],fromNode=start,toNode=end,direction=d,oneway=direction,layer=r['layer'],bridge=r['bridge'],majorBridge=r.get('bridgeProfile'),surfaceId=r.get('surfaceId'),tunnel=r['tunnel'],access=next((t[k] for k in ['motorcar','motor_vehicle','vehicle','access'] if k in t),'yes'),laneCount=total,directionalLaneCount=directional,estimatedLaneCount='lanes' not in t,simulatedLaneIndex=0,representativeLane=True,path=p.tolist(),next=[],speed=round((55 if 'motorway' in r['roadClass'] or r['roadClass']=='trunk' else 38 if r['roadClass'] in ['primary','secondary'] else 25)/360,5),speedEstimated=True)
            lane['length']=round(sum(distance(x,y) for x,y in zip(p,p[1:])),6)
            lane['fromIndex']=a if d==1 else b;lane['toIndex']=b if d==1 else a
            lane['allowedVehicleTypes']=['car','suv']+(['bus'] if r['width']>=5.4 and t.get('bus',t.get('psv','yes')) not in ['no','private'] else [])+(['truck'] if r['width']>=5.4 and t.get('hgv','yes') not in ['no','private'] else [])
            if lane['length']<.08:continue
            lanes.append(lane);junctions[end]['incoming'].append(lane['id']);junctions[start]['outgoing'].append(lane['id'])
print('lanes',len(lanes),'rejections',dict(rejected),dict(safety),flush=True)
connections=[]
for node,j in junctions.items():
    for ai in j['incoming']:
        a=lanes[ai]
        for bi in j['outgoing']:
            b=lanes[bi]
            if a['road']==b['road'] and a['direction']!=b['direction']:continue
            pa=np.array(a['path']);pb=np.array(b['path']);gap=distance(pa[-1,[0,2]],pb[0,[0,2]])
            if gap>.14:continue
            if a['tunnel'] or b['tunnel']:
                if a['tunnel'] and b['tunnel'] and a['layer']!=b['layer']:continue
            elif abs(pa[-1,1]-pb[0,1])>.012:continue
            # At a bridge/tunnel portal, a real node with coincident height may change
            # layer. Interior cross-layer crossings are never turn opportunities.
            if a['layer']!=b['layer']:
                ra=next((r for r in selected if r['osmId']==a['road']),None);rb=next((r for r in selected if r['osmId']==b['road']),None)
                if node not in [ra['nodes'][0],ra['nodes'][-1]] or node not in [rb['nodes'][0],rb['nodes'][-1]]:continue
            va=pa[-1,[0,2]]-pa[-2,[0,2]];vb=pb[1,[0,2]]-pb[0,[0,2]]
            cos=float(va@vb/max(1e-9,np.linalg.norm(va)*np.linalg.norm(vb)))
            if cos<.5:continue # conservative through movements, no inferred prohibited turns
            # Connect only the lane-end gap at the shared node. Reserve the junction
            # until the complete vehicle has cleared both ends.
            connector=[pa[-1].tolist(),pb[0].tolist()]
            if not a['tunnel'] and not b['tunnel']:
                dummy=dict(tunnel=False,bridge=a['bridge'] or b['bridge'],bridgeProfile=a['majorBridge'] or b['majorBridge'])
                if lane_safe(connector,dummy):continue
            ci=len(connections);connections.append(dict(id=ci,fromLane=ai,toLane=bi,node=node,path=connector,length=round(distance(*connector),6),hidden=a['tunnel'] or b['tunnel']))
            a['next'].append(ci)

# Cached itineraries; no route search happens in a render or simulation tick.
rng=random.Random(4004);routes=[];starts=list(range(len(lanes)));rng.shuffle(starts)
priority=[l['id'] for l in lanes if l['majorBridge']]+starts
used=set()
for start in priority:
    if start in used:continue
    chain=[start];links=[];length=lanes[start]['length']
    for _ in range(75):
        choices=[i for i in lanes[chain[-1]]['next'] if connections[i]['toLane'] not in chain]
        if not choices:break
        c=connections[rng.choice(choices)];links.append(c['id']);chain.append(c['toLane']);length+=lanes[chain[-1]]['length']+c['length']
        if length>45:break
    if length<2:continue
    routes.append(dict(lanes=chain,connections=links,length=round(length,6)));used.update(chain)
    if len(routes)>=900:break
used_lanes=set(i for r in routes for i in r['lanes'])
bridge_coverage={b['id']:sum(l['id'] in used_lanes and l['majorBridge']==b['id'] for l in lanes) for b in bridges}
assert all(bridge_coverage.values()),bridge_coverage
candidate_counts=dict(lanes=len(lanes),connections=len(connections),drivableRoads=len({l['road'] for l in lanes}))
# Publish only the cached-route subgraph. Do not ship tens of thousands of unused
# profiles to the browser; the candidate counts remain in the build audit.
used_connections=set(i for r in routes for i in r['connections'])
lane_ids={old:new for new,old in enumerate(sorted(used_lanes))};connection_ids={old:new for new,old in enumerate(sorted(used_connections))}
lanes=[lanes[i] for i in sorted(used_lanes)];connections=[connections[i] for i in sorted(used_connections)]
for l in lanes:l['id']=lane_ids[l['id']];l['next']=[connection_ids[i] for i in l['next'] if i in used_connections]
for c in connections:c['id']=connection_ids[c['id']];c['fromLane']=lane_ids[c['fromLane']];c['toLane']=lane_ids[c['toLane']]
for r in routes:r['lanes']=[lane_ids[i] for i in r['lanes']];r['connections']=[connection_ids[i] for i in r['connections']]
junctions=defaultdict(lambda:dict(incoming=[],outgoing=[]))
for l in lanes:junctions[l['fromNode']]['outgoing'].append(l['id']);junctions[l['toNode']]['incoming'].append(l['id'])
network=dict(schema='wuhan-traffic-network-v1',source='OpenStreetMap locked Phase 2 topology',estimated=True,drivingSide='right',representativeLanes=True,coverage='conservative through-movement demonstration subnetwork; not a navigation graph',baseline=BASE,lanes=lanes,connections=connections,junctions=[dict(node=node,**j) for node,j in junctions.items() if j['incoming'] and j['outgoing']],routes=routes,counts=dict(sourceRoads=len(roads),eligibleRoads=len(selected),drivableRoads=len({l['road'] for l in lanes}),lanes=len(lanes),junctions=sum(bool(j['incoming'] and j['outgoing']) for j in junctions.values()),connections=len(connections),cachedRoutes=len(routes),routeLanes=len(used_lanes),bridgeCoverage=bridge_coverage,rejectedRoads=dict(rejected),rejectedLanes=dict(safety)))
write(OUT/'traffic-network.json',network)
network['counts']['candidateGraph']=candidate_counts
write(OUT/'traffic-network.json',network)

# Vessel channels: grid shortest paths inside an eroded river polygon, with the
# actual Phase 2 pier footprints removed. Authored endpoints, not AIS/navigation.
obstacles=read(ROOT/'.tools/phase4/bridge-obstacles.json');obstacle_polys=[]
for b in obstacles:
    for o in b['obstacles']:
        if o['kind']!='pier':continue
        x,_,z=o['center'];w,_,d=o['size'];p=box(-w/2,-d/2,w/2,d/2)
        from shapely.affinity import rotate,translate
        obstacle_polys.append(translate(rotate(p,-math.degrees(o.get('rotationY',0))),xoff=x,yoff=z))
safe=river_poly.buffer(-.34).difference(shapely.union_all(obstacle_polys).buffer(.40));shapely.prepare(safe)
step=.1;extent=(-105,-125,65,125);xs=np.arange(extent[0],extent[2],step);zs=np.arange(extent[1],extent[3],step)
xx,zz=np.meshgrid(xs,zs);grid=shapely.contains_xy(safe,xx,zz);valid=np.argwhere(grid)
def nearest(p):
    q=np.array([(p[1]-zs[0])/step,(p[0]-xs[0])/step]);return tuple(valid[np.argmin(np.sum((valid-q)**2,axis=1))])
def astar(a,b):
    a=nearest(a);b=nearest(b);queue=[(0,0,a)];cost={a:0};parent={}
    while queue:
        _,g,u=heapq.heappop(queue)
        if u==b:break
        if g>cost[u]:continue
        for di,dj in [(0,1),(0,-1),(1,0),(-1,0),(1,1),(-1,-1),(1,-1),(-1,1)]:
            v=(u[0]+di,u[1]+dj)
            if not(0<=v[0]<len(zs) and 0<=v[1]<len(xs)) or not grid[v]:continue
            if di and dj and not(grid[u[0]+di,u[1]] and grid[u[0],u[1]+dj]):continue
            ng=g+math.hypot(di,dj)
            if ng<cost.get(v,float('inf')):cost[v]=ng;parent[v]=u;heapq.heappush(queue,(ng+math.dist(v,b),ng,v))
    assert b in cost,(a,b)
    out=[b]
    while out[-1]!=a:out.append(parent[out[-1]])
    return [(float(xs[j]),float(zs[i])) for i,j in out[::-1]]
degree=math.pi/180*6371008.8/100
def project(lon,lat):return ((lon-114.32)*degree*math.cos(math.radians(30.56)),(30.56-lat)*degree)
specs=[('yangtze-main','长江示意通道',[(114.22,30.46),(114.29,30.56),(114.34,30.64)],['cargo','ferry','small']),('han-main','汉江示意通道',[(114.20,30.58),(114.26,30.567),(114.291,30.567)],['small','ferry']),('yangtze-ferry','江汉关附近示意客船航线',[(114.29,30.58),(114.304,30.578)],['ferry','small'])]
vessel_routes=[]
for id,name,points,types in specs:
    path=[]
    for a,b in zip(points,points[1:]):path+=astar(project(*a),project(*b))[int(bool(path)):]
    smooth=path
    for _ in range(3):
        refined=[smooth[0]]
        for a,b in zip(smooth,smooth[1:]):refined.extend([(a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25),(a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75)])
        refined.append(smooth[-1]);smooth=refined
    line=LineString(path);candidate=LineString(smooth).simplify(.004)
    if river_poly.covers(candidate.buffer(.29)) and not candidate.buffer(.29).intersects(shapely.union_all(obstacle_polys)):line=candidate
    simple=line.simplify(.004)
    if not safe.covers(simple):simple=line
    assert river_poly.covers(simple.buffer(.29)) and not simple.buffer(.29).intersects(shapely.union_all(obstacle_polys)),id
    constraints=[]
    for b in bridges:
        deck=LineString([(p[0],p[2]) for p in b['profile']]);cross=simple.intersection(deck)
        if cross.is_empty:continue
        points=list(cross.geoms) if hasattr(cross,'geoms') else [cross]
        for point in points:
            if point.geom_type!='Point':continue
            bp=np.array(b.get('lowerProfile') or b['profile']);bs=np.r_[0,np.cumsum(np.linalg.norm(np.diff(bp[:,[0,2]],axis=0),axis=1))]
            s=deck.project(point);height=float(np.interp(s,bs,bp[:,1]));ws=river['surface'];water_y=ws['interceptMeters']/100-ws['gradient']*(ws['direction'][0]*point.x+ws['direction'][1]*point.y)
            clearance=(height-water_y)*100-2.4
            assert clearance>8,(id,b['id'],clearance)
            constraints.append(dict(bridge=b['id'],crossing=[point.x,point.y],clearanceMeters=round(clearance,3),maxVesselHeightMeters=5.5,estimated=True,source='Phase 2 lowest deck profile, 2.4 m structural allowance; frozen pier metadata'))
    vessel_routes.append(dict(id=id,name=name,waterBodyId=river['id'],path=[[round(x,6),round(z,6)] for x,z in simple.coords],direction='bidirectional-separated-offset',laneOffsetMeters=6,speedRangeMetersPerSecond=[2,5],vesselTypes=types,source='Authored schematic endpoints; offline water-constrained path through Phase 2 geometry',estimated=True,bridgeConstraints=constraints,dockEndpoints=None,footprintClearanceMeters=29))
write(OUT/'vessel-routes.json',dict(schema='wuhan-vessel-routes-v1',estimated=True,navigationUse=False,routes=vessel_routes,obstacles=obstacles))
xyz,_=decode('water.bin',m['water']);style=shapely.intersects_xy(river_poly,xyz[:,0],xyz[:,2]).astype(int).tolist()
write(OUT/'water-style.json',dict(schema='wuhan-water-style-v1',geometrySha256=m['dataFiles']['water.bin']['sha256'],riverMask=style))
config=dict(schema='wuhan-dynamic-config-v1',simulationHz=20,demonstration=True,traffic='traffic-network.json',vessels='vessel-routes.json',waterStyle='water-style.json',tiers=dict(high=dict(vehicles=1200,near=400,vessels=18,birds=12,wake=True),medium=dict(vehicles=800,near=250,vessels=12,birds=6,wake=True),low=dict(vehicles=400,near=120,vessels=6,birds=0,wake=False)),density=dict(day=.85,sunset=1,night=.45),vesselTypes=dict(small=dict(length=12,width=3,height=2),ferry=dict(length=28,width=7,height=5.5),cargo=dict(length=42,width=9,height=5.5)))
write(OUT/'dynamic-config.json',config)
for name in ['traffic-network.json','vessel-routes.json','water-style.json','dynamic-config.json']:register(m,name,read(OUT/name)['schema'],'Phase 4 estimated simulation derived from frozen Phase 2/3 City Pack',role='dynamic',estimated=True,estimatedFields=['simulation parameters','representative lane/route placement','missing lane counts where flagged','operational speed and visual clearance'])
m['phase']=4;m['dynamics']=dict(config='dynamic-config.json',baseline=BASE,demonstration=True);finish(m)
report=dict(result='PASS',baseline=BASE,protectedAssets=len(m['dataFiles'])-4,traffic=network['counts'],vesselRoutes=len(vessel_routes),bridgeConstraints=[c for r in vessel_routes for c in r['bridgeConstraints']],addedBytes=sum(m['dataFiles'][n]['bytes'] for n in ['traffic-network.json','vessel-routes.json','water-style.json','dynamic-config.json']))
write(ROOT/'docs/wuhan-phase4-data-qa.json',report);print(json.dumps(report),flush=True)
