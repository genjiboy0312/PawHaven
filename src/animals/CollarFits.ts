import type { CollarFit, AttachmentArt } from './AttachmentFit';

/** Neck-local calibration, shared by collar items; height is independent of width. */
export const COLLAR_FITS: Readonly<Partial<Record<string, CollarFit>>> = {
  corgi: { x: -.524, y: -.468, width: 2.51, height: .70, rotation: .09 },
  myeongrang: { x: -.418, y: -.537, width: 2.023, height: .65, rotation: -.022,
    poses: { run: {x: -.58, y: -.18, width: 1.85, rotation: .12} } },
  tuxedo: { x: -.263, y: -.074, width: 1.904, height: .55, rotation: .046,
    poses: {walk: {y:.02}, run: {x:-.35,y:0,width:1.7}, jump:{y:-.35}} },
};

/** Front-only resource: never reuse the removed rear-rim landmarks. */
export const KARAKUSA_SCARF_ART: AttachmentArt = {
  width: 1536, height: 1024,
  mount: { back: { x: 245, y: 300 }, front: { x: 1260, y: 395 } }, depth: 385,
};
