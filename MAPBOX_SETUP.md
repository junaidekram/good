# Mapbox Terrain Integration Setup

## What Changed
The flight simulator now loads real 3D terrain from **Mapbox** instead of pre-rendered GLB tiles. This means:
- ✅ Global terrain coverage
- ✅ High-resolution satellite imagery 
- ✅ 3D elevation from Terrain-RGB tiles
- ✅ Automatic tile caching to avoid duplicate requests
- ✅ On-the-fly mesh generation (no pre-processing needed)

## How It Works
1. **UTM to Web Mercator conversion**: Your UTM coordinates are converted to Mapbox tile coordinates
2. **Parallel fetching**: Terrain-RGB (elevation) and satellite imagery are fetched in parallel
3. **Mesh generation**: Heights are decoded from Terrain-RGB and a 3D mesh is built with proper normals
4. **Caching**: Tiles are cached in memory to avoid re-fetching the same data
5. **Streaming**: Tiles load progressively as you fly around (100ms rate limit per tile)

## Running the App

### Prerequisites
- Node.js 16+ (for Vite dev server)
- Your Mapbox token is already embedded in `src/js/terrain/tile.js`

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
