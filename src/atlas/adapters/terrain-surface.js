import * as THREE from 'three';
import { waterAt } from '../geo/projection.js';

/** Phase 1 ground contract. Bridges and Ride are deliberately not registered yet. */
export function createTerrainSurface(terrain, waters, projection, bounds) {
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  return {
    sample(x, z) {
      const [lon, lat] = projection.inverse(x, z);
      if (lon < bounds[0] || lon > bounds[2] || lat < bounds[1] || lat > bounds[3]) return null;
      const water = waterAt(x, z, waters);
      if (water) return { kind: 'water', height: water.levelMeters / 100, traversable: false };
      ray.set(new THREE.Vector3(x, 100, z), down);
      const hit = ray.intersectObject(terrain, true)[0];
      return hit ? { kind: 'ground', height: hit.point.y, traversable: true } : null;
    },
  };
}
