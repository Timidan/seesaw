import * as k from '../../iso/iso-kit';

export const WIDTH = 800;
export const HEIGHT = 540;
export const BEAM_Z = 153;
export const LEFT = -114;
export const PAN_Z = 61;
export const BASE: k.Plan = { x: -178, y: -64, w: 346, d: 140, r: 10 };
export const P = k.fitProjection([
  ...k.boxCorners(BASE, -25, 0), [-153, 10, 246], [133, 15, 215],
], WIDTH, HEIGHT, { pad: 35, azimuth: 65, elevation: 28 });
export const at = (p: k.Point3) => k.iso(p, P);
export const slab = (x: number, y: number, w: number, d: number, z: number, h: number, r = 1.5, bevel = 0.6) =>
  k.slabOf({ x, y, w, d, r }, z, h, P, 6, bevel);
export const cyl = (x: number, y: number, r: number, z: number, h: number, bevel = 0.3) =>
  k.cylinder(x, y, r, z, h, P, 64, bevel);

export type Part = {
  id: string;
  paths: k.SolidPaths;
  tone: k.Tone;
  material?: string;
  detail?: string;
};

// A convex profile in the beam's x/z plane, extruded along y.
export function profilePart(profile: k.Plane[], y: number, depth: number, angle = 0): k.SolidPaths {
  const rotate = ([x, z]: k.Plane, py: number): k.Point3 => [
    x * Math.cos(angle) - (z - BEAM_Z) * Math.sin(angle), py,
    BEAM_Z + x * Math.sin(angle) + (z - BEAM_Z) * Math.cos(angle),
  ];
  const back = profile.map(p => at(rotate(p, y)));
  const front = profile.map(p => at(rotate(p, y + depth)));
  const face = k.pathOf(front, true);
  const sides: string[] = [];
  const edges: string[] = [];
  const shades = ['', '', '', ''];
  const a = (P.azimuth ?? 45) * Math.PI / 180;
  const e = (P.elevation ?? 30) * Math.PI / 180;
  for (let i = 0; i < profile.length; i++) {
    const j = (i + 1) % profile.length;
    const pa = rotate(profile[i], y), pb = rotate(profile[j], y);
    const dx = pb[0] - pa[0], dz = pb[2] - pa[2];
    // Profiles are counterclockwise in x/z. Outward normal = (dz, -dx).
    if (dz * Math.cos(a) * Math.cos(e) - dx * Math.sin(e) <= 0) continue;
    const d = k.pathOf([back[i], back[j], front[j], front[i]], true);
    const shade = -dx > Math.abs(dz) ? 3 : dz > 0 ? 2 : 0;
    shades[shade] += d;
    sides.push(d);
    edges.push(k.pathOf([back[i], back[j], front[j]]));
  }
  return { fill: face + sides.join(''), top: '', shades: [shades[0], face, shades[2], shades[3]],
    outline: k.pathOf(front, true) + edges.join(''), crease: '', bevel: '' };
}

export function beamPaths(right: number, angle: number) {
  const bar = (bottom: number, top: number, y: number, d: number) => profilePart([
    [LEFT - 8, bottom], [right + 8, bottom], [right + 8, top], [LEFT - 8, top],
  ], y, d, angle);
  return [bar(148, 150, -6, 12), bar(150, 157, -3, 6), bar(157, 159, -6, 12)];
}

export function beamRule(right: number, angle: number) {
  const marks: string[]=[];
  for(let x=-112;x<right-4;x+=8) {
    const point=(z:number): k.Point3=>[x*Math.cos(angle)-(z-BEAM_Z)*Math.sin(angle),3,BEAM_Z+x*Math.sin(angle)+(z-BEAM_Z)*Math.cos(angle)];
    marks.push(k.segment(point(157),point(157-(x%32===0?4.2:2.2)),P));
  }
  return marks.join('');
}

export function panOffset(x: number, angle: number) {
  return [x * (Math.cos(angle) - 1), 0, x * Math.sin(angle)] as k.Point3;
}

export const DIAL = { x: 65, y: 43, r: 23, z: 12, top: 22 };
export const DIAL_MATRIX = k.topMatrix([DIAL.x, DIAL.y], DIAL.top + 0.2, P);
export const COIN_AT: k.Point3 = [LEFT + 13, 19, PAN_Z + 2];
export const COIN_START: k.Point3 = [LEFT + 10, 28, 202];
export const coin = cyl(0, 0, 5.4, 0, 2.2, 0.35);
export const coinRim = k.ring(0, 0, 3.9, 2.2, P, 64);

export function returnSpring(rise = 0) {
  const paths = { back:'', front:'' };
  const points: k.Point3[] = Array.from({length:353},(_,i)=>{
    const angle=i/16*Math.PI*2;
    return [18+4.6*Math.cos(angle),28+4.6*Math.sin(angle),36.2+(103+rise)*i/352];
  });
  for(let i=0;i<352;i++) {
    const angle=(i+0.5)/16*Math.PI*2;
    const side=Math.cos(angle)*Math.cos(65*Math.PI/180)+Math.sin(angle)*Math.sin(65*Math.PI/180)>0?'front':'back';
    paths[side]+=k.segment(points[i],points[i+1],P);
  }
  return paths;
}

export function makeGeometry(beta: number) {
  const right = -LEFT / beta;
  const parts: Part[] = [];
  const group = () => {
    const items: Part[] = [];
    const put = (id: string, paths: k.SolidPaths, tone: k.Tone = 'mid', material?: string, detail?: string) => {
      const part = { id, paths, tone, material, detail }; items.push(part); parts.push(part); return part;
    };
    const screw = (id: string, x: number, y: number, z: number, r = 1.8) => put(id, cyl(x, y, r, z, 0.8), 'mid', 'steel',
      k.lineOnTop([x - r * 0.7, y - r * 0.7], [x + r * 0.7, y + r * 0.7], z + 0.8, P));
    return { items, put, screw };
  };

  const base = group();
  k.corners(BASE, 23).sort((a, b) => k.depthOf([...a, 0], P) - k.depthOf([...b, 0], P)).forEach(([x,y], i) => {
    base.put(`rubber-foot-${i}`, cyl(x,y,10,-25,3), 'lo', 'rubber');
    base.put(`level-foot-${i}`, cyl(x,y,7.4,-22,7), 'lo', 'steel', k.knurl(x,y,7.4,-22,-15,32,P,0));
  });
  base.put('bench-casting', k.slabOf(BASE,-15,12,P,10,2), 'mid', 'base', k.sideSeam(BASE,-10,P,10));
  base.put('bench-deck', k.slabOf(k.insetPlan(BASE,1),-3,3,P,10,0.9), 'mid', 'steel');
  base.put('work-surface', k.slabOf(k.insetPlan(BASE,8),0,0.7,P,10,0), 'lo', 'rubber');
  k.corners(BASE,14).forEach(([x,y],i)=>base.screw(`bench-screw-${i}`,x,y,0.7,2.2));
  base.put('calibration-rule', slab(-153,64,288,6,0.7,0.7,1,0), 'lo', 'steel');

  const structure = group();
  structure.put('pillar-foot',slab(-24,-23,48,42,0.7,6,4,0.8),'mid','steel');
  structure.screw('pillar-bolt-left',-18,11,6.7,2.4);
  structure.screw('pillar-bolt-right',18,11,6.7,2.4);
  structure.put('pillar',slab(-9,-8,18,16,6.7,128,2,0.9),'mid','steel');
  structure.put('pillar-web',slab(-5,8,10,1.3,19,103,0.8,0),'lo','rubber');
  structure.put('bearing-saddle',slab(-17,-13,34,26,134.7,5,2,0.7),'hi','steel');
  structure.put('knife-edge',profilePart([[-12,139.7],[12,139.7],[0,148]],-9,18),'hi','steel');
  for (const y of [-12,9]) {
    structure.put(`bearing-cheek-${y}`,slab(-5,y,10,3,139.7,8,0.7,0.3),'mid','steel');
    structure.screw(`bearing-screw-${y}`,0,y+1.5,147.7,1.1);
  }
  structure.put('damper-foot',slab(1,20,34,16,0.7,3,2,0.5),'lo','steel');
  structure.put('damper-case',cyl(18,28,7,3.7,30),'mid','steel',k.knurl(18,28,7,3.7,33.7,36,P,0));
  structure.put('damper-cap',cyl(18,28,8,33.7,2.5),'hi','steel',k.ring(18,28,4.6,36.2,P,64));
  structure.put('damper-rod',cyl(18,28,2,36.2,103),'mid','steel');
  structure.put('damper-clevis',slab(13,23,10,10,139.2,6,1,0.4),'hi','steel');
  structure.put('damper-link',slab(16,6,4,22,145.2,2.8,0.8,0.3),'mid','steel');

  const hopper = group();
  hopper.put('hopper-foot',slab(-174,-37,30,25,0.7,4,3,0.6),'lo','steel');
  hopper.screw('hopper-bolt-back',-168,-31,4.7);
  hopper.screw('hopper-bolt-front',-150,-18,4.7);
  hopper.put('hopper-post',slab(-164,-28,8,8,4.7,199.3,1.4,0.6),'mid','steel');
  hopper.put('hopper-arm',slab(-164,-28,17,58,204,4,1,0.6),'mid','steel');
  const outlet: k.Plane[]=[[-155,8],[-89,8],[-89,47],[-96,47],[-96,23],[-112,23],[-112,47],[-155,47]];
  hopper.put('hopper-seat',k.extrude(outlet,208,4,P,{convex:false,bevel:0.4}),'mid','steel');
  hopper.put('hopper-back',slab(-155,8,66,2,212,28,1,0.3),'mid','steel');
  hopper.put('hopper-side-left',slab(-155,10,2,37,212,28,1,0.3),'mid','steel');
  hopper.put('hopper-side-right',slab(-91,10,2,37,212,28,1,0.3),'mid','steel');
  hopper.put('hopper-mouth',k.extrude([[-153,10],[-91,10],[-91,45],[-96,45],[-96,23],[-112,23],[-112,45],[-153,45]],212,0.4,P,{convex:false}),'lo','rubber');
  for (const x of [-142,-126]) for (let i=0;i<2;i++) {
    hopper.put(`hopper-coin-${x}-${i}`,cyl(x,17,5.4,212.4+i*2.2,2.2),'hi','coin',k.ring(x,17,3.9,214.6+i*2.2,P,64));
  }
  hopper.put('hopper-front',slab(-155,45,66,2,212,15,1,0.3),'hi','steel');
  hopper.put('hopper-label',slab(-143,47,42,0.6,216,11,0.6,0),'lo','rubber');
  hopper.put('chute-floor',slab(-112,23,16,15,202,2,1,0.3),'mid','steel');
  hopper.put('chute-left',slab(-114,23,2,15,202,6,0.6,0.2),'mid','steel');
  hopper.put('chute-right',slab(-96,23,2,15,202,6,0.6,0.2),'mid','steel');

  const gate = group();
  gate.put('hour-escapement',slab(-113,24,18,3,200,2,0.6,0.2),'hi','steel');
  gate.put('escapement-spindle',cyl(-94,26,2,200,4),'hi','steel');

  const makePan = (x: number, name: string) => {
    const pan = group();
    pan.put(`${name}-yoke`,slab(x-31,-4,62,8,149,3,1.5,0.5),'hi','steel');
    for (const side of [-1,1]) {
      const px = x+28*side;
      pan.put(`${name}-hanger-${side}`,cyl(px,0,1.4,PAN_Z+5,149-PAN_Z-5,0.1),'mid','steel');
      pan.put(`${name}-collar-${side}`,cyl(px,0,2.8,145,4),'hi','steel');
      pan.put(`${name}-shoe-${side}`,slab(px-3,-4,6,8,PAN_Z+2,3,0.8,0.3),'mid','steel');
    }
    pan.put(`${name}-pan-floor`,slab(x-34,-28,68,58,PAN_Z-2,4,4,0.7),'hi','steel');
    pan.put(`${name}-pan-back`,slab(x-33,-28,66,2,PAN_Z+2,4,0.8,0.3),'mid','steel');
    pan.put(`${name}-pan-left`,slab(x-34,-26,2,54,PAN_Z+2,4,0.8,0.3),'mid','steel');
    pan.put(`${name}-pan-right`,slab(x+32,-26,2,54,PAN_Z+2,4,0.8,0.3),'mid','steel');
    return pan.items;
  };
  const leftPan = makePan(LEFT,'short');
  const rightPan = makePan(right,'hedge');
  const rims = group();
  rims.put('short-pan-front',slab(LEFT-33,28,66,2,PAN_Z+2,4,0.8,0.3),'hi','steel');
  rims.put('hedge-pan-front',slab(right-33,28,66,2,PAN_Z+2,4,0.8,0.3),'hi','steel');

  const weight = (x: number, h: number, name: string) => {
    const g = group();
    g.put(`${name}-weight`,slab(x-24,-21,48,31,PAN_Z+2,h,2.6,1.2),'hi','weight');
    g.put(`${name}-weight-cap`,slab(x-22.5,-19.5,45,28,PAN_Z+2+h,1.4,1.8,0.4),'mid','steel');
    g.put(`${name}-label`,slab(x-22,10,44,0.8,PAN_Z+8,16,0.8,0),'lo','rubber');
    g.put(`${name}-handle-left`,slab(x-8,-7,2.5,5,PAN_Z+3.4+h,5,0.5,0.2),'mid','steel');
    g.put(`${name}-handle-right`,slab(x+5.5,-7,2.5,5,PAN_Z+3.4+h,5,0.5,0.2),'mid','steel');
    g.put(`${name}-handle`,slab(x-8,-7,16,5,PAN_Z+8.4+h,2.5,1,0.4),'hi','steel');
    return g.items;
  };
  const shortWeight = weight(LEFT,30,'short');
  const longWeight = weight(right,30*beta,'hedge');

  const instruments = group();
  instruments.put('counter-housing',slab(-113,42,77,22,0.7,16,3,0.8),'mid','steel');
  instruments.put('counter-window',slab(-108,64,67,1,4,9,1,0),'lo','rubber');
  instruments.put('gauge-foot',slab(DIAL.x-27,16,54,46,0.7,6,4,0.8),'lo','steel');
  instruments.put('gauge-case',cyl(DIAL.x,DIAL.y,DIAL.r,6.7,12),'hi','steel',k.knurl(DIAL.x,DIAL.y,DIAL.r,6.7,18.7,80,P,0));
  instruments.put('gauge-bezel',cyl(DIAL.x,DIAL.y,DIAL.r+0.7,18.7,3.3),'hi','steel');
  instruments.put('gauge-face',cyl(DIAL.x,DIAL.y,DIAL.r-2,22,0.15,0),'lo','rubber');
  instruments.put('gauge-crown',cyl(DIAL.x+27,43,3,8,7),'mid','steel',k.knurl(DIAL.x+27,43,3,8,15,22,P,0));
  instruments.put('zero-adjust',cyl(119,46,7,0.7,5),'mid','steel',k.knurl(119,46,7,0.7,5.7,36,P,0));

  const ticks = k.topTicks(-147,129,4,5,64.6,1.4,[1.8,3.5],P);
  return { right, base:base.items, structure:structure.items, hopper:hopper.items, gate:gate.items,
    leftPan, rightPan, shortWeight, longWeight, rims:rims.items, instruments:instruments.items,
    ticks, parts, beam:beamPaths(right,0), rule:beamRule(right,0) };
}

export type Geometry = ReturnType<typeof makeGeometry>;
