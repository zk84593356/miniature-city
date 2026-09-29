"""Reproduce the old independent rectangular-strip joins from immutable profiles.

This is a geometry-construction baseline, not a claim to count every unique hole
in the former city. The final audit separately reads the published float32 tops.
"""
import collections
import numpy as np
import shapely
from shapely.geometry import LineString
from phase2_common import ROOT, OUT, read, write

m=read(OUT/'manifest.json');counts=collections.Counter();examples=[]
roads=[r for c in read(OUT/m['urban']['roads'])['chunks'] for r in read(OUT/c['file'])]
for r in roads:
 if not r['rendered'] or r['bridge'] or r['tunnel'] or r['access']=='no' or r['width']<2 or r['roadClass'] not in {'primary','secondary','tertiary','residential','unclassified','service','cycleway'}:continue
 if not r['profile'] or not all(r['profile']) or len(r['profile'])<3:continue
 p=np.array(r['profile'])[:,[0,2]];segments=np.diff(p,axis=0);length=np.linalg.norm(segments,axis=1)
 if np.any(length<1e-7):continue
 unit=segments/length[:,None];normal=np.column_stack([-unit[:,1],unit[:,0]])*r['width']/200
 rectangles=shapely.polygons(np.stack([p[:-1]+normal,p[1:]+normal,p[1:]-normal,p[:-1]-normal],axis=1));tree=shapely.STRtree(rectangles)
 heading=unit[:-1]+unit[1:];norm=np.linalg.norm(heading,axis=1);valid=norm>1e-7
 heading=heading[valid]/norm[valid,None];center=p[1:-1][valid];side=np.column_stack([-heading[:,1],heading[:,0]])
 q=np.concatenate([center,center+side*.002,center-side*.002,*[center+heading*a+side*b for a in [-.0058,.0058] for b in [-.0044,.0044]]])
 outline=LineString(p).buffer(r['width']/200,join_style='mitre',mitre_limit=2.5,cap_style='flat');q=q[shapely.intersects(outline,shapely.points(q))]
 hits=tree.query(shapely.points(q),predicate='intersects');covered=np.zeros(len(q),bool);covered[hits[0]]=True;missing=np.flatnonzero(~covered)
 if len(missing):
  nearest,distances=tree.query_nearest(shapely.points(q[missing]),return_distance=True,all_matches=False)
  # Do not count exact-boundary floating-point disagreement as a visible hole.
  clearance=np.zeros(len(missing));clearance[nearest[0]]=distances
  counts['sub5mmBoundarySamples']+=int((clearance<=.00005).sum());missing=missing[clearance>.00005]
 counts['roads']+=1;counts['jointFootprintSamples']+=len(q);counts['missingInLegacyStripConstruction']+=len(missing);counts['roadsWithMissingJointSamples']+=bool(len(missing))
 if len(missing):examples.append(dict(roadId=r['id'],osmId=r['osmId'],missingSamples=len(missing),examplePositions=q[missing[:3]].tolist()))
write(ROOT/'docs/wuhan-phase6-legacy-joints-qa.json',dict(scope=__doc__,counts=dict(counts),findings=examples));print(dict(counts),flush=True)
