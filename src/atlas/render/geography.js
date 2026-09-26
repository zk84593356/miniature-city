import * as THREE from 'three';

function decode(buffer, spec) {
  if (buffer.byteLength !== spec.vertices * 12 + spec.triangles * 12) throw new Error('地形网格长度与清单不匹配');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buffer, 0, spec.vertices * 3), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, spec.vertices * 12, spec.triangles * 3), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createGeography(pack) {
  const terrainGeometry = decode(pack.buffers['terrain.bin'], pack.manifest.terrain);
  const waterGeometry = decode(pack.buffers['water.bin'], pack.manifest.water);
  const colors = new Float32Array(terrainGeometry.attributes.position.count * 3);
  const low = new THREE.Color('#dddcc7'), middle = new THREE.Color('#b6c7a2'), high = new THREE.Color('#71956c');
  const color = new THREE.Color();
  const p = terrainGeometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const meters = p.getY(i) * 100;
    if (meters < 48) color.copy(low).lerp(middle, THREE.MathUtils.smoothstep(meters, 24, 48));
    else color.copy(middle).lerp(high, THREE.MathUtils.smoothstep(meters, 48, 110));
    color.toArray(colors, i * 3);
  }
  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const landMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const waterMaterial = new THREE.MeshStandardMaterial({ color: '#78b5aa', roughness: .48, metalness: .08, side: THREE.DoubleSide });
  const terrain = new THREE.Group();
  terrain.name = 'wuhan-ground';
  // Exact shared vertices/normals across chunks; only visibility changes.
  // This avoids drawing the entire 60 km dataset in a hill close-up.
  const chunks = new Map();
  const index = terrainGeometry.index.array;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3;
    const z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
    const key = `${Math.floor(x / 70)},${Math.floor(z / 70)}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(a, b, c);
  }
  for (const [key, indices] of chunks) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(terrainGeometry.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    const bounds = new THREE.Box3();
    const point = new THREE.Vector3();
    for (const i of indices) bounds.expandByPoint(point.fromBufferAttribute(p, i));
    geometry.boundingBox = bounds;
    geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geometry, landMaterial);
    mesh.name = `ground:${key}`;
    terrain.add(mesh);
  }
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.name = 'wuhan-water';
  const group = new THREE.Group();
  group.add(terrain, water);
  return { group, terrain, water, landMaterial, waterMaterial,
    dispose() { terrain.traverse(object => object.geometry?.dispose()); terrainGeometry.dispose(); waterGeometry.dispose(); landMaterial.dispose(); waterMaterial.dispose(); }
  };
}
