# 🌳 Professional Cura-Style Tree Support System

A complete **3D printing support visualization platform** featuring authentic Cura-style tree supports with organic growth algorithms, real-time 3D manipulation, and intelligent object management.

![Tree Support Demo](https://img.shields.io/badge/Status-Production%20Ready-brightgreen) ![License](https://img.shields.io/badge/License-MIT-blue) ![Three.js](https://img.shields.io/badge/Built%20with-Three.js-orange)

## ✨ Features

### 🌲 Authentic Cura Tree Support Algorithm
- **Layer-by-Layer Growth**: 0.2cm precision layers matching professional slicing software
- **Organic Curves**: Natural tree-like branching with ±0.3cm organic movement per layer
- **Professional Tapering**: 8mm diameter base → 1.6mm diameter tips for optimal strength
- **Movement Constraints**: Maximum 1.5cm movement per layer for realistic growth patterns
- **Gradient Visualization**: Dark green base transitioning to light green tips

### 🎯 Intelligent Support Detection
- **Floating Objects**: Automatic grid-based support generation for objects above build plate
- **Edge Overhangs**: 50° overhang angle detection using Cura's algorithm
- **Central Hub**: All supports originate from a single 3cm central column
- **Smart Density**: Optimized support point spacing (4cm grid) for clean tree structure

### 🔧 Advanced 3D Printing Tools
- **STL Import**: Drag-and-drop STL file loading with automatic parsing
- **Auto-Orientation**: Intelligent object rotation for optimal 3D printing (wider base, lower height)
- **Object Cloning**: Smart duplication with automatic naming and positioning
- **Radial Arrangement**: Organize objects around central column with collision avoidance
- **Float Testing**: Lift objects 3cm above build plate to test floating support generation

### 🎨 Professional 3D Interface
- **Real-time Manipulation**: Move, rotate, and scale objects with transform controls
- **Interactive Camera**: Orbit, zoom, and pan with smooth damping
- **Object Hierarchy**: Visual object list with selection synchronization
- **Build Plate Visualization**: 20cm × 12.5cm semi-transparent build surface
- **Responsive Design**: Clean, modern UI with comprehensive toolbar

## 🚀 Quick Start

### Installation
1. **Clone the repository:**
   ```bash
   git clone https://github.com/connorkapoor/treeGenerator.git
   cd treeGenerator
   ```

2. **Serve the files** (required for STL loading):
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   
   # Using Live Server (VS Code extension)
   # Right-click index.html → "Open with Live Server"
   ```

3. **Open in browser:**
   ```
   http://localhost:8000
   ```

### Basic Usage

1. **Generate Tree Supports:**
   - Click "Generate Tree" to create supports for existing objects
   - All supports will grow organically from the central column

2. **Import 3D Models:**
   - Click "Import STL/STEP" to load your own 3D models
   - Objects are automatically oriented for optimal printing

3. **Test Floating Supports:**
   - Select any object and click "Float Test Object"
   - Generate supports to see grid-based floating object support

4. **Arrange Objects:**
   - Click "Arrange All" to organize objects around the central column
   - Use transform controls to manually position objects

## 🔬 Technical Implementation

### Tree Support Algorithm

The system implements an authentic **Cura-style tree support algorithm** with the following technical specifications:

```javascript
// Core Algorithm Parameters
const TREE_CONFIG = {
    layer_height: 0.2,              // 0.2cm layer precision
    max_move_distance: 1.5,         // Maximum movement per layer
    organic_factor: 0.3,            // Organic curve intensity
    base_radius: 0.4,               // 8mm base diameter
    tip_radius: 0.08,               // 1.6mm tip diameter
    support_angle: 50,              // 50° overhang detection
    density: 4.0                    // 4cm support point spacing
}
```

#### Growth Process:
1. **Target Detection**: Scan objects for overhangs and floating sections
2. **Path Planning**: Calculate organic growth path from central hub to targets
3. **Layer Generation**: Create individual segments with organic movement
4. **Radius Tapering**: Apply smooth radius reduction from base to tip
5. **Visualization**: Render multi-segment branches with gradient materials

### Architecture

```
├── index.html              # Main HTML structure and UI
├── script.js               # Complete Three.js implementation
├── Core Systems:
│   ├── 🌳 Tree Generation   # Cura algorithm implementation
│   ├── 📦 Object Management # Import, clone, arrange, delete
│   ├── 🎨 3D Rendering      # Three.js scene, lighting, materials
│   ├── 🎯 Support Detection # Overhang and floating object analysis
│   └── 🔧 Transform System  # Interactive object manipulation
```

## 📊 Algorithm Comparison

| Feature | This Implementation | Cura Engine | PrusaSlicer |
|---------|-------------------|-------------|-------------|
| Organic Growth | ✅ Layer-by-layer | ✅ | ❌ Grid-based |
| Movement Constraints | ✅ 1.5cm/layer | ✅ | ❌ |
| Radius Tapering | ✅ Smooth | ✅ | ✅ Stepped |
| Central Hub | ✅ Single point | ❌ Multiple | ❌ Multiple |
| Visual Quality | ✅ Gradient | ❌ Monochrome | ❌ Monochrome |

## 🎮 Controls & Interface

### Toolbar Controls
- **Point Placement**: Start Point, End Point, No Points
- **File Management**: Import STL/STEP, Delete Selected
- **Object Tools**: Auto Orient, Clone Selected, Arrange All, Float Test
- **Tree Generation**: Generate Tree, Clear Trees, Reset All

### Mouse Controls
- **Left Click**: Select objects and place points
- **Right Drag**: Orbit camera around scene
- **Mouse Wheel**: Zoom in/out
- **Transform Gizmos**: Move/rotate/scale selected objects

### Keyboard Shortcuts
- **Delete/Backspace**: Delete selected object
- **Escape**: Clear selection

## 🔧 Advanced Features

### Object Management
```javascript
// Auto-orientation algorithm
function autoOrientObject(object) {
    // Tests 8 different orientations
    // Scores based on: base area, height, overhang minimization
    // Applies optimal rotation for 3D printing
}

// Smart cloning with naming
function cloneSelectedObject() {
    // Creates "Object (Copy 1)", "Object (Copy 2)", etc.
    // Positions clones with 3cm offset
    // Maintains material and transform properties
}
```

### Support Detection
```javascript
// Floating object detection
const isFloating = bbox.min.y > (buildPlateLevel + 0.5);

// Overhang detection using Cura's 50° rule
const needsSupport = overhangDistance > maxSupportedOverhang;
```

## 🎯 Use Cases

### 3D Printing Workflow
1. **Design Validation**: Visualize support requirements before printing
2. **Support Optimization**: Test different orientations and arrangements
3. **Material Estimation**: Calculate support material usage
4. **Print Planning**: Optimize build plate utilization

### Educational Applications
1. **Algorithm Visualization**: Understand how tree supports grow
2. **3D Printing Education**: Learn support generation principles
3. **Computational Geometry**: Explore path finding and collision avoidance

### Research & Development
1. **Algorithm Testing**: Compare different support strategies
2. **Performance Analysis**: Benchmark support generation speed
3. **Visual Debugging**: Debug support placement issues

## 🔮 Future Enhancements

### Planned Features
- [ ] **Multi-Material Support**: Different materials for base vs tips
- [ ] **Support Removal Simulation**: Visualize support removal process
- [ ] **Print Time Estimation**: Calculate printing duration with supports
- [ ] **G-code Export**: Generate actual printer instructions
- [ ] **Advanced Collision Detection**: More sophisticated object avoidance
- [ ] **Custom Support Patterns**: User-defined support structures

### Performance Optimizations
- [ ] **WebGL Acceleration**: GPU-based tree generation
- [ ] **Level-of-Detail**: Adaptive rendering for large scenes
- [ ] **Spatial Indexing**: Faster collision detection
- [ ] **Background Processing**: Multi-threaded tree generation

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test thoroughly
4. Commit with descriptive messages: `git commit -m "Add amazing feature"`
5. Push to your branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

### Code Style
- Use descriptive variable names and comments
- Follow the existing Three.js patterns
- Add console logging for debugging complex algorithms
- Test with various STL files and object arrangements

### Bug Reports
Please include:
- Browser and version
- Steps to reproduce
- Expected vs actual behavior
- Console error messages
- Sample STL files (if relevant)

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Three.js Team**: For the excellent 3D graphics library
- **Ultimaker Cura**: For the tree support algorithm inspiration
- **3D Printing Community**: For feedback and testing

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/connorkapoor/treeGenerator/issues)
- **Discussions**: [GitHub Discussions](https://github.com/connorkapoor/treeGenerator/discussions)
- **Email**: Create an issue for support requests

---

<div align="center">

**⭐ Star this repository if you find it useful!**

Built with ❤️ for the 3D printing community

</div> 