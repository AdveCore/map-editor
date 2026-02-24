'use strict';

/* ═══════════════════════════════════════════════════════════════
   Tibia Map Editor – Phaser 3 Tilemap Editor
   Full browser-based editor with custom tileset support,
   two-layer drawing, JSON export and cave generation.
   ═══════════════════════════════════════════════════════════════ */

const CONFIG = Object.freeze({
    MAP_WIDTH:   100,
    MAP_HEIGHT:  100,
    TILE_SIZE:   32,
    MIN_ZOOM:    0.15,
    MAX_ZOOM:    5,
    ZOOM_SPEED:  0.08,
    AUTO_DETECT_TILE_SIZE: true,
});

/* ─────────────────────────────────────────
   TilesetManager
   Loads user-uploaded images into Phaser
   as sprite-sheets with 32×32 frames.
   ───────────────────────────────────────── */
class TilesetManager {
    constructor(scene) {
        this.scene = scene;
        this.tilesets = [];
        this._counter = 0;
    }

    loadFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const img = new Image();
                img.onload = () => {
                    const key  = `ts_${this._counter++}`;
                    let tileSize = CONFIG.TILE_SIZE;
                    let cols, rows;

                    if (CONFIG.AUTO_DETECT_TILE_SIZE) {
                        // Try to detect tile size by finding common divisors
                        const possibleSizes = [16, 24, 32, 48, 64];
                        const bestSize = possibleSizes.find(size => 
                            img.width % size === 0 && img.height % size === 0 &&
                            img.width / size <= 32 && img.height / size <= 32
                        ) || CONFIG.TILE_SIZE;
                        
                        tileSize = bestSize;
                    }

                    cols = Math.floor(img.width  / tileSize);
                    rows = Math.floor(img.height / tileSize);

                    if (cols === 0 || rows === 0) {
                        reject(new Error(`Image too small for ${tileSize}×${tileSize} tiles`));
                        return;
                    }

                    this.scene.textures.addSpriteSheet(key, img, {
                        frameWidth:  tileSize,
                        frameHeight: tileSize,
                    });

                    const entry = { key, name: file.name, image: img, cols, rows, tileSize };
                    this.tilesets.push(entry);
                    
                    // Auto-save to library
                    this.scene.tilesetLibrary.addTileset(
                        file.name, 
                        evt.target.result, 
                        cols, 
                        rows, 
                        tileSize
                    );
                    
                    resolve(entry);
                };
                img.onerror = () => reject(new Error('Image decode failed'));
                img.src = evt.target.result;
            };
            reader.onerror = () => reject(new Error('FileReader error'));
            reader.readAsDataURL(file);
        });
    }

    loadFromLibrary(tilesetData) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const key = `ts_lib_${this._counter++}`;
                const { cols, rows, tileSize } = tilesetData;

                this.scene.textures.addSpriteSheet(key, img, {
                    frameWidth: tileSize,
                    frameHeight: tileSize,
                });

                const entry = { 
                    key, 
                    name: tilesetData.name, 
                    image: img, 
                    cols, 
                    rows, 
                    tileSize,
                    fromLibrary: true
                };
                this.tilesets.push(entry);
                resolve(entry);
            };
            img.onerror = () => reject(new Error('Library image decode failed'));
            img.src = tilesetData.imageData;
        });
    }

    getByKey(key) {
        return this.tilesets.find(t => t.key === key) || null;
    }
}

/* ─────────────────────────────────────────
   PaletteUI
   Renders loaded tilesets in an HTML canvas
   and lets users pick a brush tile.
   ───────────────────────────────────────── */
class PaletteUI {
    constructor() {
        this.canvas = document.getElementById('palette-canvas');
        this.ctx    = this.canvas.getContext('2d');

        this.currentTileset = null;
        this.selectedCol    = -1;
        this.selectedRow    = -1;
        this.brush          = null; // { key, frame }
        this.multiBrush     = []; // Array of { key, frame, col, row }
        this.zoomLevel      = 1;
        this.scrollOffset   = { x: 0, y: 0 };
        this.isDragging     = false;
        this.dragStart      = { x: 0, y: 0 };
        this.selectionStart = null; // For multi-selection
        this.isSelecting    = false;

        this.canvas.addEventListener('click', (e) => this._handleClick(e));
        this.canvas.addEventListener('mousedown', (e) => this._handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this._handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this._handleMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this._handleWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Prevent text selection while dragging
        this.canvas.style.userSelect = 'none';
        this.canvas.style.webkitUserSelect = 'none';

        // Zoom controls
        document.getElementById('palette-zoom-in').addEventListener('click', () => this._zoom(0.1));
        document.getElementById('palette-zoom-out').addEventListener('click', () => this._zoom(-0.1));
        document.getElementById('palette-zoom-reset').addEventListener('click', () => this._resetZoom());
    }

    showTileset(entry) {
        this.currentTileset = entry;
        this.selectedCol    = -1;
        this.selectedRow    = -1;
        this.brush          = null;
        this.multiBrush     = [];
        this.selectionStart = null;
        this.isSelecting    = false;
        this._resetZoom();
        this._render();
        this._updateLabel();
    }

    _render() {
        const ts = this.currentTileset;
        if (!ts) return;

        const { image, cols, rows, tileSize } = ts;
        const S = tileSize * this.zoomLevel;
        const w = cols * S;
        const h = rows * S;

        // Set canvas size to fit container
        const container = document.getElementById('palette-container');
        const maxWidth = container.clientWidth - 40; // Account for padding
        const maxHeight = container.clientHeight - 40;

        // Use full container size for better scrolling
        this.canvas.width  = maxWidth;
        this.canvas.height = maxHeight;
        this.ctx.imageSmoothingEnabled = false;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Save context state
        this.ctx.save();

        // Apply scroll offset
        this.ctx.translate(this.scrollOffset.x, this.scrollOffset.y);

        // Draw tileset image with zoom
        this.ctx.drawImage(image, 0, 0, w, h);

        // Grid overlay with zoom
        this.ctx.strokeStyle = 'rgba(88, 166, 255, 0.35)';
        this.ctx.lineWidth   = 1;
        for (let x = 0; x <= cols; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * S + 0.5, 0);
            this.ctx.lineTo(x * S + 0.5, h);
            this.ctx.stroke();
        }
        for (let y = 0; y <= rows; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * S + 0.5);
            this.ctx.lineTo(w, y * S + 0.5);
            this.ctx.stroke();
        }

        // Multi-selection highlight
        if (this.multiBrush.length > 0) {
            this.ctx.strokeStyle = '#ff6b6b';
            this.ctx.lineWidth   = 3;
            this.multiBrush.forEach(tile => {
                this.ctx.strokeRect(
                    tile.col * S + 1.5,
                    tile.row * S + 1.5,
                    S - 3,
                    S - 3
                );
            });
        }
        // Single selection highlight
        else if (this.selectedCol >= 0 && this.selectedRow >= 0) {
            this.ctx.strokeStyle = '#ff6b6b';
            this.ctx.lineWidth   = 3;
            this.ctx.strokeRect(
                this.selectedCol * S + 1.5,
                this.selectedRow * S + 1.5,
                S - 3,
                S - 3
            );
        }

        // Selection rectangle
        if (this.isSelecting && this.selectionStart) {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const currentX = (this.lastMouseX - rect.left) * scaleX;
            const currentY = (this.lastMouseY - rect.top) * scaleY;
            
            const startX = (this.selectionStart.x - this.scrollOffset.x) / this.zoomLevel;
            const startY = (this.selectionStart.y - this.scrollOffset.y) / this.zoomLevel;
            const endX = (currentX - this.scrollOffset.x) / this.zoomLevel;
            const endY = (currentY - this.scrollOffset.y) / this.zoomLevel;
            
            // Scale rectangle for zoom
            this.ctx.save();
            this.ctx.scale(this.zoomLevel, this.zoomLevel);
            
            this.ctx.strokeStyle = 'rgba(88, 166, 255, 0.8)';
            this.ctx.lineWidth   = 2 / this.zoomLevel; // Adjust line width for zoom
            this.ctx.setLineDash([5 / this.zoomLevel, 5 / this.zoomLevel]);
            this.ctx.strokeRect(
                Math.min(startX, endX),
                Math.min(startY, endY),
                Math.abs(endX - startX),
                Math.abs(endY - startY)
            );
            this.ctx.setLineDash([]);
            this.ctx.restore();
        }

        // Restore context state
        this.ctx.restore();

        // Update zoom level display
        document.getElementById('palette-zoom-level').textContent = 
            `${Math.round(this.zoomLevel * 100)}%`;
    }

    _handleClick(e) {
        // This is now handled by _handleMouseUp for better drag detection
        // We keep this for other cases but don't process tile selection here
    }

    _handleSingleClick(e) {
        const ts = this.currentTileset;
        if (!ts) return;

        const rect   = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width  / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const mx     = this.selectionStart.x; // Use start position
        const my     = this.selectionStart.y;

        // Account for scroll offset and zoom
        const adjustedX = (mx - this.scrollOffset.x) / this.zoomLevel;
        const adjustedY = (my - this.scrollOffset.y) / this.zoomLevel;

        const col = Math.floor(adjustedX / ts.tileSize);
        const row = Math.floor(adjustedY / ts.tileSize);

        if (col < 0 || col >= ts.cols || row < 0 || row >= ts.rows) return;

        // Handle multi-selection with Ctrl/Cmd or Shift
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            // Toggle tile in multi-selection
            const existingIndex = this.multiBrush.findIndex(t => t.col === col && t.row === row);
            if (existingIndex >= 0) {
                this.multiBrush.splice(existingIndex, 1);
            } else {
                this.multiBrush.push({
                    key: ts.key,
                    frame: row * ts.cols + col,
                    col: col,
                    row: row
                });
            }
            // Clear single selection when using multi-selection
            this.selectedCol = -1;
            this.selectedRow = -1;
            this.brush = null;
        } else {
            // Single selection
            this.selectedCol = col;
            this.selectedRow = row;
            this.brush = { key: ts.key, frame: row * ts.cols + col };
            this.multiBrush = [];
        }

        this._render();
        this._updateLabel();
    }

    _handleMouseDown(e) {
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;

        if (e.button === 1 || (e.button === 0 && e.shiftKey && !e.altKey)) { // Middle mouse or Shift+Left (but not Alt)
            this.isDragging = true;
            this.dragStart.x = e.clientX - this.scrollOffset.x;
            this.dragStart.y = e.clientY - this.scrollOffset.y;
            this.canvas.style.cursor = 'grabbing';
            e.preventDefault();
        } else if (e.button === 0 && (e.altKey || (e.shiftKey && e.ctrlKey))) { // Alt+Left or Ctrl+Shift+Left for rectangle selection
            const ts = this.currentTileset;
            if (!ts) return;

            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const mx = (e.clientX - rect.left) * scaleX;
            const my = (e.clientY - rect.top) * scaleY;

            this.isSelecting = true;
            this.selectionStart = { x: mx, y: my };
            e.preventDefault();
        } else if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) { // Plain Left click for drag selection
            const ts = this.currentTileset;
            if (!ts) return;

            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const mx = (e.clientX - rect.left) * scaleX;
            const my = (e.clientY - rect.top) * scaleY;

            this.isSelecting = true;
            this.selectionStart = { x: mx, y: my };
            this.canvas.style.cursor = 'crosshair';
            e.preventDefault();
        }
    }

    _handleMouseMove(e) {
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;

        if (this.isDragging) {
            this.scrollOffset.x = e.clientX - this.dragStart.x;
            this.scrollOffset.y = e.clientY - this.dragStart.y;
            this._render();
        } else if (this.isSelecting) {
            this._render(); // Re-render to show selection rectangle
        }
    }

    _handleMouseUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            this.canvas.style.cursor = 'crosshair';
        } else if (this.isSelecting && this.selectionStart) {
            // Check if this was a drag or just a click
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const endX = (e.clientX - rect.left) * scaleX;
            const endY = (e.clientY - rect.top) * scaleY;
            
            const dragDistance = Math.sqrt(
                Math.pow(endX - this.selectionStart.x, 2) + 
                Math.pow(endY - this.selectionStart.y, 2)
            );
            
            // If it was just a click (small distance), treat as single selection
            if (dragDistance < 10) {
                this._handleSingleClick(e);
            } else {
                // It was a drag, finish rectangle selection
                this._finishSelection(e);
            }
            
            this.isSelecting = false;
            this.selectionStart = null;
            this.canvas.style.cursor = 'crosshair';
        }
    }

    _finishSelection(e) {
        const ts = this.currentTileset;
        if (!ts) return;

        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const endX = (e.clientX - rect.left) * scaleX;
        const endY = (e.clientY - rect.top) * scaleY;

        const startX = (this.selectionStart.x - this.scrollOffset.x) / this.zoomLevel;
        const startY = (this.selectionStart.y - this.scrollOffset.y) / this.zoomLevel;
        const endXAdj = (endX - this.scrollOffset.x) / this.zoomLevel;
        const endYAdj = (endY - this.scrollOffset.y) / this.zoomLevel;

        const minCol = Math.max(0, Math.floor(Math.min(startX, endXAdj) / ts.tileSize));
        const maxCol = Math.min(ts.cols - 1, Math.floor(Math.max(startX, endXAdj) / ts.tileSize));
        const minRow = Math.max(0, Math.floor(Math.min(startY, endYAdj) / ts.tileSize));
        const maxRow = Math.min(ts.rows - 1, Math.floor(Math.max(startY, endYAdj) / ts.tileSize));

        // Build multi-selection
        this.multiBrush = [];
        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                this.multiBrush.push({
                    key: ts.key,
                    frame: row * ts.cols + col,
                    col: col,
                    row: row
                });
            }
        }

        // Clear single selection
        this.selectedCol = -1;
        this.selectedRow = -1;
        this.brush = null;

        this._render();
        this._updateLabel();
    }

    _handleWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        this._zoom(delta);
    }

    _zoom(delta) {
        const newZoom = Math.max(0.5, Math.min(3, this.zoomLevel + delta));
        if (newZoom !== this.zoomLevel) {
            this.zoomLevel = newZoom;
            this._render();
        }
    }

    _resetZoom() {
        this.zoomLevel = 1;
        this.scrollOffset = { x: 0, y: 0 };
        this._render();
    }

    _updateLabel() {
        const brushEl = document.getElementById('brush-label');
        const infoEl = document.getElementById('tileset-info');
        
        if (this.multiBrush.length > 0 && this.currentTileset) {
            brushEl.textContent = `${this.currentTileset.name} [${this.multiBrush.length} tiles]`;
            infoEl.textContent = `${this.currentTileset.cols}×${this.currentTileset.rows} (${this.currentTileset.tileSize}px)`;
        } else if (this.brush && this.currentTileset) {
            brushEl.textContent = `${this.currentTileset.name} [#${this.brush.frame}]`;
            infoEl.textContent = `${this.currentTileset.cols}×${this.currentTileset.rows} (${this.currentTileset.tileSize}px)`;
        } else {
            brushEl.textContent = 'Brak';
            infoEl.textContent = '';
        }
    }
}

/* ─────────────────────────────────────────
   MapData
   Pure data model for a two-layer tilemap.
   Each cell stores { key, frame } or null.
   ───────────────────────────────────────── */
class MapData {
    constructor(width, height) {
        this.width  = width;
        this.height = height;
        this.layers = {
            ground:     this._empty(),
            decoration: this._empty(),
        };
    }

    _empty() {
        return Array.from({ length: this.height }, () =>
            new Array(this.width).fill(null)
        );
    }

    set(layer, x, y, info) {
        if (this._oob(x, y)) return;
        this.layers[layer][y][x] = info;
    }

    get(layer, x, y) {
        if (this._oob(x, y)) return null;
        return this.layers[layer][y][x];
    }

    _oob(x, y) {
        return x < 0 || x >= this.width || y < 0 || y >= this.height;
    }

    toJSON(name, tilesets) {
        const tsIdx = {};
        tilesets.forEach((ts, i) => { tsIdx[ts.key] = i; });

        const packLayer = (layerName) =>
            this.layers[layerName].map(row =>
                row.map(cell =>
                    cell ? [tsIdx[cell.key], cell.frame] : 0
                )
            );

        return {
            name,
            version:  '1.0',
            width:    this.width,
            height:   this.height,
            tileSize: CONFIG.TILE_SIZE,
            tilesets: tilesets.map(ts => ({
                key:  ts.key,
                file: ts.name,
                cols: ts.cols,
                rows: ts.rows,
            })),
            layers: {
                ground:     packLayer('ground'),
                decoration: packLayer('decoration'),
            },
        };
    }
}

/* ─────────────────────────────────────────
   CaveGenerator
   Cellular-automata cave on a 2-D grid.
   Returns number[][] (0 = floor, 1 = wall).
   ───────────────────────────────────────── */
class CaveGenerator {

    static generate(w, h, wallChance = 0.46, iterations = 5) {
        let grid = Array.from({ length: h }, () =>
            Array.from({ length: w }, () => (Math.random() < wallChance ? 1 : 0))
        );

        // Force solid borders
        for (let y = 0; y < h; y++) {
            grid[y][0] = 1;
            grid[y][w - 1] = 1;
        }
        for (let x = 0; x < w; x++) {
            grid[0][x] = 1;
            grid[h - 1][x] = 1;
        }

        for (let i = 0; i < iterations; i++) {
            const next = Array.from({ length: h }, () => new Array(w).fill(0));
            for (let y = 1; y < h - 1; y++) {
                for (let x = 1; x < w - 1; x++) {
                    let walls = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            walls += grid[y + dy][x + dx];
                        }
                    }
                    next[y][x] = walls >= 5 ? 1 : 0;
                }
            }
            // Borders stay solid
            for (let y = 0; y < h; y++) { next[y][0] = 1; next[y][w - 1] = 1; }
            for (let x = 0; x < w; x++) { next[0][x] = 1; next[h - 1][x] = 1; }
            grid = next;
        }

        return grid;
    }
}

/* ─────────────────────────────────────────
   EditorScene (Phaser.Scene)
   Camera, grid, drawing, undo – everything
   that lives inside the Phaser canvas.
   ───────────────────────────────────────── */
class EditorScene extends Phaser.Scene {

    constructor() {
        super({ key: 'EditorScene' });
    }

    /* ── Lifecycle ── */

    create() {
        // Managers
        this.tilesetMgr = new TilesetManager(this);
        this.paletteUI  = new PaletteUI();
        this.mapData    = new MapData(CONFIG.MAP_WIDTH, CONFIG.MAP_HEIGHT);

        // State
        this.activeLayer = 'ground';
        this.erasing     = false;
        this.filling     = false;
        this.picking     = false;
        this.gridVisible = true;
        this.panning     = false;
        this.panOrigin   = { x: 0, y: 0 };
        this.camOrigin   = { x: 0, y: 0 };
        this.lastPaintedTile = { x: -1, y: -1 };

        // Sprite storage [layer][y][x]
        this.sprites = {
            ground:     this._emptyGrid(),
            decoration: this._emptyGrid(),
        };

        // Preview tile for placement feedback
        this.previewTile = null;
        this.previewPos = { x: -1, y: -1 };

        // Store original zoom for reset
        this.originalZoom = 1;
        this.originalScroll = { x: 0, y: 0 };

        // Undo system
        this.undoStack = [];
        this.maxUndoSteps = 50;
        this.lastPlacedTile = null;

        // Tileset library system
        this.tilesetLibrary = new TilesetLibrary();

        // Render containers (order matters: ground → deco → grid)
        this.groundGroup = this.add.container(0, 0);
        this.decoGroup   = this.add.container(0, 0);
        this.gridGfx     = this.add.graphics();
        this._renderGrid();

        // Layer opacity indicators
        this.layerIndicators = {
            ground: this.add.text(10, 10, '🌱 Ground', {
                fontSize: '14px',
                color: '#58a6ff',
                backgroundColor: 'rgba(0,0,0,0.7)',
                padding: { x: 8, y: 4 }
            }).setScrollFactor(0).setDepth(1000),
            decoration: this.add.text(10, 30, '🌳 Decoration', {
                fontSize: '14px', 
                color: '#8b949e',
                backgroundColor: 'rgba(0,0,0,0.7)',
                padding: { x: 8, y: 4 }
            }).setScrollFactor(0).setDepth(1000),
            both: this.add.text(10, 50, '👁️ Wszystko', {
                fontSize: '14px', 
                color: '#8b949e',
                backgroundColor: 'rgba(0,0,0,0.7)',
                padding: { x: 8, y: 4 }
            }).setScrollFactor(0).setDepth(1000)
        };
        this._updateLayerIndicators();

        // Camera
        const pw = CONFIG.MAP_WIDTH  * CONFIG.TILE_SIZE;
        const ph = CONFIG.MAP_HEIGHT * CONFIG.TILE_SIZE;
        const cam = this.cameras.main;
        cam.setBounds(-pw * 0.5, -ph * 0.5, pw * 2, ph * 2);
        cam.centerOn(pw / 2, ph / 2);
        cam.setZoom(1);
        
        // Store original position for zoom reset
        this.originalZoom = 1;
        this.originalScroll = { x: cam.scrollX, y: cam.scrollY };

        // Map boundary rectangle (subtle outline)
        const border = this.add.graphics();
        border.lineStyle(2, 0x30363d, 0.8);
        border.strokeRect(0, 0, pw, ph);

        // Input
        this._initInput();
        this._initUI();

        // Load library tilesets on startup
        this._loadLibraryOnStartup();

        // Direct canvas click listener as backup
        const canvas = this.game.canvas;
        canvas.addEventListener('click', (e) => {
            const ptr = this.input.activePointer;
            
            // Don't check leftButtonDown - just call paint directly on click
            if (!this.panning) {
                this._paint(ptr);
            }
        });
    }

    update() {
        const ptr = this.input.activePointer;
        
        // Update preview
        this._updatePreview(ptr);
        
        if (ptr.isDown && ptr.leftButtonDown() && !this.panning) {
            this._paint(ptr);
        }
        if (!ptr.isDown) {
            this.lastPaintedTile.x = -1;
            this.lastPaintedTile.y = -1;
        }
    }

    _updatePreview(ptr) {
        const brush = this.paletteUI.brush;
        const multiBrush = this.paletteUI.multiBrush;
        const ts = (brush || multiBrush.length > 0) ? this.tilesetMgr.getByKey(brush ? brush.key : multiBrush[0].key) : null;
        const tileSize = ts ? ts.tileSize : CONFIG.TILE_SIZE;
        
        const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
        const tx = Math.floor(wp.x / tileSize);
        const ty = Math.floor(wp.y / tileSize);

        if (tx < 0 || tx >= CONFIG.MAP_WIDTH || ty < 0 || ty >= CONFIG.MAP_HEIGHT) {
            this._hidePreview();
            return;
        }

        // Hide preview if using tools other than paint
        if (this.erasing || this.picking || this.filling) {
            this._hidePreview();
            return;
        }

        // Show preview if we have a brush
        if (brush || multiBrush.length > 0) {
            this._showPreview(tx, ty, brush, multiBrush, ts);
        } else {
            this._hidePreview();
        }
    }

    _showPreview(tx, ty, brush, multiBrush, ts) {
        // Remove old preview
        this._hidePreview();

        const tileSize = ts.tileSize;
        const layer = this.activeLayer;

        if (multiBrush.length > 0) {
            // Preview multi-tile pattern
            let minCol = multiBrush[0].col;
            let minRow = multiBrush[0].row;
            multiBrush.forEach(tile => {
                minCol = Math.min(minCol, tile.col);
                minRow = Math.min(minRow, tile.row);
            });

            multiBrush.forEach(tile => {
                const offsetX = tile.col - minCol;
                const offsetY = tile.row - minRow;
                const targetX = tx + offsetX;
                const targetY = ty + offsetY;

                if (targetX >= 0 && targetX < CONFIG.MAP_WIDTH && 
                    targetY >= 0 && targetY < CONFIG.MAP_HEIGHT) {
                    
                    const sprite = this.add.sprite(
                        targetX * tileSize + tileSize / 2, 
                        targetY * tileSize + tileSize / 2, 
                        tile.key, 
                        tile.frame
                    );
                    sprite.setOrigin(0.5, 0.5);
                    sprite.setAlpha(0.5);
                    sprite.setTint(0x58a6ff);
                    sprite.setDepth(-1); // Put preview behind everything
                    sprite.setInteractive(false); // Don't block input
                    
                    const group = layer === 'ground' ? this.groundGroup : this.decoGroup;
                    group.add(sprite);
                    
                    if (!this.previewTile) this.previewTile = [];
                    this.previewTile.push(sprite);
                }
            });
        } else if (brush) {
            // Preview single tile
            const sprite = this.add.sprite(
                tx * tileSize + tileSize / 2, 
                ty * tileSize + tileSize / 2, 
                brush.key, 
                brush.frame
            );
            sprite.setOrigin(0.5, 0.5);
            sprite.setAlpha(0.5);
            sprite.setTint(0x58a6ff);
            sprite.setDepth(-1); // Put preview behind everything
            sprite.setInteractive(false); // Don't block input
            
            const group = layer === 'ground' ? this.groundGroup : this.decoGroup;
            group.add(sprite);
            
            this.previewTile = sprite;
        }

        this.previewPos = { x: tx, y: ty };
    }

    _hidePreview() {
        if (this.previewTile) {
            if (Array.isArray(this.previewTile)) {
                this.previewTile.forEach(sprite => sprite.destroy());
            } else {
                this.previewTile.destroy();
            }
            this.previewTile = null;
        }
        this.previewPos = { x: -1, y: -1 };
    }

    /* ── Helpers ── */

    _emptyGrid() {
        return Array.from({ length: CONFIG.MAP_HEIGHT }, () =>
            new Array(CONFIG.MAP_WIDTH).fill(null)
        );
    }

    /* ── Grid ── */

    _renderGrid() {
        this.gridGfx.clear();
        if (!this.gridVisible) return;

        const S  = CONFIG.TILE_SIZE;
        const pw = CONFIG.MAP_WIDTH  * S;
        const ph = CONFIG.MAP_HEIGHT * S;

        this.gridGfx.lineStyle(1, 0x30363d, 0.45);

        for (let x = 0; x <= CONFIG.MAP_WIDTH; x++) {
            this.gridGfx.lineBetween(x * S, 0, x * S, ph);
        }
        for (let y = 0; y <= CONFIG.MAP_HEIGHT; y++) {
            this.gridGfx.lineBetween(0, y * S, pw, y * S);
        }
    }

    /* ── Camera & Pointer Input ── */

    _initInput() {
        const canvas = this.game.canvas;
        canvas.addEventListener('contextmenu', e => e.preventDefault());

        // Zoom towards cursor
        this.input.on('wheel', (_ptr, _go, _dx, deltaY) => {
            const cam  = this.cameras.main;
            const ptr  = this.input.activePointer;
            const oldZ = cam.zoom;
            const dir  = -Math.sign(deltaY);
            const newZ = Phaser.Math.Clamp(
                oldZ * (1 + dir * CONFIG.ZOOM_SPEED),
                CONFIG.MIN_ZOOM,
                CONFIG.MAX_ZOOM
            );

            // Keep world-point under cursor stable
            const before = cam.getWorldPoint(ptr.x, ptr.y);
            cam.setZoom(newZ);
            const after = cam.getWorldPoint(ptr.x, ptr.y);
            cam.scrollX += before.x - after.x;
            cam.scrollY += before.y - after.y;

            document.getElementById('zoom-level').textContent =
                `Zoom: ${Math.round(newZ * 100)}%`;
        });

        // Pan with right / middle button
        this.input.on('pointerdown', (ptr) => {
            if (ptr.rightButtonDown || ptr.middleButtonDown) {
                this.panning = true;
                this.panOrigin.x = ptr.x;
                this.panOrigin.y = ptr.y;
                this.camOrigin.x = this.cameras.main.scrollX;
                this.camOrigin.y = this.cameras.main.scrollY;
            }
        });

        this.input.on('pointerup', () => {
            this.panning = false;
        });

        this.input.on('pointermove', (ptr) => {
            // Status bar coords
            const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
            const tx = Math.floor(wp.x / CONFIG.TILE_SIZE);
            const ty = Math.floor(wp.y / CONFIG.TILE_SIZE);
            document.getElementById('cursor-pos').textContent =
                `X: ${tx}  Y: ${ty}`;

            // Pan
            if (this.panning) {
                const cam = this.cameras.main;
                cam.scrollX = this.camOrigin.x + (this.panOrigin.x - ptr.x) / cam.zoom;
                cam.scrollY = this.camOrigin.y + (this.panOrigin.y - ptr.y) / cam.zoom;
            }
        });
    }

    /* ── Drawing ── */

    _paint(ptr) {
        const brush = this.paletteUI.brush;
        const multiBrush = this.paletteUI.multiBrush;
        const ts = (brush || multiBrush.length > 0) ? this.tilesetMgr.getByKey(brush ? brush.key : multiBrush[0].key) : null;
        const tileSize = ts ? ts.tileSize : CONFIG.TILE_SIZE;
        
        const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
        const tx = Math.floor(wp.x / tileSize);
        const ty = Math.floor(wp.y / tileSize);

        if (tx < 0 || tx >= CONFIG.MAP_WIDTH || ty < 0 || ty >= CONFIG.MAP_HEIGHT) return;

        const layer = this.activeLayer;

        // Handle different tools
        if (this.picking) {
            this._pickTile(layer, tx, ty);
            return;
        }

        if (this.filling) {
            this._fillArea(layer, tx, ty);
            return;
        }

        if (this.erasing) {
            // Avoid repainting the same tile while dragging for eraser
            if (tx === this.lastPaintedTile.x && ty === this.lastPaintedTile.y) return;
            this.lastPaintedTile.x = tx;
            this.lastPaintedTile.y = ty;
            
            this._clearTile(layer, tx, ty);
            return;
        }

        // Handle multi-tile placement
        if (multiBrush.length > 0) {
            this._placeMultiTile(layer, tx, ty, multiBrush);
            return;
        }

        if (!brush) return;

        // Always place tile (click-once, place-many behavior)
        this._setTile(layer, tx, ty, brush.key, brush.frame);
    }

    _placeMultiTile(layer, startX, startY, tiles) {
        const ts = this.tilesetMgr.getByKey(tiles[0].key);
        if (!ts) return;

        // Find the top-left tile in the selection
        let minCol = tiles[0].col;
        let minRow = tiles[0].row;
        tiles.forEach(tile => {
            minCol = Math.min(minCol, tile.col);
            minRow = Math.min(minRow, tile.row);
        });

        // Place tiles relative to the clicked position
        tiles.forEach(tile => {
            const offsetX = tile.col - minCol;
            const offsetY = tile.row - minRow;
            const targetX = startX + offsetX;
            const targetY = startY + offsetY;

            if (targetX >= 0 && targetX < CONFIG.MAP_WIDTH && 
                targetY >= 0 && targetY < CONFIG.MAP_HEIGHT) {
                
                // Skip if identical tile already placed
                const cur = this.mapData.get(layer, targetX, targetY);
                if (!cur || cur.key !== tile.key || cur.frame !== tile.frame) {
                    this._setTile(layer, targetX, targetY, tile.key, tile.frame);
                }
            }
        });
    }

    _setTile(layer, tx, ty, key, frame) {
        // Save state for undo
        this._saveUndoState();

        // Remove existing sprite
        this._clearTile(layer, tx, ty);

        const ts = this.tilesetMgr.getByKey(key);
        const tileSize = ts ? ts.tileSize : CONFIG.TILE_SIZE;
        
        const sprite = this.add.sprite(tx * tileSize + tileSize / 2, ty * tileSize + tileSize / 2, key, frame);
        sprite.setOrigin(0.5, 0.5);

        const group = layer === 'ground' ? this.groundGroup : this.decoGroup;
        group.add(sprite);

        this.sprites[layer][ty][tx] = sprite;
        this.mapData.set(layer, tx, ty, { key, frame });

        // Store last placed tile for quick navigation
        this.lastPlacedTile = { layer, tx, ty, key, frame, tileSize };
    }

    _clearTile(layer, tx, ty) {
        if (tx < 0 || tx >= CONFIG.MAP_WIDTH || ty < 0 || ty >= CONFIG.MAP_HEIGHT) return;
        
        // Save state for undo (only if something is actually being cleared)
        const spr = this.sprites[layer][ty][tx];
        if (spr) {
            this._saveUndoState();
            spr.destroy();
            this.sprites[layer][ty][tx] = null;
        }
        this.mapData.set(layer, tx, ty, null);
    }

    _pickTile(layer, tx, ty) {
        const tile = this.mapData.get(layer, tx, ty);
        if (!tile) return;

        // Set brush to picked tile
        this.paletteUI.brush = { key: tile.key, frame: tile.frame };
        
        // Update palette UI to show selection
        const ts = this.tilesetMgr.getByKey(tile.key);
        if (ts) {
            this.paletteUI.currentTileset = ts;
            this.paletteUI.selectedCol = tile.frame % ts.cols;
            this.paletteUI.selectedRow = Math.floor(tile.frame / ts.cols);
            this.paletteUI._render();
            this.paletteUI._updateLabel();
        }

        // Auto-disable pick tool after picking
        this.picking = false;
        document.getElementById('btn-pick').classList.remove('active');
    }

    _fillArea(layer, startX, startY) {
        const brush = this.paletteUI.brush;
        if (!brush) return;

        const targetTile = this.mapData.get(layer, startX, startY);
        const targetKey = targetTile ? targetTile.key : null;
        const targetFrame = targetTile ? targetTile.frame : null;

        // If target is same as brush, nothing to fill
        if (targetKey === brush.key && targetFrame === brush.frame) return;

        const visited = new Set();
        const queue = [[startX, startY]];

        while (queue.length > 0) {
            const [x, y] = queue.shift();
            const key = `${x},${y}`;

            if (visited.has(key)) continue;
            if (x < 0 || x >= CONFIG.MAP_WIDTH || y < 0 || y >= CONFIG.MAP_HEIGHT) continue;

            const current = this.mapData.get(layer, x, y);
            const currentKey = current ? current.key : null;
            const currentFrame = current ? current.frame : null;

            if (currentKey !== targetKey || currentFrame !== targetFrame) continue;

            visited.add(key);
            this._setTile(layer, x, y, brush.key, brush.frame);

            // Add neighbors
            queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }

        // Auto-disable fill tool after filling
        this.filling = false;
        document.getElementById('btn-fill').classList.remove('active');
    }

    /* ── UI Bindings ── */

    _initUI() {
        // Layer buttons
        document.querySelectorAll('.layer-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.activeLayer = btn.dataset.layer;
                
                let layerName = btn.dataset.layer;
                if (layerName === 'ground') layerName = 'Ground';
                else if (layerName === 'decoration') layerName = 'Decoration';
                else if (layerName === 'both') layerName = 'Wszystko';
                
                document.getElementById('layer-indicator').textContent = `Warstwa: ${layerName}`;
                this._updateLayerIndicators();
            });
        });

        // Eraser toggle
        document.getElementById('btn-eraser').addEventListener('click', () => {
            this.erasing = !this.erasing;
            this.filling = false;
            this.picking = false;
            document.getElementById('btn-eraser').classList.toggle('active', this.erasing);
            document.getElementById('btn-fill').classList.remove('active');
            document.getElementById('btn-pick').classList.remove('active');
        });

        // Fill toggle
        document.getElementById('btn-fill').addEventListener('click', () => {
            this.filling = !this.filling;
            this.erasing = false;
            this.picking = false;
            document.getElementById('btn-fill').classList.toggle('active', this.filling);
            document.getElementById('btn-eraser').classList.remove('active');
            document.getElementById('btn-pick').classList.remove('active');
        });

        // Pick toggle
        document.getElementById('btn-pick').addEventListener('click', () => {
            this.picking = !this.picking;
            this.erasing = false;
            this.filling = false;
            document.getElementById('btn-pick').classList.toggle('active', this.picking);
            document.getElementById('btn-eraser').classList.remove('active');
            document.getElementById('btn-fill').classList.remove('active');
        });

        // Undo
        document.getElementById('btn-undo').addEventListener('click', () => {
            this._undo();
        });

        // Clear selection
        document.getElementById('btn-clear-selection').addEventListener('click', () => {
            this.paletteUI.multiBrush = [];
            this.paletteUI.selectedCol = -1;
            this.paletteUI.selectedRow = -1;
            this.paletteUI.brush = null;
            this.paletteUI._render();
            this.paletteUI._updateLabel();
        });

        // Reset zoom
        document.getElementById('btn-reset-zoom').addEventListener('click', () => {
            const cam = this.cameras.main;
            cam.setZoom(1);
            document.getElementById('zoom-level').textContent = 'Zoom: 100%';
        });

        // Go to last placed tile
        document.getElementById('btn-last-tile').addEventListener('click', () => {
            this._goToLastTile();
        });

        // Grid toggle
        document.getElementById('btn-grid').addEventListener('click', () => {
            this.gridVisible = !this.gridVisible;
            document.getElementById('btn-grid').classList.toggle('active', this.gridVisible);
            this._renderGrid();
        });

        // Tileset upload
        document.getElementById('tileset-upload').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const entry = await this.tilesetMgr.loadFromFile(file);
                this._addTilesetEntry(entry);
                this.paletteUI.showTileset(entry);
            } catch (err) {
                console.error('Tileset load failed:', err);
                alert('Nie udalo sie wczytac tilesetu!\n' + err.message);
            }
            e.target.value = '';
        });

        // Library management
        document.getElementById('btn-manage-library').addEventListener('click', () => {
            this._showLibraryModal();
        });

        document.getElementById('btn-export-library').addEventListener('click', () => {
            this._exportLibrary();
        });

        document.getElementById('btn-import-library').addEventListener('click', () => {
            this._importLibrary();
        });

        // Modal close
        document.querySelector('.modal-close').addEventListener('click', () => {
            this._hideLibraryModal();
        });

        document.getElementById('library-modal').addEventListener('click', (e) => {
            if (e.target.id === 'library-modal') {
                this._hideLibraryModal();
            }
        });

        // Clear library
        document.getElementById('btn-clear-library').addEventListener('click', () => {
            if (confirm('Czy na pewno chcesz usunąć wszystkie zapisane tilesety?')) {
                this.tilesetLibrary.clearLibrary();
                this._updateLibraryModal();
                alert('Biblioteka została wyczyszczona');
            }
        });

        // Export
        document.getElementById('btn-export').addEventListener('click', () => {
            this._exportJSON();
        });

        // Cave generator
        document.getElementById('btn-cave').addEventListener('click', () => {
            this._generateCave();
        });
    }

    _updateLayerIndicators() {
        const isActive = (layer) => layer === this.activeLayer;
        
        // Update text colors
        this.layerIndicators.ground.setColor(isActive('ground') ? '#58a6ff' : '#484f58');
        this.layerIndicators.decoration.setColor(isActive('decoration') ? '#58a6ff' : '#484f58');
        this.layerIndicators.both.setColor(isActive('both') ? '#58a6ff' : '#484f58');
        
        // Update layer opacity for visual feedback
        if (this.activeLayer === 'both') {
            this.groundGroup.setAlpha(1.0);
            this.decoGroup.setAlpha(1.0);
        } else {
            this.groundGroup.setAlpha(isActive('ground') ? 1.0 : 0.6);
            this.decoGroup.setAlpha(isActive('decoration') ? 1.0 : 0.6);
        }
    }

    _saveUndoState() {
        // Deep copy of current map data for undo
        const state = {
            ground: this.mapData.layers.ground.map(row => [...row]),
            decoration: this.mapData.layers.decoration.map(row => [...row])
        };
        
        this.undoStack.push(state);
        
        // Limit undo stack size
        if (this.undoStack.length > this.maxUndoSteps) {
            this.undoStack.shift();
        }
    }

    _undo() {
        if (this.undoStack.length === 0) return;
        
        const state = this.undoStack.pop();
        
        // Restore ground layer
        for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
            for (let x = 0; x < CONFIG.MAP_WIDTH; x++) {
                this._clearTile('ground', x, y);
                this._clearTile('decoration', x, y);
                
                const groundTile = state.ground[y][x];
                const decoTile = state.decoration[y][x];
                
                if (groundTile) {
                    this._setTileNoUndo('ground', x, y, groundTile.key, groundTile.frame);
                }
                if (decoTile) {
                    this._setTileNoUndo('decoration', x, y, decoTile.key, decoTile.frame);
                }
            }
        }
    }

    _setTileNoUndo(layer, tx, ty, key, frame) {
        // Same as _setTile but without saving undo state
        this._clearTile(layer, tx, ty);

        const ts = this.tilesetMgr.getByKey(key);
        const tileSize = ts ? ts.tileSize : CONFIG.TILE_SIZE;
        
        const sprite = this.add.sprite(tx * tileSize + tileSize / 2, ty * tileSize + tileSize / 2, key, frame);
        sprite.setOrigin(0.5, 0.5);

        const group = layer === 'ground' ? this.groundGroup : this.decoGroup;
        group.add(sprite);

        this.sprites[layer][ty][tx] = sprite;
        this.mapData.set(layer, tx, ty, { key, frame });
    }

    _goToLastTile() {
        if (!this.lastPlacedTile) return;
        
        const cam = this.cameras.main;
        const { tx, ty, tileSize } = this.lastPlacedTile;
        
        // Center camera on last placed tile
        const worldX = tx * tileSize + tileSize / 2;
        const worldY = ty * tileSize + tileSize / 2;
        
        cam.centerOn(worldX, worldY);
        
        // Flash the tile position
        const flash = this.add.graphics();
        flash.lineStyle(3, 0x58a6ff, 1);
        flash.strokeRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
        flash.setDepth(1000);
        
        // Remove flash after 500ms
        setTimeout(() => flash.destroy(), 500);
    }

    _addTilesetEntry(entry) {
        const list = document.getElementById('tileset-list');
        const div  = document.createElement('div');
        div.className   = 'tileset-item';
        div.textContent = `${entry.name}  (${entry.cols}×${entry.rows})`;
        div.addEventListener('click', () => {
            document.querySelectorAll('.tileset-item').forEach(d => d.classList.remove('active'));
            div.classList.add('active');
            this.paletteUI.showTileset(entry);
        });
        list.appendChild(div);

        // Auto-select latest
        document.querySelectorAll('.tileset-item').forEach(d => d.classList.remove('active'));
        div.classList.add('active');
    }

    /* ── Library Management ── */

    _showLibraryModal() {
        document.getElementById('library-modal').style.display = 'block';
        this._updateLibraryModal();
    }

    _hideLibraryModal() {
        document.getElementById('library-modal').style.display = 'none';
    }

    _updateLibraryModal() {
        const tilesets = this.tilesetLibrary.getAllTilesets();
        document.getElementById('library-count').textContent = tilesets.length;
        
        const listContainer = document.getElementById('library-list');
        listContainer.innerHTML = '';

        tilesets.forEach(tileset => {
            const item = document.createElement('div');
            item.className = 'library-item';
            item.innerHTML = `
                <img src="${tileset.imageData}" alt="${tileset.name}">
                <div class="library-item-name">${tileset.name}</div>
                <div class="library-item-size">${tileset.cols}×${tileset.rows} (${tileset.tileSize}px)</div>
                <div class="library-item-actions">
                    <button class="tool-btn" onclick="game.scene.scenes[0]._loadLibraryTileset('${tileset.id}')">Wczytaj</button>
                    <button class="tool-btn danger" onclick="game.scene.scenes[0]._removeLibraryTileset('${tileset.id}')">Usuń</button>
                </div>
            `;
            listContainer.appendChild(item);
        });
    }

    async _loadLibraryTileset(tilesetId) {
        const tilesetData = this.tilesetLibrary.getTileset(tilesetId);
        if (!tilesetData) return;

        try {
            const entry = await this.tilesetMgr.loadFromLibrary(tilesetData);
            this._addTilesetEntry(entry);
            this.paletteUI.showTileset(entry);
            this._hideLibraryModal();
        } catch (err) {
            console.error('Failed to load library tileset:', err);
            alert('Nie udało się wczytać tilesetu z biblioteki!');
        }
    }

    _removeLibraryTileset(tilesetId) {
        if (confirm('Czy na pewno chcesz usunąć ten tileset z biblioteki?')) {
            this.tilesetLibrary.removeTileset(tilesetId);
            this._updateLibraryModal();
        }
    }

    _exportLibrary() {
        const libraryData = this.tilesetLibrary.exportLibrary();
        const blob = new Blob([JSON.stringify(libraryData)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `tileset_library_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    _importLibrary() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const libraryData = JSON.parse(text);

                if (this.tilesetLibrary.importLibrary(libraryData)) {
                    alert('Biblioteka została zaimportowana pomyślnie!');
                    this._updateLibraryModal();
                } else {
                    alert('Nieprawidłowy format pliku biblioteki!');
                }
            } catch (err) {
                console.error('Import failed:', err);
                alert('Nie udało się zaimportować biblioteki!');
            }
        };
        input.click();
    }

    async _loadLibraryOnStartup() {
        const tilesets = this.tilesetLibrary.getAllTilesets();
        
        for (const tilesetData of tilesets) {
            try {
                await this.tilesetMgr.loadFromLibrary(tilesetData);
                this._addTilesetEntry(tilesetData);
            } catch (err) {
                console.warn(`Failed to load library tileset: ${tilesetData.name}`, err);
            }
        }
    }

    /* ── Export ── */

    _exportJSON() {
        const nameInput = document.getElementById('map-name');
        const name = nameInput.value.trim() || 'untitled_map';

        const json = this.mapData.toJSON(name, this.tilesetMgr.tilesets);
        const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);

        const a  = document.createElement('a');
        a.href     = url;
        a.download = `${name}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /* ── Cave Generator ── */

    _generateCave() {
        if (this.tilesetMgr.tilesets.length === 0) {
            alert('Najpierw wgraj tileset!\nKafelek #0 = podloga, #1 = sciana.');
            return;
        }

        if (!confirm('Wygenerowac jaskinie?\nTo nadpisze cala warstwe Ground!')) return;

        const tsKey = this.tilesetMgr.tilesets[0].key;
        const grid  = CaveGenerator.generate(CONFIG.MAP_WIDTH, CONFIG.MAP_HEIGHT);

        // Clear ground
        for (let y = 0; y < CONFIG.MAP_HEIGHT; y++) {
            for (let x = 0; x < CONFIG.MAP_WIDTH; x++) {
                this._clearTile('ground', x, y);
            }
        }

        // Place tiles in batches to stay responsive
        const BATCH = 500;
        let idx = 0;
        const total = CONFIG.MAP_WIDTH * CONFIG.MAP_HEIGHT;

        const placeBatch = () => {
            const end = Math.min(idx + BATCH, total);
            for (; idx < end; idx++) {
                const x = idx % CONFIG.MAP_WIDTH;
                const y = Math.floor(idx / CONFIG.MAP_WIDTH);
                this._setTile('ground', x, y, tsKey, grid[y][x]);
            }
            if (idx < total) {
                requestAnimationFrame(placeBatch);
            }
        };
        placeBatch();
    }
}

/* ═══════════════════════════════════════════
   Bootstrap
   ═══════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('game-container');

    const game = new Phaser.Game({
        type:   Phaser.AUTO,
        parent: 'game-container',
        width:  container.clientWidth,
        height: container.clientHeight,
        backgroundColor: '#010409',
        scene:  [EditorScene],
        scale: {
            mode:       Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.NO_CENTER,
        },
        input: {
            mouse: {
                target:       container,
                preventDefaultWheel: true,
            },
        },
        render: {
            pixelArt:  true,
            antialias: false,
        },
        banner: false,
    });

/* ═══════════════════════════════════════════════════════════════
   TilesetLibrary
   Persistent tileset storage and management
   ═══════════════════════════════════════════════════════════════ */
class TilesetLibrary {
    constructor() {
        this.storageKey = 'tibia_map_editor_tilesets';
        this.tilesets = this.loadFromStorage();
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Failed to load tilesets from storage:', error);
            return [];
        }
    }

    saveToStorage() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.tilesets));
        } catch (error) {
            console.error('Failed to save tilesets to storage:', error);
        }
    }

    addTileset(name, imageData, cols, rows, tileSize) {
        const tileset = {
            id: Date.now().toString(),
            name: name,
            imageData: imageData,
            cols: cols,
            rows: rows,
            tileSize: tileSize,
            addedDate: new Date().toISOString()
        };

        this.tilesets.push(tileset);
        this.saveToStorage();
        return tileset;
    }

    removeTileset(id) {
        this.tilesets = this.tilesets.filter(t => t.id !== id);
        this.saveToStorage();
    }

    getTileset(id) {
        return this.tilesets.find(t => t.id === id);
    }

    getAllTilesets() {
        return [...this.tilesets];
    }

    exportLibrary() {
        return {
            version: '1.0',
            exportDate: new Date().toISOString(),
            tilesets: this.tilesets
        };
    }

    importLibrary(libraryData) {
        if (libraryData.version && libraryData.tilesets) {
            this.tilesets = [...this.tilesets, ...libraryData.tilesets];
            this.saveToStorage();
            return true;
        }
        return false;
    }

    clearLibrary() {
        this.tilesets = [];
        this.saveToStorage();
    }
}

    window.addEventListener('resize', () => {
        game.scale.resize(container.clientWidth, container.clientHeight);
    });
});
