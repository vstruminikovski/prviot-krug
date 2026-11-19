// Independent deterministic random streams, so adding scenery never changes traffic or scenario outcomes.
import { rng, type Rng } from '../math';

export interface Streams { world: Rng; traffic: Rng; scenario: Rng; ped: Rng }

function hash(seed: number, salt: string) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

export function streams(seed: number): Streams {
  return { world: rng(hash(seed, 'world')), traffic: rng(hash(seed, 'traffic')), scenario: rng(hash(seed, 'scenario')), ped: rng(hash(seed, 'ped')) };
}

export const randomSeed = () => (Math.floor(Math.random() * 0x7fffffff) >>> 0) || 1;
