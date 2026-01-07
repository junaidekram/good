import * as THREE from "three"
import { Vector3, Sphere, Mesh, BufferGeometry, MeshBasicMaterial, TextureLoader, MathUtils, CanvasTexture, BufferAttribute } from "three"
import { GenerateMeshBVHWorker } from "../externals/workers/GenerateMeshBVHWorker.js"

// Cache for decoded terrain tiles and textures to avoid duplicate requests
const tileCache = {}

// Convert UTM coordinates to Web Mercator tile coordinates
function utmToTile(x, y, zoom = 9) {
  // Approximate UTM to lat/lon (assuming UTM zone 33)
  // UTM zone 33: central meridian 15°E, false easting 500000, false northing 0 (N hemisphere)
  const utm33_lon = 15
  const false_easting = 500000

  const easting = x
  const northing = y

  const lon = utm33_lon + ((easting - false_easting) / 111320.0)
  const lat = northing / 111320.0

  // Convert lat/lon to Web Mercator tile coordinates
  const n = Math.pow(2.0, zoom)
  const xtile = Math.floor(n * (lon + 180.0) / 360.0)
  const ytile = Math.floor(n * (1.0 - Math.log(Math.tan(Math.PI * lat / 180.0) + 1.0 / Math.cos(Math.PI * lat / 180.0)) / Math.PI) / 2.0)

  return { x: xtile, y: ytile, z: zoom }
}

// Decode Terrain-RGB to elevation in meters
function decodeTerrainRGB(r, g, b) {
  return -10000 + (r * 256 * 256 + g * 256 + b) * 0.1
}

// Fetch image with fallback
async function fetchImageData(url, tileName, fallback = null) {
  if (tileCache[tileName]) {
    console.log(`Using cached tile: ${tileName}`)
    return tileCache[tileName]
  }

  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const blob = await response.blob()
    const bitmap = await createImageBitmap(blob)
    tileCache[tileName] = bitmap
    console.log(`✓ Fetched tile: ${tileName}`)
    return bitmap
  } catch (error) {
    console.warn(`✗ Failed to fetch ${tileName}: ${error.message}. Using fallback.`)
    if (fallback) return fallback
    return null
  }
}

// Generate procedural terrain as fallback (creates valid RGB heightmap)
function generateProceduralTerrain(tileExtents, seed = 0) {
  const canvas = document.createElement("canvas")
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext("2d")
  
  // Create a flat terrain at sea level encoded as Terrain-RGB
  // Sea level (0m) = -10000 + (R*256*256 + G*256 + B) * 0.1
  // 0 = -10000 + value * 0.1
  // value = 100000
  const r = Math.floor(100000 / 65536) // 1
  const g = Math.floor((100000 % 65536) / 256) // 134
  const b = 100000 % 256 // 160
  
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
  ctx.fillRect(0, 0, 256, 256)
  
  return createImageBitmap(canvas)
}

// Generate simple texture as fallback
function generateProceduralTexture(seed = 0) {
  const canvas = document.createElement("canvas")
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext("2d")
  
  // Simple green/brown texture
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const check = ((x >> 5) + (y >> 5)) % 2 === 0 ? 100 : 120
      const noise = Math.sin((x + seed) * 0.01) * Math.cos((y + seed) * 0.01) * 20
      const val = check + noise
      ctx.fillStyle = `rgb(${val}, ${val * 0.8}, ${val * 0.6})`
      ctx.fillRect(x, y, 1, 1)
    }
  }
  
  return createImageBitmap(canvas)
}

// Build 3D mesh from heightmap
async function buildMeshFromHeightmap(tileExtents, terrainBitmap, textureBitmap) {
  const segmentsX = 64
  const segmentsY = 64

  // Create canvas to read heightmap pixels
  const canvas = document.createElement("canvas")
  canvas.width = terrainBitmap.width
  canvas.height = terrainBitmap.height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  ctx.drawImage(terrainBitmap, 0, 0)
  const terrainData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const terrainPixels = terrainData.data

  // Create texture from imagery bitmap
  const textureCanvas = document.createElement("canvas")
  textureCanvas.width = Math.min(textureBitmap.width, 512)
  textureCanvas.height = Math.min(textureBitmap.height, 512)
  const textureCtx = textureCanvas.getContext("2d")
  textureCtx.drawImage(textureBitmap, 0, 0, textureCanvas.width, textureCanvas.height)
  const texture = new CanvasTexture(textureCanvas)
  texture.anisotropy = 16

  // Create BufferGeometry
  const geometry = new BufferGeometry()
  const vertices = []
  const indices = []

  // Generate vertex grid with heights from Terrain-RGB
  for (let y = 0; y <= segmentsY; y++) {
    for (let x = 0; x <= segmentsX; x++) {
      const xPos = (x / segmentsX) * tileExtents
      const yPos = (y / segmentsY) * tileExtents

      // Sample heightmap pixel
      const px = Math.floor((x / segmentsX) * (terrainBitmap.width - 1))
      const py = Math.floor((y / segmentsY) * (terrainBitmap.height - 1))
      const pixelIndex = (py * terrainBitmap.width + px) * 4

      const r = terrainPixels[pixelIndex] || 128
      const g = terrainPixels[pixelIndex + 1] || 128
      const b = terrainPixels[pixelIndex + 2] || 128

      const height = decodeTerrainRGB(r, g, b)
      vertices.push(xPos, yPos, height)
    }
  }

  // Generate indices for triangles
  for (let y = 0; y < segmentsY; y++) {
    for (let x = 0; x < segmentsX; x++) {
      const a = y * (segmentsX + 1) + x
      const b = y * (segmentsX + 1) + (x + 1)
      const c = (y + 1) * (segmentsX + 1) + x
      const d = (y + 1) * (segmentsX + 1) + (x + 1)

      indices.push(a, c, b)
      indices.push(b, c, d)
    }
  }

  geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3))
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1))
  geometry.computeVertexNormals()

  const material = new MeshBasicMaterial({ map: texture })
  return { geometry, material, texture }
}

export default class Tile {
  constructor(scene, terrain, tileExtents, lowerLeft) {
    this.scene = scene
    this.terrain = terrain
    this.tileExtents = tileExtents

    this.loading = false
    this.loaded = false

    this.tileName = `${lowerLeft.x}-${lowerLeft.y}`

    // Convert UTM to Mapbox tile coordinates
    const tileCoord = utmToTile(lowerLeft.x, lowerLeft.y, 9)
    this.mapboxTile = tileCoord

    const sphereRadius = Math.sqrt(0.5 * tileExtents * tileExtents)
    const tileCenter = new Vector3(lowerLeft.x + tileExtents / 2, lowerLeft.y + tileExtents / 2, 0)
    this.boundingSphere = new Sphere(tileCenter, sphereRadius)

    this.tileMesh = new Mesh()
    this.tileMesh.position.set(lowerLeft.x, lowerLeft.y, 0)
    this.tileMesh.rotateX(90 * MathUtils.DEG2RAD)
    this.tileMesh.updateMatrixWorld()

    this.tileMesh.geometry = new BufferGeometry()
    this.tileMesh.material = new MeshBasicMaterial()
  }

  update(camera, showWireFrame) {
    let dist =
      (this.boundingSphere.center.x - camera.position.x) * (this.boundingSphere.center.x - camera.position.x) +
      (this.boundingSphere.center.y - camera.position.y) * (this.boundingSphere.center.y - camera.position.y)
    let visible = dist < camera.far * camera.far

    if (this.loaded) {
      this.tileMesh.material.wireframe = showWireFrame
    }

    if (visible && !this.loading && !this.loaded) {
      this.loading = true
      this.terrain.fetchQueue.push(this)
    }

    if (!visible && !this.loading && this.loaded) {
      this.scene.remove(this.tileMesh)

      if (this.tileMesh.material.map) {
        this.tileMesh.material.map.dispose()
        this.tileMesh.material.map = null
      }

      this.tileMesh.material.dispose()
      this.tileMesh.geometry.dispose()
      this.tileMesh.geometry.boundsTree = null

      this.loaded = false
      Tile.loadCount--
    }
  }

  async load() {
    try {
      const z = this.mapboxTile.z
      const x = this.mapboxTile.x
      const y = this.mapboxTile.y

      console.log(`Loading terrain tile ${this.tileName} (z:${z} x:${x} y:${y})`)

      // Mapbox token for terrain and imagery
      const MAPBOX_TOKEN = 'pk.eyJ1IjoianVuYWlkZWtyYW0iLCJhIjoiY21rMzB6b3ptMG44OTNjcHdrMHV5dTcxayJ9.aGF0gdpb2-YuOqczZnhyLA'

      // Fetch real terrain elevation from Mapbox Terrain-RGB
      const terrainUrl = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}.pngraw?access_token=${MAPBOX_TOKEN}`
      const imageryUrl = `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}@2x.jpg90?access_token=${MAPBOX_TOKEN}`

      // Fetch terrain and imagery with timeout
      const terrainBitmap = await Promise.race([
        fetchImageData(terrainUrl, `${this.tileName}-terrain`),
        new Promise(r => setTimeout(() => r(null), 5000))
      ])

      const textureBitmap = await Promise.race([
        fetchImageData(imageryUrl, `${this.tileName}-imagery`),
        new Promise(r => setTimeout(() => r(null), 5000))
      ])

      // Use procedural fallback only if Mapbox fetch fails
      const terrainToUse = terrainBitmap || await generateProceduralTerrain(this.tileExtents, parseInt(this.tileName))
      const textureToUse = textureBitmap || await generateProceduralTexture(parseInt(this.tileName) + 1000)

      if (!terrainToUse || !textureToUse) {
        throw new Error("Could not load or generate terrain")
      }

      console.log(`Building mesh for ${this.tileName}...`)

      // Build 3D mesh from heightmap
      const { geometry, material } = await buildMeshFromHeightmap(
        this.tileExtents,
        terrainToUse,
        textureToUse
      )

      this.tileMesh.geometry = geometry
      this.tileMesh.material = material

      console.log(`✓ ${this.tileName} mesh ready: ${geometry.index.array.length / 3} triangles`)

      // Generate BVH for collision detection
      if (Tile.bvhWorker) {
        Tile.bvhWorker.generate(this.tileMesh.geometry).then((bvh) => {
          this.tileMesh.geometry.boundsTree = bvh
          console.log(`✓ BVH generated for ${this.tileName}`)
        }).catch(err => console.warn(`BVH generation failed for ${this.tileName}:`, err))
      }

      this.scene.add(this.tileMesh)

      this.loading = false
      this.loaded = true
      Tile.loadCount++
    } catch (error) {
      console.error(`✗ Error loading tile ${this.tileName}:`, error)
      this.loading = false
    }
  }
}

Tile.loadCount = 0
Tile.bvhWorker = null
