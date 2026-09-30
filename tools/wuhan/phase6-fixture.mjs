import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import * as T from 'three';
import {decode} from '../../src/atlas/render/geography.js';
import {createTerrainSurface} from '../../src/atlas/adapters/terrain-surface.js';
import {createProjection} from '../../src/atlas/geo/projection.js';
import {createRoadSurfaces} from '../../src/atlas/engine/road-surfaces.js';
import {createBridge} from '../../src/atlas/render/bridges.js';
import {WuhanRideSurfaceAdapter} from '../../src/atlas/ride/ride-collision.js';
export const json=async name=>JSON.parse(await readFile('city-data/wuhan/generated/'+name,'utf8'));
export async function fixture(){
 const manifest=await json('manifest.json'),pack={manifest,buffers:{},loadJSON:json,async loadAsset(name){const b=gunzipSync(await readFile('city-data/wuhan/generated/'+name));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}};
 const terrain=new T.Mesh(decode(await pack.loadAsset('terrain.bin'),manifest.terrain),new T.MeshBasicMaterial());terrain.geometry.computeBoundingBox();terrain.updateMatrixWorld();
 const projection=createProjection(manifest.projection),surface=createTerrainSurface(terrain,await json('water.json'),projection,manifest.bounds.context);surface.enableFastSampling();
 const canonical=createRoadSurfaces(pack,surface,[0,1,2,3].map(()=>new T.MeshBasicMaterial()));await canonical.ready;
 const urban={canonical,bridges:new T.Group()};const bridges=await json('bridges.json');
 for(const b of bridges){const c=canonical.index.bridges.find(c=>c.id==='bridge-'+b.id);urban.bridges.add(createBridge({...b,profile:c.profile,foundationProfile:c.foundationProfile,accessProfiles:c.accessProfiles,canonicalSurface:true},surface));}
 const adapter=new WuhanRideSurfaceAdapter({pack,surface,urban,places:{readyPromise:Promise.resolve(),definitions:await json('landmarks.json')},dynamics:{rideQuery:()=>({blocked:false})}});
 return {pack,surface,urban,adapter,bridges,projection};
}
export async function firstBridgeRoute(){
 const m=await json('manifest.json'),index=await json(m.urban.roads),roads=(await Promise.all(index.chunks.map(c=>json(c.file)))).flat();
 const west=roads.find(r=>r.id==='osm-way-50538708'),east=roads.find(r=>r.id==='osm-way-105570781'),defs=await json(m.urban.surfaces),bridge=defs.bridges.find(b=>b.id==='bridge-yangtze-first');
 const join=bridge.profile.findIndex(p=>Math.hypot(p[0]-east.coordinates[0][0],p[2]-east.coordinates[0][1])<.00001);
 if(join<0)throw new Error('Real eastern shared OSM node missing');
 return {bridgeProfile:bridge.profile,joinIndex:join,roadIds:[west.id,...bridge.roadIds,east.id],path:[...west.profile.slice(1,-1),...bridge.profile.slice(0,join),...east.profile],sourceJoin:1215729830};
}
