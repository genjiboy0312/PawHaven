import type { CollarFit, AttachmentArt } from './AttachmentFit';

/** Anatomy only: offsets/width are relative to each frame's existing neck landmark. */
export const COLLAR_FITS: Readonly<Partial<Record<string, CollarFit>>> = {
  corgi: { x: -.35, y: -.32, width: 1.45 },
  myeongrang: { x: -.40, y: -.35, width: 1.40 },
  tuxedo: { x: -.40, y: -.28, width: 1.25 },
};

/** Approved prototype seam. Not a shop product or a grant of ownership. */
export const KARAKUSA_SCARF_ART: AttachmentArt = {
  width: 1536, height: 1024,
  mount: { back: { x: 250, y: 330 }, front: { x: 1130, y: 410 } },
};
