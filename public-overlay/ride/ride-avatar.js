import { SCALE } from './ride-motion.js';
import { RideAnimation, PosedRideAnimation } from './ride-animation.js';

export class RideAvatar {
  constructor(T, model = null) {
    this.T = T; this.modelStatus = 'procedural'; this.disposed = false;
    this.root = new T.Group(); this.root.name = 'ride-avatar';
    this.root.scale.setScalar(SCALE);
    this.body = new T.Group(); this.root.add(this.body);
    // All visual dimensions are bicycle metres; keep SCALE, wheel contacts and
    // the animation's shoulder/hip/grip anchors unchanged.
    const material = color => new T.Material({ color, roughness: .9, flatShading: true });
    const frame = material('#397d72'), frameLight = material('#60998a');
    const rubber = material('#293331'), tread = material('#3a4440'), metal = material('#a6b5a9');
    const shirt = material('#668f81'), seam = material('#487366'), lining = material('#e1dec9');
    const trousers = material('#39474b'), pocket = material('#4b595a');
    const skin = material('#d5ad83'), skinShade = material('#b78d69'), hair = material('#343730');
    const bag = material('#c69a43'), bagLight = material('#d8b25e'), leather = material('#745c3d');
    const sole = material('#c7cabc'), sock = material('#deded0');
    const cylinder = new T.Cylinder(.025, .025, 1, 8);
    this.up = new T.Vector3(0, 1, 0); this.delta = new T.Vector3();
    this.a = new T.Vector3(); this.b = new T.Vector3();
    this.link = (parent, from, to, mat, thickness = 1) => {
      const mesh = new T.Mesh(cylinder, mat); parent.add(mesh);
      this.segment(mesh, this.a.fromArray(from), this.b.fromArray(to), thickness); return mesh;
    };
    const sphere = new T.Sphere(1, 10, 6);
    const ellipsoid = (parent, size, position, mat) => {
      const mesh = new T.Mesh(sphere, mat); mesh.scale.fromArray(size);
      mesh.position.fromArray(position); parent.add(mesh); return mesh;
    };
    const boxGeometry = new Map();
    const box = (parent, size, position, mat, bevel = .015) => {
      const key = size.join(',') + ':' + bevel;
      if (!boxGeometry.has(key)) {
        const geometry = new T.Box(...size, 2, 2, 2);
        const vertices = geometry.attributes.position;
        const radius = Math.min(bevel, ...size.map(v => v / 3));
        const p = new T.Vector3(), inner = new T.Vector3();
        for (let i = 0; i < vertices.count; i++) {
          p.fromBufferAttribute(vertices, i);
          inner.set(...p.toArray().map((v, axis) => Math.max(-size[axis] / 2 + radius, Math.min(size[axis] / 2 - radius, v))));
          p.sub(inner).normalize().multiplyScalar(radius).add(inner);
          vertices.setXYZ(i, p.x, p.y, p.z);
        }
        geometry.computeVertexNormals(); boxGeometry.set(key, geometry);
      }
      const mesh = new T.Mesh(boxGeometry.get(key), mat);
      mesh.position.fromArray(position); parent.add(mesh); return mesh;
    };
    const ring = (parent, radius, tube, mat, x = 0) => {
      const mesh = new T.Mesh(new T.Torus(radius, tube, 6, 24), mat);
      mesh.rotation.y = Math.PI / 2; mesh.position.x = x; parent.add(mesh); return mesh;
    };

    // A complete diamond frame, paired rear stays and a two-legged front fork.
    const rear = [0, .35, -.58], crank = [0, .37, -.05], saddle = [0, .91, -.24], stem = [0, .92, .43];
    for (const [a, b, width] of [[saddle, crank, 1.4], [saddle, stem, 1.55], [crank, stem, 1.8]]) this.link(this.body, a, b, frame, width);
    for (const side of [-1, 1]) {
      this.link(this.body, [side * .07, ...rear.slice(1)], [side * .07, ...crank.slice(1)], frame, .95);
      this.link(this.body, [side * .07, ...rear.slice(1)], [side * .04, ...saddle.slice(1)], frame, .85);
    }
    this.link(this.body, [0, .84, -.24], [0, .99, -.24], metal, .95);
    this.link(this.body, [0, .90, -.37], [0, .94, -.13], metal, .45);
    box(this.body, [.25, .075, .21], [0, .985, -.285], rubber, .035);
    box(this.body, [.12, .065, .17], [0, .98, -.135], rubber, .025);
    box(this.body, [.095, .04, .022], [0, .927, -.385], material('#9c5a43'));
    this.link(this.body, [-.10, .37, -.05], [.10, .37, -.05], metal, 1.7);
    const chainring = new T.Group(); chainring.position.set(.10, .37, -.05); this.body.add(chainring);
    ring(chainring, .108, .013, metal); ring(chainring, .081, .008, rubber);
    for (const y of [.268, .472]) this.link(this.body, [.105, y, -.05], [.105, y < .37 ? .30 : .40, -.58], rubber, .27);
    const cassette = new T.Group(); cassette.position.set(.083, .35, -.58); this.body.add(cassette);
    ring(cassette, .058, .012, metal);
    this.link(this.body, [.105, .35, -.58], [.11, .23, -.50], rubber, .7);
    // Small frame badge and bottle add detail without textures or asset requests.
    box(this.body, [.07, .105, .022], [0, .84, .452], lining, .008);
    this.link(this.body, [.04, .52, -.13], [.04, .69, -.20], lining, 1.1);

    this.fork = new T.Group(); this.fork.position.set(0, .35, .58); this.body.add(this.fork);
    for (const side of [-1, 1]) {
      this.link(this.fork, [side * .07, 0, 0], [side * .07, .39, -.07], frame, 1.1);
      this.link(this.fork, [side * .07, .26, -.05], [side * .07, .51, -.095], metal, .65);
      this.link(this.fork, [side * .07, .51, -.095], [0, .58, -.14], frame, 1.05);
      this.link(this.fork, [0, .73, -.19], [side * .20, .75, -.16], metal, .85);
      this.link(this.fork, [side * .20, .75, -.16], [side * .33, .73, -.12], rubber, 1.15);
      this.link(this.fork, [side * .21, .71, -.11], [side * .29, .70, -.065], rubber, .42);
      // Brake cable follows the steering assembly as one rigid visual detail.
      this.link(this.fork, [side * .19, .71, -.14], [side * .12, .48, -.015], rubber, .15);
    }
    this.link(this.fork, [0, .51, -.095], [0, .73, -.19], frame, 1.3);
    const wheel = (parent, z) => {
      const group = new T.Group(); group.position.set(0, parent === this.fork ? 0 : .35, z); parent.add(group);
      // .300 + .055 = the original .355 outer radius: contact and roll stay exact.
      ring(group, .300, .055, rubber);
      for (const side of [-1, 1]) ring(group, .279, .010, metal, side * .022);
      this.link(group, [-.065, 0, 0], [.065, 0, 0], metal, 1.55);
      for (let i = 0; i < 16; i++) {
        const angle = i * Math.PI / 8, x = (i % 2 ? -1 : 1) * .025;
        this.link(group, [x, 0, 0], [x, Math.sin(angle) * .273, Math.cos(angle) * .273], metal, .18);
      }
      for (let i = 0; i < 18; i++) {
        const angle = i * Math.PI / 9;
        const block = box(group, [.058, .008, .038], [0, Math.cos(angle) * .350, Math.sin(angle) * .350], tread, .002);
        block.rotation.x = angle;
      }
      ring(group, .081, .008, metal, -.058);
      return group;
    };
    this.wheels = [wheel(this.body, -.58), wheel(this.fork, 0)];

    this.rider = new T.Group(); this.body.add(this.rider);
    const torso = new T.Group(); torso.position.set(0, 1.035, -.22); torso.rotation.x = .46; this.rider.add(torso);
    // Oval chest, tapered waist and broad shoulder cap replace the single rod.
    const waist = new T.Mesh(new T.Cylinder(.185, .15, .29, 8), shirt);
    waist.scale.z = .70; waist.position.y = .145; torso.add(waist);
    ellipsoid(torso, [.205, .22, .135], [0, .335, 0], shirt);
    ellipsoid(torso, [.225, .10, .13], [0, .425, 0], shirt);
    box(torso, [.31, .045, .21], [0, .035, 0], seam);
    box(torso, [.115, .31, .018], [0, .30, .127], lining, .008);
    for (const side of [-1, 1]) {
      const lapel = box(torso, [.065, .19, .028], [side * .071, .37, .133], seam, .008);
      lapel.rotation.z = side * -.16;
      box(torso, [.055, .065, .018], [side * .135, .285, .108], shirt, .006);
    }
    ellipsoid(this.body, [.185, .115, .135], [0, 1.005, -.225], trousers);
    this.link(this.rider, [0, 1.51, .015], [0, 1.61, .077], skin, 2.2);
    ellipsoid(this.rider, [.137, .16, .13], [0, 1.675, .09], skin);
    ellipsoid(this.rider, [.100, .070, .095], [0, 1.60, .105], skin);
    ellipsoid(this.rider, [.14, .10, .115], [0, 1.733, .058], hair);
    ellipsoid(this.rider, [.026, .032, .032], [0, 1.663, .221], skinShade);
    for (const side of [-1, 1]) {
      ellipsoid(this.rider, [.030, .044, .025], [side * .135, 1.679, .082], skin);
      ellipsoid(this.rider, [.020, .026, .012], [side * .050, 1.704, .208], lining);
      ellipsoid(this.rider, [.010, .017, .008], [side * .049, 1.703, .219], hair);
      this.link(this.rider, [side * .025, 1.736, .213], [side * .075, 1.732, .207], hair, .23);
    }
    const cap = new T.Mesh(new T.Sphere(.148, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), seam);
    cap.position.set(0, 1.749, .072); cap.scale.y = .76; this.rider.add(cap);
    const brim = box(this.rider, [.255, .026, .15], [0, 1.747, .19], seam, .025); brim.rotation.x = -.08;
    box(this.rider, [.047, .035, .013], [0, 1.802, .203], lining, .004);
    ellipsoid(this.rider, [.018, .012, .018], [0, 1.864, .072], frameLight);
    box(this.rider, [.065, .024, .017], [0, 1.754, -.068], leather, .005);

    // Mustard backpack faces -Z: a strong silhouette in the normal chase view.
    const backpack = new T.Group(); backpack.name = 'ride-backpack';
    backpack.position.set(0, .30, -.155); torso.add(backpack);
    box(backpack, [.32, .365, .155], [0, 0, -.043], bag, .038);
    box(backpack, [.30, .070, .16], [0, -.155, -.048], leather, .025);
    box(backpack, [.25, .19, .05], [0, -.025, -.136], bagLight, .019);
    box(backpack, [.30, .075, .16], [0, .15, -.05], bagLight, .020);
    for (const side of [-1, 1]) {
      box(backpack, [.060, .15, .10], [side * .17, -.065, -.05], bag, .015);
      box(backpack, [.022, .14, .018], [side * .10, .11, -.135], leather, .004);
      box(backpack, [.036, .035, .02], [side * .10, .075, -.15], rubber, .003);
      // Shoulder straps wrap over the shirt and join the pack below the arms.
      this.link(torso, [side * .115, .46, -.14], [side * .15, .48, .07], leather, .65);
      this.link(torso, [side * .15, .48, .07], [side * .12, .13, .08], leather, .65);
      this.link(torso, [side * .12, .13, .08], [side * .17, .14, -.025], leather, .55);
      this.link(torso, [side * .17, .14, -.025], [side * .14, .17, -.18], leather, .55);
    }
    for (const [a, b] of [[[-.06,.18,-.05],[-.06,.225,-.05]], [[-.06,.225,-.05],[.06,.225,-.05]], [[.06,.225,-.05],[.06,.18,-.05]]]) this.link(backpack, a, b, leather, .55);
    box(backpack, [.065, .035, .009], [0, -.018, -.166], lining, .003);

    // Segment decorations use normalized Y, so the existing IK scales/rotates
    // the whole limb. Radial dimensions compensate for its existing thickness.
    const limb = (parent, thickness, pieces, jointRadius = 0, length = 1) => {
      const group = new T.Group(); parent.add(group);
      for (const [from, to, proximal, distal, mat] of pieces) {
        const mesh = new T.Mesh(new T.Cylinder(distal / thickness, proximal / thickness, to - from, 8), mat);
        mesh.position.y = (from + to) / 2; group.add(mesh);
      }
      if (jointRadius) ellipsoid(group, [jointRadius / thickness, jointRadius / length, jointRadius / thickness], [0, -.5, 0], skin);
      return group;
    };
    this.arms = [-1, 1].map(side => {
      const grip = new T.Group(); grip.position.set(side * .28, .73, -.12); this.fork.add(grip);
      const hand = new T.Group(); this.rider.add(hand);
      ellipsoid(hand, [.050, .037, .050], [0, 0, .008], skin);
      ellipsoid(hand, [.025, .022, .033], [-side * .033, -.022, .024], skinShade);
      return { side, grip, hand,
        upper: limb(this.rider, 2.1, [[-.5,.5,.066,.048,skin],[-.5,.12,.092,.074,shirt],[.06,.16,.076,.074,seam]]),
        lower: limb(this.rider, 1.5, [[-.5,-.1,.049,.055,skin],[-.1,.5,.055,.033,skin]], .047, .31) };
    });
    this.legs = [-1, 1].map(side => {
      const shoe = new T.Group(); this.body.add(shoe);
      box(shoe, [.128, .037, .255], [0, -.028, .025], sole, .016);
      box(shoe, [.116, .068, .225], [0, .01, .014], trousers, .023);
      box(shoe, [.105, .029, .079], [0, -.006, .111], sole, .012);
      for (let i = 0; i < 3; i++) box(shoe, [.065, .008, .013], [0, .048, .010 + i * .022], lining, .002);
      const upper = limb(this.body, 2.8, [[-.5,.5,.095,.066,skin],[-.5,.09,.111,.096,trousers],[.02,.12,.098,.095,pocket]]);
      box(upper, [.012, .30, .047], [side * .037, -.14, .006], pocket, .004);
      return { side, upper,
        lower: limb(this.body, 2.2, [[-.5,-.15,.061,.073,skin],[-.15,.5,.073,.038,skin],[.23,.5,.052,.043,sock],[.20,.25,.054,.053,sole]], .063, .43),
        shoe, pedal: box(this.body, [.18, .04, .115], [0, 0, 0], rubber, .008),
        crank: this.link(this.body, [0, 0, 0], [0, 1, 0], metal, .8) };
    });
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
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
