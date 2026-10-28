export interface Camera { k: number; x: number; y: number }
export interface CameraAnim { from: Camera; to: Camera; t0: number; dur: number }
export interface Viewport { w: number; h: number }
export interface WorldFrame { x: number; y: number; w: number; h: number }
export const MIN_K: number;
export const MAX_K: number;
export const KEY_PAN: number;
export function createCamera(partial?: Partial<Camera>): Camera;
export function cloneCamera(c: Camera): Camera;
export function assignCamera(dest: Camera, src: Camera): void;
export function toWorld(cam: Camera, sx: number, sy: number): [number, number];
export function toScreen(cam: Camera, wx: number, wy: number): [number, number];
export function clampK(k: number, min?: number, max?: number): number;
export function zoomAt(cam: Camera, sx: number, sy: number, factor: number, min?: number, max?: number): void;
export function panBy(cam: Camera, dx: number, dy: number): void;
export function wheelZoom(cam: Camera, sx: number, sy: number, deltaY: number, min?: number, max?: number): void;
export function fitFrameCamera(frame: WorldFrame, viewport: Viewport, pad?: number, min?: number, max?: number): Camera;
export function focusPoint(cam: Camera, viewport: Viewport, wx: number, wy: number, k?: number, offsetX?: number): Camera;
export function retainCentre(cam: Camera, prev: Viewport, next: Viewport): void;
export function animateTo(cam: Camera, target: Camera, options?: { reduceMotion?: boolean; now?: number; dur?: number }): CameraAnim | null;
export function tickCamera(cam: Camera, anim: CameraAnim, now: number): boolean;
export type CameraKeyResult = { kind: 'zoom'; factor: number } | { kind: 'fit' } | { kind: 'pan' } | { kind: 'escape' } | { kind: 'none' };
export function cameraKey(key: string, cam: Camera, step?: number): CameraKeyResult;
