import { SCALE } from './ride-motion.js';

export class RideAvatar {
  constructor(T) {
    this.root = new T.Group(); this.root.name = 'ride-avatar';
    this.root.scale.setScalar(SCALE);
    this.body = new T.Group(); this.root.add(this.body);
    this.phase = 0;
    const material = color => new T.Material({ color, roughness: .86 });
    const frame = material('#526c67'), rubber = material('#303b3b'), metal = material('#b5b9aa');
    const shirt = material('#b8a78a'), trousers = material('#526273'), skin = material('#d2b89c');
    const cylinder = new T.Cylinder(.025, .025, 1, 6);
    this.up = new T.Vector3(0, 1, 0); this.delta = new T.Vector3();
    this.a = new T.Vector3(); this.b = new T.Vector3();
    this.link = (parent, from, to, mat, thickness = 1) => {
      const mesh = new T.Mesh(cylinder, mat); parent.add(mesh);
      this.segment(mesh, this.a.fromArray(from), this.b.fromArray(to), thickness); return mesh;
    };
    const rear = [0, .35, -.58], front = [0, .35, .58], crank = [0, .37, -.05], saddle = [0, .95, -.24], stem = [0, .92, .43];
    for (const [a, b] of [[rear, crank], [rear, saddle], [saddle, crank], [saddle, stem], [crank, stem]]) this.link(this.body, a, b, frame);
    const box = (parent, size, position, mat) => {
      const m = new T.Mesh(new T.Box(...size), mat); m.position.fromArray(position); parent.add(m); return m;
    };
    box(this.body, [.24, .07, .32], [0, .98, -.24], rubber);
    this.fork = new T.Group(); this.fork.position.set(0, .35, .58); this.body.add(this.fork);
    this.link(this.fork, [0, 0, 0], [0, .73, -.12], frame);
    this.link(this.fork, [-.3, .73, -.12], [.3, .73, -.12], rubber, 1.3);
    const wheel = (parent, z) => {
      const group = new T.Group(); group.position.set(0, parent === this.fork ? 0 : .35, z); parent.add(group);
      const tire = new T.Mesh(new T.Torus(.32, .035, 6, 20), rubber); tire.rotation.y = Math.PI / 2; group.add(tire);
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        this.link(group, [0, 0, 0], [0, Math.sin(a) * .31, Math.cos(a) * .31], metal, .28);
      }
      return group;
    };
    this.wheels = [wheel(this.body, -.58), wheel(this.fork, 0)];
    this.rider = new T.Group(); this.body.add(this.rider);
    this.link(this.rider, [0, 1.04, -.22], [0, 1.52, .03], shirt, 5);
    const head = new T.Mesh(new T.Sphere(.135, 8, 6), skin); head.position.set(0, 1.67, .10); this.rider.add(head);
    const helmet = new T.Mesh(new T.Sphere(.143, 8, 6), frame); helmet.scale.y = .65; helmet.position.set(0, 1.74, .10); this.rider.add(helmet);
    for (const side of [-1, 1]) {
      this.link(this.rider, [side * .13, 1.48, .03], [side * .22, 1.20, .22], shirt, 2);
      this.link(this.rider, [side * .22, 1.20, .22], [side * .28, 1.08, .46], skin, 1.5);
    }
    this.legs = [-1, 1].map(side => ({ side,
      upper: this.link(this.body, [0, 0, 0], [0, 1, 0], trousers, 2.8),
      lower: this.link(this.body, [0, 0, 0], [0, 1, 0], trousers, 2.2),
      shoe: box(this.body, [.11, .07, .21], [0, 0, 0], rubber)
    }));
    this.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.animate(0, 0, 0, false);
  }
  segment(mesh, a, b, thickness) {
    this.delta.subVectors(b, a); mesh.position.copy(a).addScaledVector(this.delta, .5);
    mesh.scale.set(thickness, this.delta.length(), thickness);
    mesh.quaternion.setFromUnitVectors(this.up, this.delta.normalize());
  }
  animate(dt, speed, steering, brake) {
    const travel = speed * dt;
    for (const wheel of this.wheels) wheel.rotation.x += travel / .35;
    this.fork.rotation.y = steering;
    this.phase += travel / .65;
    this.rider.rotation.x = brake && Math.abs(speed) > .1 ? .06 : 0;
    for (const leg of this.legs) {
      const phase = this.phase + (leg.side < 0 ? Math.PI : 0), x = leg.side * .14;
      const py = .4 + Math.cos(phase) * .16, pz = -.05 + Math.sin(phase) * .16;
      this.a.set(x, 1.01, -.22); this.b.set(x, .75 + Math.cos(phase) * .05, .18);
      this.segment(leg.upper, this.a, this.b, 2.8);
      this.a.copy(this.b); this.b.set(x, py, pz); this.segment(leg.lower, this.a, this.b, 2.2);
      leg.shoe.position.copy(this.b);
    }
  }
  dispose() {
    this.root.removeFromParent();
    const geometry = new Set(), materials = new Set();
    this.root.traverse(o => { if (o.isMesh) { geometry.add(o.geometry); materials.add(o.material); } });
    geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  }
}
