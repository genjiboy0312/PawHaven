export const PET_IDS = ['corgi','myeongrang','tuxedo'] as const;
export type PetId = typeof PET_IDS[number];
export const PET_CATALOG = {
  corgi: { name:'corgi', category:'petDogs', price:0, thumbnail:'./assets/characters/corgi/corgi-idle-walk.png' },
  myeongrang: { name:'myeongrang', category:'petDogs', price:500, thumbnail:'./assets/characters/myeongrang/idle.png' },
  tuxedo: { name:'tuxedo', category:'petCats', price:500, thumbnail:'./assets/characters/tuxedo/atlas.png' },
} as const;
export const isPetId = (value: unknown): value is PetId => typeof value==='string' && (PET_IDS as readonly string[]).includes(value);
export const petInfo = (id:string) => isPetId(id) ? PET_CATALOG[id] : undefined;
export const petThumbnail = (id:string):string => petInfo(id)?.thumbnail ?? PET_CATALOG.corgi.thumbnail;
