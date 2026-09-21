// All expensive indexing happens once, on first entry. Queries visit one cell.
class Grid {
  constructor(size) { this.size = size; this.cells = new Map(); }
  key(x, z) { return `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`; }
  add(item, x0, z0, x1, z1) {
    for (let x = Math.floor(x0 / this.size); x <= Math.floor(x1 / this.size); x++)
      for (let z = Math.floor(z0 / this.size); z <= Math.floor(z1 / this.size); z++) {
        const key = `${x},${z}`;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(item);
      }
  }
  near(x, z) { return this.cells.get(this.key(x, z)) || []; }
}
export class RideCollision {
  constructor({ ground, geo, placement, buildings, landmarks, project, excluded }) {
    this.geo = geo;
    this.terrain = new Grid(4);
    this.obstacles = new Grid(4);
    this.radius = 0.024;
    for (const mesh of ground) {
      const p = mesh.geometry.attributes.position, indices = mesh.geometry.index;
      for (let i = 0, count = indices ? indices.count : p.count; i < count; i += 3) {
        const a = indices ? indices.getX(i) : i, b = indices ? indices.getX(i + 1) : i + 1, c = indices ? indices.getX(i + 2) : i + 2;
        const ax = p.getX(a), az = p.getZ(a), bx = p.getX(b), bz = p.getZ(b), cx = p.getX(c), cz = p.getZ(c);
        const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(den) < 1e-12) continue;
        const triangle = { ax, az, bx, bz, cx, cz, ay: p.getY(a), by: p.getY(b), cy: p.getY(c), den, road: mesh.name !== 'city-terrain' };
        this.terrain.add(triangle, Math.min(ax, bx, cx), Math.min(az, bz, cz), Math.max(ax, bx, cx), Math.max(az, bz, cz));
      }
    }
    const add = (x0, z0, x1, z1, bottom, top) => this.obstacles.add({ x0, z0, x1, z1, bottom, top }, x0 - this.radius, z0 - this.radius, x1 + this.radius, z1 + this.radius);
    for (const [, chunk] of placement.chunks) for (const b of chunk) {
      const c = Math.abs(Math.cos(b.angle)), s = Math.abs(Math.sin(b.angle));
      const w = (c * b.w + s * b.d) / 2, d = (s * b.w + c * b.d) / 2;
      add(b.x - w, b.z - d, b.x + w, b.z + d, b.y, b.y + b.h);
    }
    for (const b of buildings) {
      if (b.height <= 0 || b.height > 240 || b.points.length < 3) continue;
      const x = b.points.reduce((v, p) => v + p[0], 0) / b.points.length, z = b.points.reduce((v, p) => v + p[1], 0) / b.points.length;
      if (excluded(x, z)) continue;
      const xs = b.points.map(p => p[0]), zs = b.points.map(p => p[1]), y = geo.height(x, z);
      add(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), y, y + (b.height ?? 20) * 0.01);
    }
    for (const b of landmarks) if (b.height && b.model !== 'mountain') {
      const [x, z] = project(b.lon, b.lat), r = Math.min(b.radius, 2), y = geo.height(x, z);
      add(x - r, z - r, x + r, z + r, y, y + b.height * 0.01);
    }
  }
  height(x, z, reference = Infinity) {
    let height = -Infinity;
    for (const t of this.terrain.near(x, z)) {
      const a = ((t.bz - t.cz) * (x - t.cx) + (t.cx - t.bx) * (z - t.cz)) / t.den;
      const b = ((t.cz - t.az) * (x - t.cx) + (t.ax - t.cx) * (z - t.cz)) / t.den;
      if (a < -1e-7 || b < -1e-7 || a + b > 1.0000001) continue;
      const y = a * t.ay + b * t.by + (1 - a - b) * t.cy;
      // Do not teleport from a road underneath a bridge onto its deck.
      if (y <= reference + 0.065) height = Math.max(height, y);
    }
    return height;
  }
  blocked(x, z, y) {
    for (const b of this.obstacles.near(x, z)) {
      if (b.top <= y + 0.008 || b.bottom > y + 0.075) continue;
      const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
      if (dx * dx + dz * dz < this.radius * this.radius) return true;
    }
    return false;
  }
  valid(x, z, y) { return Number.isFinite(y) && this.geo.isCity(x, z) && this.geo.isLand(x, z) && !this.blocked(x, z, y); }
  spawn(target, roads) {
    let best = null, distance = Infinity;
    // Road vertices and midpoints keep initial placement off buildings and water.
    for (const road of roads) {
      if (road.tunnel || road.type === 'motorway' || road.type === 'trunk') continue;
      const points = road.profile || road.points;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], zi = road.profile ? 2 : 1;
        const x = (a[0] + b[0]) / 2, z = (a[zi] + b[zi]) / 2, d = Math.hypot(x - target.x, z - target.z);
        if (d >= distance) continue;
        const y = this.height(x, z);
        if (!this.valid(x, z, y)) continue;
        const heading = Math.atan2(b[0] - a[0], b[zi] - a[zi]);
        if (!this.valid(x + Math.sin(heading) * .1, z + Math.cos(heading) * .1, y)) continue;
        distance = d; best = { x, z, y, heading, speed: 0, steering: 0 };
      }
    }
    return best;
  }
}
