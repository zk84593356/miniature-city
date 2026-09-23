import { SCALE } from './ride-motion.js';
import { RideAnimation, PosedRideAnimation } from './ride-animation.js';

export class RideAvatar {
  constructor(T, model = null) {
    this.T = T; this.modelStatus = 'procedural'; this.disposed = false;
    this.root = new T.Group(); this.root.name = 'ride-avatar';
    this.root.scale.setScalar(SCALE);
    this.body = new T.Group(); this.root.add(this.body);
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
    this.arms = [-1, 1].map(side => {
      const grip = new T.Group(); grip.position.set(side * .28, .73, -.12); this.fork.add(grip);
      const hand = new T.Mesh(new T.Sphere(.045, 8, 6), skin); this.rider.add(hand);
      return { side, grip, hand,
        upper: this.link(this.rider, [0, 0, 0], [0, 1, 0], shirt, 2.1),
        lower: this.link(this.rider, [0, 0, 0], [0, 1, 0], skin, 1.5) };
    });
    this.legs = [-1, 1].map(side => ({ side,
      upper: this.link(this.body, [0, 0, 0], [0, 1, 0], trousers, 2.8),
      lower: this.link(this.body, [0, 0, 0], [0, 1, 0], trousers, 2.2),
      shoe: box(this.body, [.11, .09, .23], [0, 0, 0], rubber),
      pedal: box(this.body, [.15, .04, .10], [0, 0, 0], metal),
      crank: this.link(this.body, [0, 0, 0], [0, 1, 0], metal, .8)
    }));
    this.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.animation = new RideAnimation(T, {
      body: this.body, rider: this.rider, fork: this.fork, wheels: this.wheels,
      arms: this.arms, legs: this.legs, segment: this.segment.bind(this)
    });
    this.animate(0, 0, 0, false);
    this.ready = model ? this.loadModel(model) : Promise.resolve(false);
  }
  segment(mesh, a, b, thickness) {
    this.delta.subVectors(b, a); mesh.position.copy(a).addScaledVector(this.delta, .5);
    mesh.scale.set(thickness, this.delta.length(), thickness);
    mesh.quaternion.setFromUnitVectors(this.up, this.delta.normalize());
  }
  async loadModel({ url, loadScene, timeoutMs = 8000 }) {
    // Caller provides a licensed asset and a loader using the city's Three version.
    // Keep the working procedural rig visible throughout fetch/parse/validation.
    let loaded, expired = false, timer;
    this.modelAbort = new AbortController(); this.modelStatus = 'loading';
    try {
      if (!url || typeof loadScene !== 'function') throw new Error('Rider model needs url and loadScene');
      const pending = Promise.resolve().then(() => loadScene(new URL(url, import.meta.url).href, this.modelAbort.signal))
        .then(scene => { if (expired || this.disposed) { disposeModel(scene); return null; } return scene; });
      loaded = await Promise.race([pending, new Promise((_, reject) => {
        timer = setTimeout(() => { expired = true; this.modelAbort.abort(); reject(new Error('Rider load timed out')); }, timeoutMs);
      })]);
      if (this.disposed || !loaded) return false;
      const animation = new PosedRideAnimation(this.T, loaded);
      loaded.traverse(node => {
        if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
        // Procedural bone motion can exceed the GLB's static bounding volume.
        if (node.isSkinnedMesh) node.frustumCulled = false;
      });
      animation.update(0, 0, 0, false, 0);
      // Normalize to the existing 1.16 m wheelbase and ground contact.
      const wrapper = new this.T.Group(); wrapper.add(loaded);
      wrapper.scale.setScalar(animation.modelScale);
      loaded.updateMatrixWorld(true);
      let bottom = Infinity;
      const p = new this.T.Vector3(), inverse = loaded.matrixWorld.clone().invert();
      animation.bike.traverse(node => {
        const vertices = node.geometry?.attributes.position;
        if (!vertices) return;
        for (let i = 0; i < vertices.count; i++) {
          p.fromBufferAttribute(vertices, i).applyMatrix4(node.matrixWorld).applyMatrix4(inverse);
          bottom = Math.min(bottom, p.y);
        }
      });
      if (!Number.isFinite(bottom)) throw new Error('Rider bike has no geometry');
      wrapper.position.y = -bottom * animation.modelScale;
      this.root.add(wrapper); this.modelRoot = wrapper; this.modelAnimation = animation;
      this.body.visible = false; this.modelStatus = 'posed';
      return true;
    } catch (error) {
      if (loaded) disposeModel(loaded);
      this.modelStatus = 'fallback';
      this.modelError = error.message;
      return false;
    } finally { clearTimeout(timer); }
  }
  animate(dt, speed, steering, brake, travel = speed * dt) {
    this.animation.update(dt, speed, steering, brake, travel);
    if (this.modelAnimation) {
      try { this.modelAnimation.update(dt, speed, steering, brake, travel); }
      catch (error) {
        disposeModel(this.modelRoot); this.modelRoot = null; this.modelAnimation = null;
        this.body.visible = true; this.modelStatus = 'fallback'; this.modelError = error.message;
      }
    }
  }
  dispose() {
    this.disposed = true; this.modelAbort?.abort(); disposeModel(this.root);
  }
}

function disposeModel(root) {
  if (!root) return;
  root.removeFromParent();
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  root.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.skeleton) skeletons.add(o.skeleton);
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m) {
      materials.add(m); for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const resource of [...geometries, ...materials, ...textures, ...skeletons]) resource.dispose();
}
