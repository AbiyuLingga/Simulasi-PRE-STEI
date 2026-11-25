import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function mergeSafe(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const normalized = parts.map((raw) => {
    const g = raw.index ? raw.toNonIndexed() : raw.clone();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    raw.dispose();
    return g;
  });
  const merged = mergeGeometries(normalized, false);
  for (const g of normalized) g.dispose();
  if (!merged) throw new Error('Failed to merge connector geometries');
  merged.computeBoundingSphere();
  return merged;
}

/** Exact axial step (m) so stacked banana plugs insert flush into the rear 4mm stacking socket of the plug below. */
export const BANANA_STACK_STEP = 0.025;

/** Local wire exit point & tangent at the tip of the angled bottom-rear strain-relief boot on a stackable banana plug. */
export const BANANA_WIRE_EXIT_LOCAL = new THREE.Vector3(0, 0.0286, 0.0114);
export const BANANA_WIRE_TAN_LOCAL = new THREE.Vector3(0, 0.72, 0.69).normalize();

/** Local wire exit Y on the PVC alligator clip sleeve. */
export const ALLIGATOR_WIRE_EXIT_Y = 0.0285;

export interface ConnectorGeoPack {
  bananaHousing: THREE.BufferGeometry;
  bananaMetal: THREE.BufferGeometry;
  bananaDarkDetail: THREE.BufferGeometry;
  bananaTipCap: THREE.BufferGeometry;
  alligatorBoot: THREE.BufferGeometry;
  alligatorJaws: THREE.BufferGeometry;
  bncMetal: THREE.BufferGeometry;
  bncBoot: THREE.BufferGeometry;
  bncRing: THREE.BufferGeometry;
}

let cachedPack: ConnectorGeoPack | null = null;

function buildBananaGeos(): Pick<
  ConnectorGeoPack,
  'bananaHousing' | 'bananaMetal' | 'bananaDarkDetail' | 'bananaTipCap'
> {
  // 1. Colored molded housing: front nose collar + rectangular ribbed stackable block + slanted lower skirt + angled boot
  const housingParts: THREE.BufferGeometry[] = [];

  // Cylindrical front nose collar (y = 0..0.0072)
  const collar = new THREE.CylinderGeometry(0.0042, 0.0043, 0.0072, 14);
  collar.translate(0, 0.0036, 0);
  housingParts.push(collar);

  // Main rectangular stackable block (y = 0.0072..0.0250)
  const body = new THREE.BoxGeometry(0.0086, 0.0178, 0.0102);
  body.translate(0, 0.0161, 0.0006);
  housingParts.push(body);

  // 6 tactile grip ridges along housing (matching Pomona/Hirschmann ribbed lab plug)
  for (let i = 0; i < 6; i++) {
    const rib = new THREE.BoxGeometry(0.0091, 0.00095, 0.0107);
    rib.translate(0, 0.0095 + i * 0.00205, 0.0006);
    housingParts.push(rib);
  }

  // Slanted bottom-rear belly skirt (angled downward along +Z)
  const skirt = new THREE.BoxGeometry(0.0078, 0.0116, 0.0056);
  skirt.rotateX(0.46);
  skirt.translate(0, 0.0185, 0.0062);
  housingParts.push(skirt);

  // Angled strain-relief cable boot exiting bottom-rear so stacked plugs clear the wire cleanly
  const boot = new THREE.CylinderGeometry(0.0027, 0.0036, 0.0096, 10);
  boot.rotateX(0.74);
  boot.translate(0, 0.0256, 0.0086);
  housingParts.push(boot);

  // 2. Bright nickel/chrome 4mm spring-lantern pin + rear 4mm stacking bushing ring
  const metalParts: THREE.BufferGeometry[] = [];
  const pinCore = new THREE.CylinderGeometry(0.0018, 0.00165, 0.0098, 12);
  pinCore.translate(0, -0.0049, 0);
  metalParts.push(pinCore);

  // Spring-lantern bulged leaf profile
  const leafTop = new THREE.CylinderGeometry(0.0019, 0.00235, 0.0038, 8);
  leafTop.translate(0, -0.0039, 0);
  metalParts.push(leafTop);

  const leafBot = new THREE.CylinderGeometry(0.00235, 0.00185, 0.0038, 8);
  leafBot.translate(0, -0.0075, 0);
  metalParts.push(leafBot);

  // Rear coaxial 4mm stacking socket metallic bushing on flat rear face (y = 0.0250)
  const rearRing = new THREE.CylinderGeometry(0.0031, 0.0031, 0.0008, 14);
  rearRing.translate(0, 0.0249, 0);
  metalParts.push(rearRing);

  // 3. Dark recessed rear 4mm stacking bore + side accent strip
  const darkParts: THREE.BufferGeometry[] = [];
  const rearBore = new THREE.CylinderGeometry(0.00215, 0.00215, 0.0011, 12);
  rearBore.translate(0, 0.0250, 0);
  darkParts.push(rearBore);

  const sideStrip = new THREE.BoxGeometry(0.0092, 0.0102, 0.0022);
  sideStrip.translate(0, 0.0155, 0.0003);
  darkParts.push(sideStrip);

  // 4. Iconic rounded insulated pin tip cap (visible when unplugged/resting)
  const tipCap = new THREE.SphereGeometry(0.00175, 10, 8);
  tipCap.scale(1, 1.15, 1);
  tipCap.translate(0, -0.0102, 0);

  return {
    bananaHousing: mergeSafe(housingParts),
    bananaMetal: mergeSafe(metalParts),
    bananaDarkDetail: mergeSafe(darkParts),
    bananaTipCap: tipCap,
  };
}

function buildAlligatorGeos(): Pick<ConnectorGeoPack, 'alligatorBoot' | 'alligatorJaws'> {
  // 1. Classic soft glossy PVC insulating sleeve (sleek contoured teardrop lathe profile matching lab mini alligator clips)
  const profile = [
    new THREE.Vector2(0.0021, 0.0086),
    new THREE.Vector2(0.0031, 0.0102),
    new THREE.Vector2(0.0040, 0.0132),
    new THREE.Vector2(0.0043, 0.0168),
    new THREE.Vector2(0.0038, 0.0205),
    new THREE.Vector2(0.0025, 0.0235),
    new THREE.Vector2(0.0019, 0.0258),
    new THREE.Vector2(0.0021, 0.0276),
    new THREE.Vector2(0.0014, 0.0285),
  ];
  const boot = new THREE.LatheGeometry(profile, 16);
  // Subtle oval pinch cross-section like real flexible PVC alligator sleeves
  boot.scale(0.82, 1.0, 1.12);
  boot.computeVertexNormals();
  boot.computeBoundingSphere();

  // 2. Stamped chrome alligator jaws with visible triangular serrated teeth!
  const buildSingleJaw = (sideSign: 1 | -1): THREE.BufferGeometry => {
    const shape = new THREE.Shape();
    shape.moveTo(0.00028, 0.0003);
    shape.lineTo(0.00095, 0.0012);
    shape.lineTo(0.00028, 0.0021);
    shape.lineTo(0.00098, 0.0030);
    shape.lineTo(0.0003, 0.0040);
    shape.lineTo(0.0010, 0.0050);
    shape.lineTo(0.00032, 0.0061);
    shape.lineTo(0.00105, 0.0072);
    shape.lineTo(0.00055, 0.0102);
    // Outer tapered metal spine back down to tip
    shape.lineTo(0.00195, 0.0102);
    shape.lineTo(0.00175, 0.0050);
    shape.lineTo(0.0012, 0.0007);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.0026,
      bevelEnabled: false,
      curveSegments: 2,
    });
    geo.translate(0, 0, -0.0013);
    geo.rotateY(sideSign === 1 ? -Math.PI / 2 : Math.PI / 2);
    geo.rotateX(sideSign * 0.045);
    return geo;
  };

  const jawParts: THREE.BufferGeometry[] = [buildSingleJaw(1), buildSingleJaw(-1)];
  const rivet = new THREE.CylinderGeometry(0.00095, 0.00095, 0.0036, 10);
  rivet.rotateZ(Math.PI / 2);
  rivet.translate(0, 0.0086, 0);
  jawParts.push(rivet);

  return {
    alligatorBoot: boot,
    alligatorJaws: mergeSafe(jawParts),
  };
}

function buildBncGeos(): Pick<ConnectorGeoPack, 'bncMetal' | 'bncBoot' | 'bncRing'> {
  const metalParts: THREE.BufferGeometry[] = [];
  const barrel = new THREE.CylinderGeometry(0.0066, 0.0066, 0.0135, 16);
  barrel.translate(0, 0.0042, 0);
  metalParts.push(barrel);

  const knurl = new THREE.CylinderGeometry(0.0071, 0.0071, 0.0055, 12);
  knurl.translate(0, 0.0068, 0);
  metalParts.push(knurl);

  const bootParts: THREE.BufferGeometry[] = [];
  const rearBoot = new THREE.CylinderGeometry(0.0044, 0.0062, 0.014, 14);
  rearBoot.translate(0, 0.0175, 0);
  bootParts.push(rearBoot);

  const strain = new THREE.CylinderGeometry(0.0032, 0.0042, 0.009, 10);
  strain.translate(0, 0.028, 0);
  bootParts.push(strain);

  const ring = new THREE.CylinderGeometry(0.0072, 0.0072, 0.0036, 16);
  ring.translate(0, 0.0124, 0);

  return {
    bncMetal: mergeSafe(metalParts),
    bncBoot: mergeSafe(bootParts),
    bncRing: ring,
  };
}

export function getConnectorGeometries(): ConnectorGeoPack {
  if (!cachedPack) {
    cachedPack = {
      ...buildBananaGeos(),
      ...buildAlligatorGeos(),
      ...buildBncGeos(),
    };
  }
  return cachedPack;
}
