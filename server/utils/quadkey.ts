// QuadKey utilities for Kubra tile system
// Based on Microsoft Bing Maps Tile System: https://docs.microsoft.com/en-us/bingmaps/articles/bing-maps-tile-system

export interface TileCoordinates {
  x: number;
  y: number;
  zoom: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

const MIN_LATITUDE = -85.05112878;
const MAX_LATITUDE = 85.05112878;
const MIN_LONGITUDE = -180;
const MAX_LONGITUDE = 180;

function clip(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function mapSize(zoom: number): number {
  return 256 << zoom;
}

export function latLngToPixelXY(lat: number, lng: number, zoom: number): { x: number; y: number } {
  lat = clip(lat, MIN_LATITUDE, MAX_LATITUDE);
  lng = clip(lng, MIN_LONGITUDE, MAX_LONGITUDE);

  const x = (lng + 180) / 360;
  const sinLatitude = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI);

  const size = mapSize(zoom);
  const pixelX = clip(x * size + 0.5, 0, size - 1);
  const pixelY = clip(y * size + 0.5, 0, size - 1);

  return { x: Math.floor(pixelX), y: Math.floor(pixelY) };
}

export function pixelXYToTileXY(pixelX: number, pixelY: number): { x: number; y: number } {
  return {
    x: Math.floor(pixelX / 256),
    y: Math.floor(pixelY / 256),
  };
}

export function tileXYToQuadKey(tileX: number, tileY: number, zoom: number): string {
  let quadKey = "";
  for (let i = zoom; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((tileX & mask) !== 0) digit++;
    if ((tileY & mask) !== 0) digit += 2;
    quadKey += digit.toString();
  }
  return quadKey;
}

export function latLngToQuadKey(lat: number, lng: number, zoom: number): string {
  const pixel = latLngToPixelXY(lat, lng, zoom);
  const tile = pixelXYToTileXY(pixel.x, pixel.y);
  return tileXYToQuadKey(tile.x, tile.y, zoom);
}

export function quadKeyToTileXY(quadKey: string): TileCoordinates {
  let tileX = 0;
  let tileY = 0;
  const zoom = quadKey.length;

  for (let i = zoom; i > 0; i--) {
    const mask = 1 << (i - 1);
    const digit = parseInt(quadKey[zoom - i]);
    if (digit & 1) tileX |= mask;
    if (digit & 2) tileY |= mask;
  }

  return { x: tileX, y: tileY, zoom };
}

export function quadKeyToLatLng(quadKey: string): LatLng {
  const tile = quadKeyToTileXY(quadKey);
  const pixelX = tile.x * 256;
  const pixelY = tile.y * 256;
  
  const size = mapSize(tile.zoom);
  const x = (clip(pixelX, 0, size - 1) / size) - 0.5;
  const y = 0.5 - (clip(pixelY, 0, size - 1) / size);

  const lat = 90 - 360 * Math.atan(Math.exp(-y * 2 * Math.PI)) / Math.PI;
  const lng = 360 * x;

  return { lat, lng };
}

// Generate quadkeys covering a bounding box
export function getQuadKeysForBounds(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
  zoom: number
): string[] {
  const swPixel = latLngToPixelXY(minLat, minLng, zoom);
  const nePixel = latLngToPixelXY(maxLat, maxLng, zoom);
  
  const swTile = pixelXYToTileXY(swPixel.x, swPixel.y);
  const neTile = pixelXYToTileXY(nePixel.x, nePixel.y);
  
  const minTileX = Math.min(swTile.x, neTile.x);
  const maxTileX = Math.max(swTile.x, neTile.x);
  const minTileY = Math.min(swTile.y, neTile.y);
  const maxTileY = Math.max(swTile.y, neTile.y);
  
  const quadKeys: string[] = [];
  for (let x = minTileX; x <= maxTileX; x++) {
    for (let y = minTileY; y <= maxTileY; y++) {
      quadKeys.push(tileXYToQuadKey(x, y, zoom));
    }
  }
  
  return quadKeys;
}

// Massachusetts bounding box
export const MA_BOUNDS = {
  minLat: 41.2369,
  minLng: -73.5081,
  maxLat: 42.8867,
  maxLng: -69.9286,
};

export function getMassachusettsQuadKeys(zoom: number = 12): string[] {
  return getQuadKeysForBounds(
    MA_BOUNDS.minLat,
    MA_BOUNDS.minLng,
    MA_BOUNDS.maxLat,
    MA_BOUNDS.maxLng,
    zoom
  );
}
