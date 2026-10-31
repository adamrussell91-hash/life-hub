// packages/walkthrus/tiles.mjs
// A tile on the board is a book technique or a fusion Adam built from two or three of them.
// Fusions behave like techniques everywhere (clusters, arrows, goals, reps, Proof), so anything
// that accepts a technique id should accept a tile id.
import { isTechniqueId } from './catalogue.mjs';

const FUSION = /^fu_[a-z0-9]{6,24}$/;

export const isFusionId = (id) => typeof id === 'string' && FUSION.test(id);
export const isTileId = (id) => isTechniqueId(id) || isFusionId(id);
export const newFusionId = () => `fu_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
