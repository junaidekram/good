# Terrain Setup Guide

## Current Status
⚠️ **The flight simulator currently uses FLAT PROCEDURAL TERRAIN** to avoid 401 authentication errors.

## What's Working
- ✅ OpenStreetMap satellite imagery loads correctly
- ✅ Flat terrain at sea level (no crashes or NaN errors)
- ✅ Collision detection with terrain mesh
- ✅ Smooth tile loading and caching

## What's Missing
- ❌ Real 3D elevation data (mountains, valleys, etc.)

## Why the Change?
The previous OpenTopography service (`cloud.sdsc.edu`) requires authentication and was causing:
- 401 Unauthorized errors
- Fallback terrain with NaN values
- WebGL crashes (`GL_INVALID_OPERATION`)
- Continuous failed tile requests

## How to Add Real Terrain

### Option 1: Mapbox (Recommended - Global Coverage)
Mapbox provides high-quality Terrain-RGB tiles worldwide.

1. **Get a free Mapbox token**: 
   - Sign up at https://account.mapbox.com/
   - Copy your access token

2. **Update tile.js** (both in `src/js/terrain/` and `src/public/js/terrain/`):
   
   Find the `load()` method around line 220 and replace:
   ```javascript
   // Use OpenStreetMap for imagery (free, no auth needed)
   const imageryUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
   
   // ... existing code ...
   
   // Use procedural terrain (flat at sea level) until proper terrain service is configured
   const terrainToUse = await generateProceduralTerrain(this.tileExtents, parseInt(this.tileName))
   const textureToUse = textureBitmap || await generateProceduralTexture(parseInt(this.tileName) + 1000)
   ```
   
   With:
   ```javascript
   const MAPBOX_TOKEN = 'YOUR_TOKEN_HERE' // Add your token
   
   const terrainUrl = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}.pngraw?access_token=${MAPBOX_TOKEN}`
   const imageryUrl = `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}@2x.jpg?access_token=${MAPBOX_TOKEN}`
   
   // Fetch terrain with timeout
   const terrainBitmap = await Promise.race([
     fetchImageData(terrainUrl, `${this.tileName}-terrain`),
     new Promise(r => setTimeout(() => r(null), 3000))
   ])
   
   const textureBitmap = await Promise.race([
     fetchImageData(imageryUrl, `${this.tileName}-imagery`),
     new Promise(r => setTimeout(() => r(null), 3000))
   ])
   
   // Use procedural fallback only if fetch fails
   const terrainToUse = terrainBitmap || await generateProceduralTerrain(this.tileExtents, parseInt(this.tileName))
   const textureToUse = textureBitmap || await generateProceduralTexture(parseInt(this.tileName) + 1000)
   ```

3. **Rebuild and test**:
   ```bash
   cd flightsimulator-master/src
   npm run build
   ```

### Option 2: AWS Terrain Tiles (US Coverage Only)
Free but limited to the United States.

Use this terrain URL:
```javascript
const terrainUrl = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`
```

Note: AWS uses **Terrarium** encoding, not Mapbox's Terrain-RGB. You'll need to update the decoder:
```javascript
// Decode Terrarium to elevation in meters
function decodeTerrainRGB(r, g, b) {
  return (r * 256 + g + b / 256) - 32768
}
```

## How It Works
1. **UTM to Web Mercator conversion**: Your UTM coordinates are converted to tile coordinates
2. **Parallel fetching**: Terrain heightmap and satellite imagery load together
3. **Mesh generation**: Heights are decoded and a 3D mesh is built with proper normals
4. **Caching**: Tiles are cached in memory to avoid re-fetching
5. **Streaming**: Tiles load progressively as you fly (100ms rate limit)

## Running the App

### Prerequisites
- Node.js 16+ (for Vite dev server)

### Start the Development Server
```bash
cd flightsimulator-master/src
npm install
npm run dev
```

The app will start on `http://localhost:5173` with flat terrain and OpenStreetMap imagery.

### Build for Production
```bash
npm run build
```

## Troubleshooting

### Issue: "401 Unauthorized" errors
**Cause**: Terrain service requires authentication  
**Solution**: Use the Mapbox setup above or accept flat terrain for now

### Issue: "NaN values" or WebGL errors
**Cause**: Invalid heightmap data  
**Solution**: Fixed in latest version - procedural terrain now generates valid elevation data

### Issue: Tiles keep loading endlessly
**Cause**: Failed tile requests trigger continuous retries  
**Solution**: Fixed - fallback terrain loads immediately without external requests

## Performance Tips
- **Lower zoom** (6-8): Fewer tiles, better performance
- **Higher zoom** (11-13): More detail but more tiles to load
- Change zoom in the `utmToTile()` function in [tile.js](flightsimulator-master/src/js/terrain/tile.js#L9)

### Start the Development Server
```bash
cd flightsimulator-master/src
npm install
npm run dev
```

The app will start on `http://localhost:5173` and terrain tiles will stream from Mapbox.

### Build for Production
```bash
npm run build
```

## Customization

### Change the Zoom Level
In `tile.js`, find the `utmToTile()` function and adjust the `zoom` parameter (default is 9):
- **Lower zoom** (6-8): Coarser, faster terrain (covers wider area per tile)
- **Higher zoom** (11-13): Finer detail but more tiles to load

### Change Imagery Source
Replace the Mapbox imagery URL in the `load()` method. Examples:
- **Mapbox satellite (current)**: `mapbox.satellite`
- **Mapbox streets**: `mapbox.streets`
- **Mapbox outdoors**: `mapbox.outdoors`

### Adjust Mesh Resolution
In `buildMeshFromHeightmap()`, change `segmentsX` and `segmentsY`:
- **128x128** (current): Good balance of detail and performance
- **256x256**: Higher detail but slower mesh generation
- **64x64**: Faster but coarser terrain

## Performance Tips
- The app caches tiles in memory; refresh the page to clear the cache
- If tiles load too slowly, increase the `setInterval` delay in `terrain.js` (currently 100ms)
- For distant tiles, you can decimate mesh resolution based on distance to camera

## Troubleshooting

### Tiles appear blurry when zoomed in
- Try increasing `segmentsX` and `segmentsY` in `buildMeshFromHeightmap()`
- Ensure your Mapbox token has access to the required tilesets

### "HTTP 401" or "Unauthorized" errors
- Check your Mapbox token is correctly copied in `tile.js`
- Verify the token has permission to access `mapbox.terrain-rgb` and `mapbox.satellite`

### Tiles don't load at all
- Open browser DevTools (F12) → Console to check for errors
- Verify network requests to Mapbox are succeeding
- Check your internet connection and Mapbox rate limits

## Next Steps
- You can modify the UTM bounds in `src/js/index.js` to focus on a specific region
- Consider adding additional imagery layers or elevation providers
- Optimize mesh generation for even better performance

Happy flying! 🛩️
