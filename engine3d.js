/* Just Storyboards — 3D engine (Three.js)
   Builds a small 3D set (location + stick-figure characters) and shoots it with a
   real perspective camera, so every angle (wide, OTS, POV, low, high…) is a true shot. */
import * as THREE from './three-bundle.js';
import { LineSegments2, LineSegmentsGeometry, LineMaterial } from './three-bundle.js';

const INK = 0x15151a, PAPER = 0xf5f1e8, RED = 0xe50914;
const C = { T1: 0xe9e4d8, T2: 0xd6d0c0, T3: 0xb4ae9c, T4: 0x8a8575, glass: 0xdfe9e8, wood: 0xc9c2ae, white: 0xfaf7ef, dark: 0x2a2a2e };

/* ------------------------------------------------------------------ */
/* Meta for the UI                                                     */
/* ------------------------------------------------------------------ */
export const ANGLES = [
  { id: 'wide',  abbr: 'WS',  label: 'Wide shot',         desc: 'The whole location, characters small in it.' },
  { id: 'full',  abbr: 'FS',  label: 'Full shot',         desc: 'Head to toe, filling the frame.' },
  { id: 'mid',   abbr: 'MS',  label: 'Mid shot',          desc: 'From the waist up.' },
  { id: 'close', abbr: 'CU',  label: 'Close-up',          desc: 'Head and shoulders.' },
  { id: 'ecu',   abbr: 'ECU', label: 'Extreme close-up',  desc: 'Just the face of your first character.' },
  { id: 'ots',   abbr: 'OTS', label: 'Over the shoulder', desc: 'Behind your first character, looking at the rest.' },
  { id: 'pov',   abbr: 'POV', label: 'POV',               desc: 'Through your first character’s eyes.' },
  { id: 'low',   abbr: 'LA',  label: 'Low angle',         desc: 'Camera on the floor, looking up.' },
  { id: 'high',  abbr: 'HA',  label: 'High angle',        desc: 'Camera up high, looking down.' },
  { id: 'dutch', abbr: 'DA',  label: 'Dutch angle',       desc: 'Tilted frame for tension.' }
];

const CH = {
  girl: { id: 'girl', label: 'Girl', Ht: 1.68, R: 0.155, legR: 0.47, arm: 0.55, limb: 0.017 },
  boy:  { id: 'boy',  label: 'Boy',  Ht: 1.76, R: 0.160, legR: 0.48, arm: 0.59, limb: 0.019 },
  kid:  { id: 'kid',  label: 'Kid',  Ht: 1.12, R: 0.165, legR: 0.40, arm: 0.34, limb: 0.015 }
};
Object.values(CH).forEach(function (c) { c.L = c.Ht * c.legR; c.T = c.Ht - c.L - 2 * c.R - 0.02; });
export const CHARACTERS = Object.values(CH).map(function (c) { return { id: c.id, label: c.label }; });

export const LOCATIONS = [
  { id: 'cafe', label: 'Café' }, { id: 'house', label: 'House' }, { id: 'park', label: 'Outdoor' },
  { id: 'street', label: 'Street' }, { id: 'classroom', label: 'Classroom' }, { id: 'car', label: 'In a car' }
];

function metrics(c, pose, seatH) {
  var hipY = pose === 'sit' ? seatH : c.L;
  var shY = hipY + c.T * 0.9, neckY = hipY + c.T, headY = neckY + c.R + 0.015;
  return { hipY: hipY, shY: shY, neckY: neckY, headY: headY, top: headY + c.R, R: c.R };
}

/* ------------------------------------------------------------------ */
/* Builder: meshes + fat-line outlines                                 */
/* ------------------------------------------------------------------ */
var BOX_EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
function boxCorners(w, h, d) {
  var x = w / 2, y = h / 2, z = d / 2;
  return [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]];
}

var hullUniform = { value: 0.002 };
function makeHullMat() {
  var m = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  m.onBeforeCompile = function (sh) {
    sh.uniforms.uK = hullUniform;
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'uniform float uK;\nvoid main() {')
      .replace('#include <begin_vertex>',
        'float dd = -(modelViewMatrix * vec4(position, 1.0)).z;\nvec3 transformed = vec3(position) + normalize(normal) * uK * dd;');
  };
  return m;
}

class Builder {
  constructor() {
    this.scene = new THREE.Scene();
    this.edges = []; this.thin = [];
    this.cache = {};
    this.hull = makeHullMat();
    this.ink = new THREE.MeshBasicMaterial({ color: INK });
    this.flatWhite = new THREE.MeshBasicMaterial({ color: C.white });
    this.tex = [];
    this.lines = [];
    var hemi = new THREE.HemisphereLight(0xffffff, 0xe8e2d4, 2.7);
    var sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(3, 7, 5);
    this.scene.add(hemi, sun);
  }
  mat(color, o) {
    var key = color + (o && o.key || '');
    if (!this.cache[key]) {
      this.cache[key] = new THREE.MeshLambertMaterial(Object.assign({ color: color, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }, o && o.opts || {}));
    }
    return this.cache[key];
  }
  pushEdges(mesh, corners) {
    mesh.updateWorldMatrix(true, false);
    var arr = (mesh.userData.thin ? this.thin : this.edges), v = new THREE.Vector3();
    var pts = corners.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(mesh.matrixWorld); });
    BOX_EDGES.forEach(function (e) {
      arr.push(pts[e[0]].x, pts[e[0]].y, pts[e[0]].z, pts[e[1]].x, pts[e[1]].y, pts[e[1]].z);
    });
  }
  /* centre-bottom placement */
  box(x, y, z, w, h, d, color, o) {
    o = o || {};
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color == null ? C.T1 : color));
    m.position.set(x, y + h / 2, z);
    if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz; if (o.rx) m.rotation.x = o.rx;
    if (o.thin) m.userData.thin = true;
    (o.parent || this.scene).add(m);
    if (o.edge !== false) this.pushEdges(m, boxCorners(w, h, d));
    return m;
  }
  cyl(x, y, z, rt, rb, h, color, o) {
    o = o || {};
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 24, 1, !!o.open), this.mat(color == null ? C.T2 : color, o.double ? { key: 'dbl', opts: { side: THREE.DoubleSide } } : null));
    m.position.set(x, y + h / 2, z);
    if (o.rx) m.rotation.x = o.rx; if (o.rz) m.rotation.z = o.rz; if (o.ry) m.rotation.y = o.ry;
    (o.parent || this.scene).add(m);
    if (o.hull !== false) this.addHull(m);
    return m;
  }
  sph(x, y, z, r, color, o) {
    o = o || {};
    var m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), this.mat(color == null ? C.T2 : color));
    m.position.set(x, y, z);
    if (o.sy) m.scale.y = o.sy; if (o.sx) m.scale.x = o.sx; if (o.sz) m.scale.z = o.sz;
    (o.parent || this.scene).add(m);
    if (o.hull !== false) this.addHull(m);
    return m;
  }
  addHull(m) {
    var h = new THREE.Mesh(m.geometry, this.hull);
    h.position.copy(m.position); h.rotation.copy(m.rotation); h.scale.copy(m.scale);
    (m.parent || this.scene).add(h);
  }
  line(a, b, thin) { (thin ? this.thin : this.edges).push(a[0], a[1], a[2], b[0], b[1], b[2]); }
  canvasTex(w, h, draw) {
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    this.tex.push(t); return t;
  }
  decal(tex, x, y, z, w, h, ry) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.position.set(x, y, z); if (ry) m.rotation.y = ry; this.scene.add(m); return m;
  }
  finish() {
    var self = this;
    if (this.edges.length) {
      var g = new LineSegmentsGeometry(); g.setPositions(this.edges);
      var mt = new LineMaterial({ color: INK, linewidth: 3, worldUnits: false, alphaToCoverage: true });
      var l = new LineSegments2(g, mt); l.frustumCulled = false; this.scene.add(l); this.lines.push({ mt: mt, w: 3 });
    }
    if (this.thin.length) {
      var g2 = new LineSegmentsGeometry(); g2.setPositions(this.thin);
      var mt2 = new LineMaterial({ color: 0x8f8a7a, linewidth: 1.3, worldUnits: false, alphaToCoverage: true });
      var l2 = new LineSegments2(g2, mt2); l2.frustumCulled = false; this.scene.add(l2); this.lines.push({ mt: mt2, w: 1.3 });
    }
  }
  setPixels(w, h, fov) {
    var k = h / 720;
    this.lines.forEach(function (l) { l.mt.linewidth = l.w * k * 1.15; l.mt.resolution.set(w, h); });
    hullUniform.value = 3.4 * k * 2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2) / h * 0.5;
  }
  dispose() {
    this.scene.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
    });
    Object.values(this.cache).forEach(function (m) { m.dispose(); });
    this.tex.forEach(function (t) { t.dispose(); });
    this.lines.forEach(function (l) { l.mt.dispose(); });
    this.hull.dispose(); this.ink.dispose(); this.flatWhite.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Characters                                                          */
/* ------------------------------------------------------------------ */
var V3 = function (x, y, z) { return new THREE.Vector3(x, y, z); };

function makeChar(B, id, pose, mood, seatH, hand) {
  var c = CH[id], g = new THREE.Group(), L = c.L, T = c.T, A = c.arm, R = c.R, r = c.limb;
  var M = metrics(c, pose, seatH);
  var jointGeo = new THREE.SphereGeometry(1, 10, 8);

  function seg(a, b, rad) {
    rad = rad || r;
    var v = new THREE.Vector3().subVectors(b, a), len = v.length();
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 8), B.ink);
    m.position.copy(a).addScaledVector(v, 0.5);
    m.quaternion.setFromUnitVectors(V3(0, 1, 0), v.clone().normalize());
    g.add(m);
    var j = new THREE.Mesh(jointGeo, B.ink); j.scale.setScalar(rad); j.position.copy(b); g.add(j);
  }
  function shoe(p) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.035, 0.16), B.ink);
    m.position.set(p.x, p.y + 0.018, p.z + 0.05); g.add(m);
  }

  // legs
  var hipW = c.id === 'girl' ? 0.04 : 0.045;
  [-1, 1].forEach(function (s) {
    var hip = V3(s * hipW, M.hipY, 0), knee, foot;
    if (pose === 'stand') {
      foot = V3(s * 0.12, 0, 0.0); knee = hip.clone().lerp(foot, 0.5); knee.z += 0.01;
    } else if (pose === 'walk') {
      foot = s < 0 ? V3(-0.09, 0, 0.30) : V3(0.09, 0.025, -0.24);
      knee = hip.clone().lerp(foot, 0.5); knee.z += s < 0 ? 0.05 : -0.02; knee.y += 0.02;
    } else {
      var th = L * 0.52, shin = L * 0.5;
      knee = V3(s * 0.1, M.hipY, th);
      foot = V3(s * 0.11, Math.max(0, M.hipY - shin), th + 0.04);
    }
    seg(hip, knee); seg(knee, foot); shoe(foot);
  });

  // spine & neck
  seg(V3(0, M.hipY, 0), V3(0, M.neckY, 0), r * 1.15);
  seg(V3(0, M.neckY, 0), V3(0, M.headY - R, 0), r);

  // arms
  [-1, 1].forEach(function (s) {
    var S = V3(s * 0.03, M.shY, 0), H, E;
    if (pose === 'sit') {
      if (hand) { H = V3(s * 0.16, hand.y, hand.f); E = V3(s * 0.2, M.shY - A * 0.4, 0.04); }
      else { H = V3(s * 0.15, M.hipY + 0.07, L * 0.45); E = V3(s * 0.2, M.shY - A * 0.5, 0.02); }
    } else if (pose === 'walk') {
      var fwd = s > 0;
      H = V3(s * 0.1, M.shY - A * 0.78, fwd ? 0.22 : -0.2); E = V3(s * 0.12, M.shY - A * 0.4, fwd ? 0.1 : -0.08);
    } else if (mood === 'surprised') {
      H = V3(s * 0.3, M.shY + 0.1, 0.12); E = V3(s * 0.24, M.shY - 0.12, 0.05);
    } else if (mood === 'happy') {
      H = V3(s * 0.33, M.shY - A * 0.5, 0.1); E = V3(s * 0.2, M.shY - A * 0.25, 0.03);
    } else if (mood === 'angry') {
      H = V3(s * 0.16, M.hipY + 0.02, 0.05); E = V3(s * 0.3, M.shY - A * 0.4, -0.02);
    } else {
      H = V3(s * 0.17, M.shY - A * 0.86, 0.04); E = S.clone().lerp(H, 0.5); E.x += s * 0.025; E.z -= 0.03;
    }
    seg(S, E); seg(E, H);
    var hd = new THREE.Mesh(jointGeo, B.flatWhite); hd.scale.setScalar(Math.max(0.03, A * 0.07)); hd.position.copy(H); g.add(hd);
    var hh = new THREE.Mesh(jointGeo, B.hull); hh.scale.copy(hd.scale); hh.position.copy(H); g.add(hh);
  });

  // clothes
  if (id === 'girl') {
    var top = M.shY - 0.02, bottom = pose === 'sit' ? M.hipY - 0.03 : M.hipY - L * 0.34, hgt = top - bottom;
    var dress = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.3, hgt, 28, 1, true), B.mat(C.T2, { key: 'dbl', opts: { side: THREE.DoubleSide } }));
    dress.position.y = bottom + hgt / 2; g.add(dress);
    var dh = new THREE.Mesh(dress.geometry, B.hull); dh.position.copy(dress.position); g.add(dh);
  } else if (id === 'kid') {
    var tee = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, T * 0.95, 20, 1, true), B.mat(C.T2, { key: 'dbl', opts: { side: THREE.DoubleSide } }));
    tee.position.y = M.hipY + T * 0.5; g.add(tee);
    var th2 = new THREE.Mesh(tee.geometry, B.hull); th2.position.copy(tee.position); g.add(th2);
  }

  // head
  var head = new THREE.Group(); head.position.y = M.headY; g.add(head);
  var hs = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), B.flatWhite); head.add(hs);
  head.add(new THREE.Mesh(hs.geometry, B.hull));

  function dir(x, y) { var z = Math.sqrt(Math.max(0.02, 1 - x * x - y * y)); return V3(x, y, z).normalize(); }
  function tube(pts, rad) {
    var m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, rad, 6, false), B.ink); head.add(m);
  }
  var er = Math.max(0.013, R * 0.085), fr = R * 1.005, tr = Math.max(0.0055, R * 0.04);
  [-1, 1].forEach(function (s) {
    var e = new THREE.Mesh(jointGeo, B.ink);
    e.scale.set(er * (mood === 'surprised' ? 1.35 : 1), er * (mood === 'surprised' ? 1.35 : 1), er * 0.7);
    e.position.copy(dir(s * 0.34, 0.1).multiplyScalar(fr)); e.lookAt(e.position.clone().multiplyScalar(2)); head.add(e);
  });
  function curve(fn, w) {
    var pts = [];
    for (var t = -1; t <= 1.001; t += 0.25) { var d = dir(w * t, fn(t)); pts.push(d.multiplyScalar(fr)); }
    tube(pts, tr);
  }
  function brow(x1, y1, x2, y2) { tube([dir(x1, y1).multiplyScalar(fr), dir((x1 + x2) / 2, (y1 + y2) / 2 + 0.01).multiplyScalar(fr), dir(x2, y2).multiplyScalar(fr)], tr * 0.9); }
  if (mood === 'happy') curve(function (t) { return -0.26 - 0.2 * (1 - t * t); }, 0.42);
  else if (mood === 'sad') { curve(function (t) { return -0.5 + 0.15 * (1 - t * t); }, 0.3); brow(-0.55, 0.3, -0.2, 0.44); brow(0.55, 0.3, 0.2, 0.44); }
  else if (mood === 'angry') { curve(function (t) { return -0.46 + 0.06 * (1 - t * t); }, 0.3); brow(-0.55, 0.45, -0.2, 0.3); brow(0.55, 0.45, 0.2, 0.3); }
  else if (mood === 'surprised') {
    var mo = new THREE.Mesh(jointGeo, B.ink); mo.scale.set(R * 0.1, R * 0.15, R * 0.06); mo.position.copy(dir(0, -0.42).multiplyScalar(fr)); head.add(mo);
    brow(-0.55, 0.42, -0.18, 0.46); brow(0.55, 0.42, 0.18, 0.46);
  } else curve(function () { return -0.4; }, 0.26);

  // hair / hats
  function cap(rad, thetaLen, color, phiStart, phiLen, hull) {
    var geo = new THREE.SphereGeometry(rad, 32, 16, phiStart || 0, phiLen || Math.PI * 2, 0, thetaLen);
    var m = new THREE.Mesh(geo, color === INK ? B.ink : new THREE.MeshLambertMaterial({ color: color, side: THREE.DoubleSide }));
    if (color === INK) { m.material = new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide }); }
    head.add(m);
    if (hull) head.add(new THREE.Mesh(geo, B.hull));
    return m;
  }
  if (id === 'boy') {
    cap(R * 1.045, 0.95, INK); cap(R * 1.05, 1.5, INK, Math.PI, Math.PI);
    for (var i = 0; i < 7; i++) {
      var ph = (i / 7) * Math.PI * 2, th = i === 0 ? 0.0 : 0.62;
      var d = V3(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th)).normalize();
      var sp = new THREE.Mesh(new THREE.ConeGeometry(R * 0.2, R * 0.55, 8), B.ink);
      sp.position.copy(d).multiplyScalar(R * 1.1); sp.quaternion.setFromUnitVectors(V3(0, 1, 0), d); head.add(sp);
    }
  } else if (id === 'girl') {
    cap(R * 1.05, 1.02, INK); cap(R * 1.07, 1.85, INK, Math.PI, Math.PI);
    var tail = new THREE.Mesh(new THREE.CapsuleGeometry(R * 0.28, R * 1.7, 6, 12), B.ink);
    tail.position.set(R * 0.55, -R * 0.35, -R * 1.15); tail.rotation.set(0.35, 0, -0.3); head.add(tail);
    var bow = new THREE.Group(), redM = new THREE.MeshLambertMaterial({ color: RED });
    [-1, 1].forEach(function (s) {
      var w = new THREE.Mesh(new THREE.ConeGeometry(R * 0.34, R * 0.5, 14), redM);
      w.rotation.z = s * Math.PI / 2; w.position.x = s * R * 0.25; bow.add(w);
    });
    var kn = new THREE.Mesh(jointGeo, redM); kn.scale.setScalar(R * 0.14); bow.add(kn);
    bow.position.copy(V3(0.5, 0.78, -0.25).normalize().multiplyScalar(R * 1.08)); bow.rotation.z = -0.5; head.add(bow);
  } else {
    cap(R * 1.09, 1.12, C.T3, 0, Math.PI * 2, true);
    var br = new THREE.Mesh(new THREE.TorusGeometry(R * 1.09 * Math.sin(1.12), R * 0.07, 8, 32), B.ink);
    br.rotation.x = Math.PI / 2; br.position.y = R * 1.09 * Math.cos(1.12); head.add(br);
    var pom = new THREE.Mesh(jointGeo, new THREE.MeshLambertMaterial({ color: RED })); pom.scale.setScalar(R * 0.24); pom.position.y = R * 1.18; head.add(pom);
    var ph2 = new THREE.Mesh(jointGeo, B.hull); ph2.scale.copy(pom.scale); ph2.position.copy(pom.position); head.add(ph2);
  }
  return { group: g, M: M, headObj: head };
}

/* ------------------------------------------------------------------ */
/* Locations                                                           */
/* ------------------------------------------------------------------ */
function shell(B, o) {
  var wall = o.wall, floor = o.floor, bz = o.backZ || -3.2;
  B.box(0, -0.2, 2, 30, 0.2, 24, floor, { edge: false });
  B.box(0, 0, bz - 0.1, 30, o.h || 3.4, 0.2, wall);
  B.box(-5.1, 0, 2.2, 0.2, o.h || 3.4, 12, wall);
  B.box(5.1, 0, 2.2, 0.2, o.h || 3.4, 12, wall);
  B.box(0, 0, bz + 0.03, 30, 0.14, 0.06, C.T2, { edge: false });
  for (var x = -5; x <= 5; x += 0.55) B.line([x, 0.002, bz], [x, 0.002, 9], true);
  for (var z = bz; z <= 9; z += 0.9) B.line([-5, 0.002, z], [5, 0.002, z], true);
}
function stool(B, x, z, h, color) {
  B.box(x, h - 0.04, z, 0.4, 0.04, 0.4, color || C.T3);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { B.box(x + q[0] * 0.16, 0, z + q[1] * 0.16, 0.035, h - 0.04, 0.035, C.T4, { edge: false }); });
}
function mug(B, x, y, z) {
  B.cyl(x, y, z, 0.04, 0.034, 0.08, C.white);
  B.box(x + 0.05, y + 0.02, z, 0.03, 0.04, 0.012, C.white, { edge: false });
}
function plant(B, x, z, k) {
  k = k || 1;
  B.cyl(x, 0, z, 0.18 * k, 0.14 * k, 0.4 * k, C.T3);
  [[0, 0.75, 0, 0.26], [-0.14, 0.6, 0.06, 0.2], [0.15, 0.62, -0.04, 0.2]].forEach(function (p) { B.sph(x + p[0] * k, p[1] * k + 0.1, z + p[2] * k, p[3] * k, 0xcfd5bc); });
}
function tableSet(B, p, kind, tz) {
  var xs = p.map(function (q) { return q.x; }), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  var w = Math.max(1.5, x1 - x0 + 1.5), cx = (x0 + x1) / 2;
  B.box(cx, 0.7, tz, w, 0.05, 0.7, kind === 'desk' ? 0xc7bfa8 : C.wood);
  B.box(cx - w / 2 + 0.12, 0, tz, 0.06, 0.7, 0.5, C.T3); B.box(cx + w / 2 - 0.12, 0, tz, 0.06, 0.7, 0.5, C.T3);
  B.box(cx, 0.6, tz, w - 0.3, 0.06, 0.06, C.T3, { edge: false });
  p.forEach(function (q, i) {
    if (kind === 'desk') { B.box(q.x - 0.25 * (q.viewer ? -1 : 1), 0.75, tz + 0.02, 0.32, 0.03, 0.22, C.white); }
    else mug(B, q.x + (q.viewer ? -0.35 : 0.38), 0.75, tz + (q.viewer ? 0.05 : -0.05));
  });
}

var LOCATIONS_3D = {
  blank: {
    seat: 'stool', sky: PAPER,
    build: function (B) { shell(B, { wall: 0xece7da, floor: 0xddd7c8, backZ: -3.2 }); }
  },
  cafe: {
    seat: 'stool', table: 'cafe', sky: PAPER,
    build: function (B, ctx) {
      shell(B, { wall: 0xece6d8, floor: 0xd9d1bf, backZ: -3 });
      B.box(-2.3, 0.9, -2.9, 2.4, 1.7, 0.08, C.glass);
      [-2.3, -2.3 - 0.8, -2.3 + 0.8].forEach(function (x, i) { if (i) B.box(x + (i === 1 ? 0.4 : -0.4), 0.9, -2.84, 0.05, 1.7, 0.05, C.T3); });
      B.box(-2.3, 1.72, -2.84, 2.4, 0.05, 0.05, C.T3); B.box(-2.3, 1.3, -2.84, 2.4, 0.05, 0.05, C.T3);
      B.box(-2.3, 0.82, -2.8, 2.6, 0.08, 0.3, C.T2);
      B.box(1.9, 2.0, -2.9, 2.6, 0.8, 0.06, C.dark);
      var sign = B.canvasTex(512, 160, function (g, w, h) { g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h); g.fillStyle = '#f5f1e8'; g.font = '900 120px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CAFÉ', w / 2, h / 2 + 6); });
      B.decal(sign, 1.9, 2.0, -2.86, 2.4, 0.75);
      [-1.5, 0, 1.5].forEach(function (x) {
        B.box(x, 2.45, 0.1, 0.012, 1.2, 0.012, C.T4, { edge: false });
        B.cyl(x, 2.18, 0.1, 0.06, 0.26, 0.22, C.T3); B.sph(x, 2.16, 0.1, 0.06, 0xfff4cc, { hull: false });
      });
      B.box(1.8, 1.55, -2.78, 2.7, 0.04, 0.28, C.T3);
      for (var i = 0; i < 6; i++) mug(B, 0.8 + i * 0.4, 1.59, -2.78);
      B.box(3.2, 0, -2.1, 2.6, 1.0, 0.8, C.T2); B.box(3.2, 1.0, -2.1, 2.8, 0.06, 0.95, C.T3);
      B.box(2.6, 1.06, -2.15, 0.65, 0.45, 0.4, C.T4); B.box(3.9, 1.06, -2.1, 0.4, 0.3, 0.3, C.T3);
      mug(B, 3.2, 1.06, -1.9); mug(B, 3.4, 1.06, -1.95);
      plant(B, -3.9, -2.3, 1.1);
      if (ctx.pose === 'sit') tableSet(B, ctx.placed, 'cafe', ctx.tableZ);
      else {
        B.cyl(-3.1, 0.7, -0.6, 0.45, 0.45, 0.05, C.wood); B.cyl(-3.1, 0, -0.6, 0.05, 0.05, 0.7, C.T3, { hull: false }); B.cyl(-3.1, 0, -0.6, 0.25, 0.25, 0.03, C.T3, { hull: false });
        stool(B, -3.7, -0.3, 0.45); stool(B, -2.5, -0.9, 0.45); mug(B, -3.0, 0.75, -0.6);
      }
    }
  },
  house: {
    seat: 'native', sky: PAPER,
    build: function (B, ctx) {
      shell(B, { wall: 0xe9e2d2, floor: 0xd5ccb6, backZ: -3.2 });
      B.box(2.6, 0.8, -3.1, 1.9, 1.6, 0.08, C.glass); B.box(2.6, 0.8, -3.04, 0.05, 1.6, 0.05, C.T3); B.box(2.6, 1.55, -3.04, 1.9, 0.05, 0.05, C.T3);
      B.box(1.35, 0.1, -3.0, 0.5, 2.4, 0.16, C.T3); B.box(3.85, 0.1, -3.0, 0.5, 2.4, 0.16, C.T3); B.box(2.6, 2.5, -3.0, 3.3, 0.04, 0.04, C.T4, { edge: false });
      B.box(-2.6, 1.2, -3.1, 0.9, 1.1, 0.06, C.white); B.box(-2.6, 1.3, -3.06, 0.7, 0.9, 0.04, C.T1);
      B.box(-1.3, 1.6, -3.1, 0.55, 0.7, 0.06, C.white); B.box(-1.3, 1.67, -3.06, 0.4, 0.55, 0.04, C.T2);
      B.box(-3.7, 0, -2.4, 0.04, 1.6, 0.04, C.T4, { edge: false }); B.cyl(-3.7, 1.6, -2.4, 0.14, 0.22, 0.3, 0xfff4d6); B.cyl(-3.7, 0, -2.4, 0.2, 0.2, 0.03, C.T3, { hull: false });
      B.box(0, 0.005, 0.4, 5.2, 0.02, 3.6, C.T2);
      var W = Math.max(2.6, ctx.span + 1.2), sz = -0.1;
      B.box(0, 0.12, sz, W, 0.24, 0.9, C.T3);
      B.box(0, 0.24, sz, W, 0.12, 0.9, 0xbdb6a3);
      B.box(0, 0.36, sz, W - 0.45, 0.09, 0.66, 0xcdc6b2);
      B.box(0, 0.45, -0.47, W - 0.45, 0.5, 0.2, 0xbdb6a3);
      B.box(-W / 2 + 0.11, 0.12, sz, 0.22, 0.5, 0.9, 0xb0a994); B.box(W / 2 - 0.11, 0.12, sz, 0.22, 0.5, 0.9, 0xb0a994);
      B.box(-W / 4, 0.5, -0.33, 0.4, 0.38, 0.12, C.T1, { rz: 0.15 }); B.box(W / 4, 0.5, -0.33, 0.4, 0.38, 0.12, C.T1, { rz: -0.15 });
      plant(B, 3.9, -2.4, 1.2);
      if (!ctx.hasViewer) { B.box(0, 0.32, 1.35, 1.2, 0.04, 0.6, C.wood); B.box(-0.5, 0, 1.35, 0.05, 0.32, 0.5, C.T3, { edge: false }); B.box(0.5, 0, 1.35, 0.05, 0.32, 0.5, C.T3, { edge: false }); }
    }
  },
  park: {
    seat: 'native', sky: 0xe3eae8, ground: true,
    build: function (B, ctx) {
      B.box(0, -0.2, 0, 160, 0.2, 160, 0xdde0cc, { edge: false });
      B.box(0.4, 0, 2, 2.0, 0.01, 40, C.T1, { thin: true, edge: false });
      for (var z = -14; z < 10; z += 1.1) { B.line([-0.6, 0.012, z], [1.4, 0.012, z], true); }
      [[-4, -4, 1.1], [5.2, -5.5, 0.95], [-9, -10, 1.3], [10, -11, 1.1], [-14, -18, 1.4], [15, -20, 1.5]].forEach(function (t) {
        var x = t[0], z = t[1], k = t[2];
        B.cyl(x, 0, z, 0.2 * k, 0.26 * k, 2.6 * k, C.T3);
        B.sph(x, 3.3 * k, z, 1.5 * k, 0xcfd5bc); B.sph(x - 1.0 * k, 2.7 * k, z + 0.2, 1.0 * k, 0xcfd5bc); B.sph(x + 1.05 * k, 2.8 * k, z - 0.1, 1.05 * k, 0xcfd5bc);
      });
      [[-30, -45, 16], [8, -52, 20], [36, -48, 14]].forEach(function (h) { B.sph(h[0], 0, h[1], h[2], 0xd3d9c9, { sy: 0.35 }); });
      var sun = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), new THREE.MeshBasicMaterial({ color: 0xfdfbf4 })); sun.position.set(14, 15, -50); B.scene.add(sun);
      [[-12, 13, -40, 5], [4, 17, -46, 6], [20, 11, -42, 4.5]].forEach(function (c) {
        B.sph(c[0], c[1], c[2], c[3], 0xfdfbf4, { sy: 0.4 }); B.sph(c[0] + c[3] * 0.8, c[1] - 0.2, c[2], c[3] * 0.7, 0xfdfbf4, { sy: 0.4 });
      });
      bench(B, ctx);
      B.box(-3, 0, -1.8, 0.07, 3.0, 0.07, C.T4); B.sph(-3, 3.15, -1.8, 0.2, 0xfff4cc);
      for (var i = 0; i < 9; i++) B.sph(-3.5 + (i * 0.93) % 7, 0.04, -3.6 + (i * 1.37) % 2.2, 0.035, i % 2 ? 0xfdfbf4 : RED, { hull: false });
    }
  },
  street: {
    seat: 'native', sky: 0xe5eae9,
    build: function (B, ctx) {
      B.box(0, -0.2, 3, 80, 0.2, 14, 0xdcd6c6, { edge: false });
      B.box(0, -0.28, -6.5, 80, 0.2, 8, 0xbdb7a6, { edge: false });
      B.box(0, -0.08, -3, 80, 0.12, 0.2, C.T3);
      for (var x = -30; x < 30; x += 2.6) B.box(x, 0, -6.6, 1.2, 0.012, 0.16, C.white, { edge: false });
      for (var gx = -9; gx < 10; gx += 0.9) B.line([gx, 0.003, -2.9], [gx, 0.003, 9], true);
      for (var gz = -2.9; gz < 9; gz += 0.9) B.line([-9, 0.003, gz], [9, 0.003, gz], true);
      var cols = [C.T1, C.T2, C.T3, 0xded8c9], xx = -26, k = 0;
      while (xx < 28) {
        var w = 4 + (k * 7 % 3) * 1.1, h = 6 + (k * 5 % 5) * 1.6;
        B.box(xx + w / 2, 0, -13, w, h, 4, cols[k % 4]);
        for (var wy = 1.2; wy < h - 1.2; wy += 1.8) for (var wx = 0.8; wx < w - 0.8; wx += 1.3) B.box(xx + wx + 0.3, wy, -10.97, 0.7, 1.0, 0.05, C.glass, { edge: false });
        xx += w + 0.15; k++;
      }
      // parked car
      B.box(3.4, 0.28, -5.4, 4.2, 0.6, 1.8, 0xbab4a2); B.box(3.2, 0.88, -5.4, 2.2, 0.55, 1.6, 0xbab4a2);
      B.box(3.2, 0.95, -4.58, 2.0, 0.4, 0.04, C.glass, { edge: false }); B.box(3.2, 0.95, -6.22, 2.0, 0.4, 0.04, C.glass, { edge: false });
      [[2.1, -4.45], [4.7, -4.45], [2.1, -6.35], [4.7, -6.35]].forEach(function (w) { B.cyl(w[0], 0.02, w[1], 0.34, 0.34, 0.22, C.dark, { rx: Math.PI / 2 }); });
      B.box(-3.2, 0, -2.2, 0.08, 3.4, 0.08, C.T4); B.box(-3.2, 3.3, -2.2, 0.7, 0.07, 0.07, C.T4, { edge: false }); B.cyl(-2.85, 3.1, -2.2, 0.08, 0.2, 0.2, C.T3);
      bench(B, ctx);
    }
  },
  classroom: {
    seat: 'stool', table: 'desk', sky: PAPER,
    build: function (B, ctx) {
      shell(B, { wall: 0xe7e3d2, floor: 0xd2c8ae, backZ: -3.2 });
      B.box(0, 0.85, -3.12, 4.6, 1.5, 0.06, 0xbcc6ba); B.box(0, 0.8, -3.1, 4.8, 0.05, 0.08, C.T3);
      var chalk = B.canvasTex(800, 260, function (g, w, h) {
        g.strokeStyle = '#f2efe6'; g.lineWidth = 6; g.lineCap = 'round';
        g.beginPath(); g.moveTo(50, 70); for (var i = 0; i < 7; i++) g.quadraticCurveTo(80 + i * 50, 40 + (i % 2) * 40, 100 + i * 50, 70); g.stroke();
        g.beginPath(); g.moveTo(450, 70); for (var j = 0; j < 6; j++) g.quadraticCurveTo(480 + j * 50, 40 + (j % 2) * 40, 500 + j * 50, 70); g.stroke();
        g.beginPath(); g.moveTo(60, 160); g.lineTo(380, 160); g.moveTo(60, 200); g.lineTo(300, 200); g.moveTo(450, 170); g.lineTo(740, 170); g.stroke();
      });
      B.decal(chalk, 0, 1.65, -3.08, 4.3, 1.4);
      var clock = B.canvasTex(200, 200, function (g) { g.fillStyle = '#f5f1e8'; g.beginPath(); g.arc(100, 100, 92, 0, 7); g.fill(); g.strokeStyle = '#15151a'; g.lineWidth = 8; g.stroke(); g.beginPath(); g.moveTo(100, 100); g.lineTo(100, 42); g.moveTo(100, 100); g.lineTo(140, 118); g.stroke(); });
      B.decal(clock, 3.5, 2.5, -3.08, 0.6, 0.6);
      B.box(-5.0, 0.9, 0, 0.1, 1.6, 2.6, C.glass); B.box(-4.96, 0.9, 0, 0.05, 1.6, 0.05, C.T3); B.box(-4.96, 1.7, 0, 0.05, 0.05, 2.6, C.T3);
      B.box(2.2, 1.4, -3.1, 0.8, 1.0, 0.05, C.white); B.box(-3.7, 1.6, -3.1, 0.9, 0.7, 0.05, C.white);
      if (ctx.pose === 'sit') tableSet(B, ctx.placed, 'desk', ctx.tableZ);
      else {
        [[-3.2, -1.2], [3.2, -1.2], [-3.2, -2.3], [3.2, -2.3]].forEach(function (d) {
          B.box(d[0], 0.7, d[1], 0.9, 0.04, 0.55, 0xc7bfa8); B.box(d[0] - 0.38, 0, d[1], 0.04, 0.7, 0.4, C.T3, { edge: false }); B.box(d[0] + 0.38, 0, d[1], 0.04, 0.7, 0.4, C.T3, { edge: false });
          stool(B, d[0], d[1] + 0.65, 0.44);
        });
      }
    }
  },
  car: {
    seat: 'native', seatH: 0.4, forceSit: true, sky: PAPER, flat: true, maxDist: 1.5,
    build: function (B, ctx) {
      B.box(0, -0.12, -0.3, 2.1, 0.12, 4.2, C.T3, { edge: false });
      B.box(0, 0, -0.3, 2.0, 0.06, 3.8, C.T2);
      // doors + windows
      [-1, 1].forEach(function (s) {
        B.box(s * 1.04, 0.05, -0.3, 0.1, 0.65, 3.6, C.T2);
        B.box(s * 1.04, 0.7, -0.3, 0.06, 0.6, 3.4, C.glass);
        [-1.7, -0.45, 0.8].forEach(function (z) { B.box(s * 1.04, 0.7, z, 0.12, 0.62, 0.1, C.T3); });
        B.box(s * 0.95, 0.5, 0.2, 0.06, 0.06, 0.3, C.T4);
      });
      B.box(0, 0.7, -1.95, 2.0, 0.65, 0.08, C.glass); B.box(0, 0.05, -1.95, 2.0, 0.65, 0.08, C.T2);
      B.box(-0.97, 0.7, -1.95, 0.1, 0.65, 0.12, C.T3); B.box(0.97, 0.7, -1.95, 0.1, 0.65, 0.12, C.T3);
      var roof = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 3.8), new THREE.MeshLambertMaterial({ color: 0xb7b19f }));
      roof.rotation.x = Math.PI / 2; roof.position.set(0, 1.4, -0.3); B.scene.add(roof);
      B.box(0, 1.34, -0.4, 0.5, 0.05, 0.25, C.white);
      B.box(-1.0, 1.3, -0.3, 0.1, 0.1, 3.6, C.T3, { edge: false }); B.box(1.0, 1.3, -0.3, 0.1, 0.1, 3.6, C.T3, { edge: false });
      // front seats
      [-0.45, 0.45].forEach(function (x) {
        B.box(x, 0.06, 0.0, 0.52, 0.32, 0.55, 0xb3ac98); B.box(x, 0.38, 0.0, 0.5, 0.05, 0.52, 0xbdb6a1);
        B.box(x, 0.38, -0.34, 0.5, 0.7, 0.13, 0xb3ac98); B.box(x, 1.06, -0.34, 0.26, 0.2, 0.1, 0xb3ac98);
      });
      // rear bench
      B.box(0, 0.06, -1.15, 1.8, 0.32, 0.55, 0xb3ac98); B.box(0, 0.38, -1.15, 1.76, 0.05, 0.5, 0xbdb6a1); B.box(0, 0.38, -1.5, 1.8, 0.72, 0.13, 0xb3ac98);
      // dash
      B.box(0, 0.04, 0.95, 2.0, 0.85, 0.6, C.T4);
      B.box(-0.5, 0.88, 0.8, 0.5, 0.05, 0.12, C.T3); B.box(0.5, 0.88, 0.8, 0.5, 0.05, 0.12, C.T3); B.box(0, 0.7, 0.64, 0.4, 0.2, 0.04, C.dark);
      var wheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.016, 10, 36), B.ink);
      wheel.position.set(-0.45, 0.98, 0.62); wheel.rotation.x = -0.35; B.scene.add(wheel);
      var spoke = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.03, 0.03), B.ink); spoke.position.copy(wheel.position); spoke.rotation.x = -0.35; B.scene.add(spoke);
      var hub = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), B.ink); hub.position.copy(wheel.position); B.scene.add(hub);
    }
  }
};

function bench(B, ctx) {
  var W = Math.max(2.4, ctx.span + 1.2), z = -0.1;
  B.box(0, 0.4, z, W, 0.05, 0.55, 0xc3bca8);
  B.box(0, 0.65, -0.37, W, 0.12, 0.05, 0xc3bca8); B.box(0, 0.9, -0.37, W, 0.12, 0.05, 0xc3bca8);
  [-1, 1].forEach(function (s) { B.box(s * (W / 2 - 0.1), 0, z, 0.07, 1.0, 0.55, C.T4, { edge: true }); });
}

/* ------------------------------------------------------------------ */
/* Arrangement + cameras                                               */
/* ------------------------------------------------------------------ */
function seatHeight(loc, id) {
  if (loc.seatH) return loc.seatH;
  if (loc.seat === 'stool') return id === 'kid' ? 0.34 : 0.45;
  return 0.45;
}

function arrange(locId, loc, ids, viewerMode, pose) {
  var placed = [];
  var sit = pose === 'sit';
  var slots = locId === 'car' ? [{ x: -0.45, z: 0 }, { x: 0.45, z: 0 }, { x: 0, z: -1.15 }] : null;
  if (slots) {
    ids.forEach(function (id, k) { var s = slots[Math.min(k, 2)]; placed.push({ id: id, x: s.x, z: s.z, viewer: viewerMode && k === 0, slot: k }); });
  } else if (viewerMode) {
    var others = ids.slice(1);
    var ospan = Math.max(0, others.length - 1) * 0.95;
    placed.push({ id: ids[0], x: -(ospan / 2 + 0.9), z: (sit && loc.table) ? 1.38 : 1.75, viewer: true });
    others.forEach(function (id, k) { placed.push({ id: id, x: (k - (others.length - 1) / 2) * 0.95, z: 0 }); });
  } else {
    ids.forEach(function (id, k) { placed.push({ id: id, x: (k - (ids.length - 1) / 2) * 0.95, z: 0 }); });
  }
  // facing
  var cl = placed.filter(function (p) { return !p.viewer; });
  var cx = cl.length ? cl.reduce(function (a, p) { return a + p.x; }, 0) / cl.length : 0;
  var cz = cl.length ? cl.reduce(function (a, p) { return a + p.z; }, 0) / cl.length : -1.5;
  placed.forEach(function (p) {
    if (viewerMode) {
      var V = placed[0];
      if (p.viewer) p.yaw = Math.atan2(cx - p.x, cz - p.z);
      else p.yaw = Math.atan2(V.x - p.x, V.z - p.z);
    } else {
      p.yaw = placed.length > 1 && !(slots && p.slot === 2) ? -Math.sign(p.x - cx) * 0.32 * (Math.abs(p.x - cx) > 0.01 ? 1 : 0) : 0;
    }
  });
  return placed;
}

function fitDist(h, w, vf, A) {
  var t = Math.tan(THREE.MathUtils.degToRad(vf) / 2);
  return Math.max(h / 2 / t, w / 2 / (t * A));
}
function fovFor(h, w, d, A) {
  var a = 2 * Math.atan(h / 2 / d), b = 2 * Math.atan(w / 2 / (d * A));
  return THREE.MathUtils.radToDeg(Math.max(a, b));
}

function rig(angle, ctx, A) {
  var S = ctx.placed.filter(function (p) { return !p.viewer; });
  var Mt = ctx.metrics;
  var loc = ctx.loc;
  var out = { pos: V3(0, 1.4, 6), target: V3(0, 1, 0), fov: 40, roll: 0 };
  function place(target, back, h, w, vf, maxD) {
    var d = fitDist(h, w, vf, A), fov = vf;
    var lim = maxD || loc.maxDist;
    if (lim && d > lim) { d = lim; fov = Math.min(105, fovFor(h, w, d, A)); }
    out.target = target; out.fov = fov; out.pos = target.clone().add(back.clone().multiplyScalar(d));
    if (loc.maxDist) out.pos.y = Math.max(out.pos.y, 1.06);
  }
  var cx = S.length ? S.reduce(function (a, p) { return a + p.x; }, 0) / S.length : 0;
  var cz = S.length ? S.reduce(function (a, p) { return a + p.z; }, 0) / S.length : -1.2;
  var spanX = S.length ? Math.max.apply(null, S.map(function (p) { return p.x; })) - Math.min.apply(null, S.map(function (p) { return p.x; })) : 0;
  var top = S.length ? Math.max.apply(null, S.map(function (p) { return Mt[p.id].top; })) : 1.7;
  var hipMin = S.length ? Math.min.apply(null, S.map(function (p) { return Mt[p.id].hipY; })) : 0.9;
  var shMin = S.length ? Math.min.apply(null, S.map(function (p) { return Mt[p.id].shY; })) : 1.4;
    var back = V3(0, 0, 1);

  switch (angle) {
    case 'wide':
      if (ctx.locId === 'car') place(V3(0, 0.8, -0.3), back, 1.6, 2.2, 55);
      else { var dw = Math.max(6.2, fitDist(2.2, spanX + 3.2, 45, A) * 1.0); out.target = V3(cx, 1.0, cz - 0.4); out.fov = 45; out.pos = V3(cx, 1.55, cz + dw); }
      break;
    case 'full':
      place(V3(cx, top / 2, cz), back, top + 0.4, spanX + 1.7, 34); break;
    case 'close':
      place(V3(cx, (shMin - 0.12 + top + 0.12) / 2, cz), back, top - shMin + 0.7, spanX + 0.85, 26); break;
    case 'ecu': {
      var f = S[0], m = Mt[f.id], R = m.R;
      var hp = V3(f.x, m.headY - 0.01, f.z), fw = V3(Math.sin(f.yaw), 0, Math.cos(f.yaw));
      place(hp, fw, R * 2.1, R * 2.8, 22, 3); break;
    }
    case 'ots': {
      var V = ctx.placed[0], vm = Mt[V.id];
      var O = V3(cx, 0, S.length ? cz : -2);
      var hv = V3(V.x, vm.headY, V.z);
      if (ctx.locId === 'car') { out.pos = V3(-0.42, 1.32, -0.66); out.target = V3(0.3, 1.0, 0.05); out.fov = A >= 1 ? 62 : 95; break; }
      var dir = V3(O.x - V.x, 0, O.z - V.z).normalize(), right = new THREE.Vector3().crossVectors(dir, V3(0, 1, 0));
      out.pos = hv.clone().addScaledVector(dir, -0.9).addScaledVector(right, 0.68); out.pos.y += 0.1;
      out.target = V3(O.x, S.length ? top * 0.82 : vm.headY, O.z); out.fov = Math.max(40, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(64) / 2) / Math.max(A, 0.3)))); if (A >= 1) out.fov = 40; break;
    }
    case 'pov': {
      var V2 = ctx.placed[0], vm2 = Mt[V2.id];
      var O2 = V3(cx, 0, S.length ? cz : -2);
      var fwd = V3(O2.x - V2.x, 0, O2.z - V2.z).normalize();
      out.pos = V3(V2.x, vm2.headY - 0.02, V2.z).addScaledVector(fwd, 0.12);
      out.target = V3(O2.x, S.length ? top * 0.85 : vm2.headY - 0.15, O2.z); out.fov = 64; break;
    }
    case 'low': {
      var tz = V3(cx, top * 0.6, cz), dl = fitDist(top * 1.55, spanX + 1.6, 42, A);
      if (loc.maxDist) { out.target = V3(cx, top * 0.85, cz); out.fov = Math.min(100, Math.max(45, fovFor(top * 1.5, spanX + 1.2, 1.0, A))); out.pos = V3(cx * 0.5, 0.28, cz + 1.0); }
      else if (ctx.pose === 'sit' && loc.table) { out.target = tz; out.fov = 46; out.pos = V3(cx - spanX / 2 - 1.5, 0.28, cz + dl * 0.75); }
      else { out.target = tz; out.fov = 42; out.pos = V3(cx, 0.22, cz + dl); }
      break;
    }
    case 'high': {
      if (loc.maxDist) { out.target = V3(cx, 0.55, cz); out.fov = Math.min(100, Math.max(45, fovFor(top * 1.3, spanX + 1.2, 1.0, A))); out.pos = V3(cx * 0.5, 1.3, cz + 1.0); break; }
      var tg = V3(cx, 0.55, cz), dh = fitDist(top * 1.5, spanX + 1.6, 40, A);
      var el = THREE.MathUtils.degToRad(48);
      out.target = tg; out.fov = 40; out.pos = tg.clone().add(V3(0, Math.sin(el) * dh, Math.cos(el) * dh)); break;
    }
    case 'dutch':
      place(V3(cx, (hipMin + top + 0.2) / 2 - 0.05, cz), back, top - hipMin + 0.5, spanX + 1.8, 32);
      out.roll = THREE.MathUtils.degToRad(12); break;
    default: // mid
      place(V3(cx, (hipMin + top + 0.2) / 2, cz), back, top - hipMin + 0.4, spanX + 1.8, 30);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */
var renderer = null;
function getRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  return renderer;
}

export function renderPanel(opts, width, height, target) {
  var loc = LOCATIONS_3D[opts.loc] || LOCATIONS_3D.cafe;
  var locId = LOCATIONS_3D[opts.loc] ? opts.loc : 'cafe';
  var angle = opts.angle || 'wide';
  var pose = loc.forceSit ? 'sit' : (opts.pose || 'stand');
  var mood = opts.mood || 'neutral';
  var ids = (opts.chars || []).filter(function (id) { return CH[id]; });
  var viewerMode = (angle === 'ots' || angle === 'pov') && ids.length > 0;
  var A = width / height;

  var B = new Builder();
  B.scene.background = new THREE.Color(loc.sky != null ? loc.sky : PAPER);
  var placed = arrange(locId, loc, ids, viewerMode, pose);
  var metricsById = {};
  var sitting = pose === 'sit';
  placed.forEach(function (p) { metricsById[p.id] = metrics(CH[p.id], pose, seatHeight(loc, p.id)); });
  var xs = placed.filter(function (p) { return !p.viewer; }).map(function (p) { return p.x; });
  var span = xs.length ? Math.max.apply(null, xs) - Math.min.apply(null, xs) : 0;
  var hasViewer = viewerMode;
  var tableZ = hasViewer ? 0.67 : 0.67;
  var ctx = { placed: placed, pose: pose, span: span, hasViewer: hasViewer, tableZ: tableZ, metrics: metricsById, loc: loc, locId: locId };

  loc.build(B, ctx);

  // seats under sitters that are not on built-in furniture
  placed.forEach(function (p) {
    var sh = seatHeight(loc, p.id);
    if (sitting && (loc.seat === 'stool' || (p.viewer && locId !== 'car'))) stool(B, p.x, p.z - 0.02 * Math.cos(p.yaw), sh, C.T3);
  });

  // characters
  placed.forEach(function (p) {
    if (viewerMode && p.viewer && angle === 'pov') return;
    var hand = null;
    if (sitting && loc.table) hand = { y: 0.76, f: 0.34 };
    if (locId === 'car' && p.slot === 0) hand = { y: 0.98, f: 0.6 };
    var ch = makeChar(B, p.id, pose, mood, seatHeight(loc, p.id), hand);
    ch.group.position.set(p.x, 0, p.z); ch.group.rotation.y = p.yaw;
    B.scene.add(ch.group);
    if (!sitting && locId !== 'car') {
      var sh = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.13, depthWrite: false }));
      sh.rotation.x = -Math.PI / 2; sh.position.set(p.x, 0.012, p.z); B.scene.add(sh);
    }
  });

  B.finish();

  // camera
  var R = rig(angle, ctx, A);
  var cam = new THREE.PerspectiveCamera(R.fov, A, 0.03, 300);
  cam.position.copy(R.pos);
  cam.up.set(Math.sin(R.roll), Math.cos(R.roll), 0);
  cam.lookAt(R.target);
  B.scene.add(cam);

  // POV hands
  if (angle === 'pov' && viewerMode) {
    [-1, 1].forEach(function (s) {
      var a = V3(s * 0.36, -0.38, -0.3), b = V3(s * 0.17, -0.22, -0.66);
      var v = new THREE.Vector3().subVectors(b, a), len = v.length();
      var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 10), B.ink);
      arm.position.copy(a).addScaledVector(v, 0.5); arm.quaternion.setFromUnitVectors(V3(0, 1, 0), v.clone().normalize()); cam.add(arm);
      var hd = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), B.flatWhite); hd.position.copy(b); cam.add(hd);
      var hh = new THREE.Mesh(hd.geometry, B.hull); hh.position.copy(b); cam.add(hh);
    });
  }

  var r = getRenderer();
  r.setSize(width, height, false);
  B.setPixels(width, height, R.fov);
  r.render(B.scene, cam);

  var out = target || document.createElement('canvas');
  out.width = width; out.height = height;
  var g = out.getContext('2d');
  g.drawImage(r.domElement, 0, 0, width, height);
  B.dispose();
  return out;
}
