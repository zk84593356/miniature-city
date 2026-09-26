export function createProjection(config) {
  const { origin, worldUnitMeters, earthRadiusMeters } = config;
  const degree = Math.PI / 180 * earthRadiusMeters / worldUnitMeters;
  const longitudeScale = degree * Math.cos(origin[1] * Math.PI / 180);
  return {
    forward: ([lon, lat]) => [(lon - origin[0]) * longitudeScale, (origin[1] - lat) * degree],
    inverse: (x, z) => [origin[0] + x / longitudeScale, origin[1] - z / degree],
  };
}

export function insideRing(x, z, ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[j];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) result = !result;
  }
  return result;
}

export function waterAt(x, z, waters) {
  return waters.find(({ rings }) => insideRing(x, z, rings[0]) && !rings.slice(1).some(r => insideRing(x, z, r))) ?? null;
}
