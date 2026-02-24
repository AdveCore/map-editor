# 🗺️ Tibia Map Editor

Professional 2D tilemap editor for MMO games with collaborative tileset library.

## ✨ Features

- **🎨 Advanced Drawing Tools** - Brush, eraser, fill, pipette
- **📚 Tileset Library** - Shared tileset collection via GitHub
- **🖱️ Windows-style Selection** - LPM+drag rectangle selection
- **👁️ Multi-layer System** - Ground, Decoration, and combined view
- **↶ Undo/Redo** - 50-step history
- **🔍 Zoom & Pan** - Smooth camera controls
- **💾 Export** - JSON map format
- **🌳 Cave Generator** - Procedural cave generation

## 🚀 Quick Start

### Online Version
Open `https://advecore.github.io/map-editor/` in your browser.

### Local Development
```bash
git clone https://github.com/advecore/map-editor.git
cd map-editor

# Open index.html in browser - that's it!
```

**No configuration needed!** The app works out of the box with cloud sync enabled.

## 📚 Tileset Library

The editor uses GitHub API to store and share tilesets with proper licensing:

### ⚖️ Legal Notice
**All tilesets must be legally uploaded with proper licensing:**
- Only upload content you have full rights to
- Choose appropriate free-use license (CC0, CC-BY, MIT)
- You are fully responsible for uploaded content
- Illegal content will be removed and access revoked

### Adding Tilesets
1. Click "� Wgraj do biblioteki" 
2. Read and accept legal disclaimer
3. Select PNG/JPG file with proper licensing
3. Tileset is automatically saved to shared library

### Sharing Tilesets
1. Click "🔗 Eksportuj bibliotekę" - download JSON
2. Share JSON file with others
3. Others click "🔥 Importuj bibliotekę" to load

### GitHub Integration
- Tilesets stored in `data/tilesets.json`
- Automatic sync with GitHub repository
- Collaborative editing across users

## 🎮 Controls

### Map Editing
- **LPM** - Place selected tile
- **PPM/ŚPM** - Pan camera
- **Scroll** - Zoom in/out
- **Ctrl+LPM** - Multi-select tiles
- **LPM+Drag** - Rectangle selection

### Palette
- **LPM** - Select single tile
- **Ctrl+LPM** - Add to multi-selection
- **Alt+Drag** - Rectangle selection
- **Shift+LPM/ŚPM** - Pan palette

### Tools
- **↶ Cofnij** - Undo last action
- **🔍 Reset zoom** - Return to 100% zoom
- **👆 Ostatni kafelek** - Jump to last placed tile

## 🗂️ Project Structure

```
tibia-map-editor/
├── index.html          # Main application
├── style.css          # Styles
├── game.js            # Game logic
├── data/
│   └── tilesets.json  # Shared tileset library
├── README.md          # Documentation
└── .gitignore         # Git ignore rules
```

## 🌐 Deployment

### GitHub Pages (Recommended)
1. Push to `main` branch
2. Enable GitHub Pages in repository settings
3. Select source: Deploy from branch → main
4. Site available at `https://[username].github.io/tibia-map-editor`

### Manual Deployment
Copy all files to any web server - no server-side code required!

## 🔧 Technologies

- **Phaser 3** - Game engine
- **Vanilla JavaScript** - No build tools required
- **GitHub API** - Tileset storage
- **LocalStorage** - Temporary cache
- **CSS Grid/Flexbox** - Responsive layout

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

## 📄 License

MIT License - feel free to use in your projects!

## 🆘 Support

- Create issue on GitHub for bugs
- Check README for common problems
- Join Discord community (link in issues)

---

Made with ❤️ for the Tibia community
