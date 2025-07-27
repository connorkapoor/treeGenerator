// Scene setup
const scene = new THREE.Scene();

// Camera setup
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x222222);
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 10, 5);
scene.add(directionalLight);

// Build plate (20cm x 12.5cm)
const buildPlateGeometry = new THREE.PlaneGeometry(20, 12.5);
const buildPlateMaterial = new THREE.MeshLambertMaterial({ 
    color: 0x808080,
    transparent: true,
    opacity: 0.8
});
const buildPlate = new THREE.Mesh(buildPlateGeometry, buildPlateMaterial);
buildPlate.rotation.x = -Math.PI / 2; // Rotate to lay flat (horizontal)
buildPlate.position.set(0, -2.5, 0); // Position below cubes (cubes are 5cm tall, so bottom at y=-2.5)
buildPlate.name = "Build Plate (20cm x 12.5cm)";
buildPlate.userData.type = 'buildplate';
scene.add(buildPlate);

// Central support column (20cm tall, 3cm diameter)
const columnGeometry = new THREE.CylinderGeometry(1.5, 1.5, 20, 16); // 3cm diameter, 20cm tall
const columnMaterial = new THREE.MeshLambertMaterial({ 
    color: 0x606060,
    transparent: false
});
const centralColumn = new THREE.Mesh(columnGeometry, columnMaterial);
centralColumn.position.set(0, 7.5, 0); // Position so base is on build plate (20cm/2 - 2.5 = 7.5)
centralColumn.name = "Central Support Column (3cm x 20cm)";
centralColumn.userData.type = 'support_column';
scene.add(centralColumn);

// Create first cube (5cm x 5cm x 5cm, positioned for 10cm total gap)
const geometry1 = new THREE.BoxGeometry(5, 5, 5); // 5cm cube
const material1 = new THREE.MeshLambertMaterial({ color: 0xff6b6b });
const cube1 = new THREE.Mesh(geometry1, material1);
cube1.position.set(-7.5, 0, 0); // 10cm total separation
cube1.name = "Red Cube (5cm)";
cube1.userData.type = 'cube';
scene.add(cube1);

// Create second cube (5cm x 5cm x 5cm)
const geometry2 = new THREE.BoxGeometry(5, 5, 5); // 5cm cube  
const material2 = new THREE.MeshLambertMaterial({ color: 0x4ecdc4 });
const cube2 = new THREE.Mesh(geometry2, material2);
cube2.position.set(7.5, 0, 0); // 10cm total separation
cube2.name = "Teal Cube (5cm)";
cube2.userData.type = 'cube';
scene.add(cube2);

// Position camera for better view of 5cm cubes (15cm total scene)
camera.position.set(0, 8, 25); // Pull back to see full 15cm wide scene
camera.lookAt(0, 0, 0);

// Update camera position to view the full scene including 20cm column
camera.position.set(0, 15, 30); // Higher and further back to see 20cm column
camera.lookAt(0, 5, 0); // Look at middle height of scene

// Controls setup
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 2;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI / 2;

// Transform controls
const transformControls = new THREE.TransformControls(camera, renderer.domElement);
transformControls.setMode('translate'); // Start in translate mode
scene.add(transformControls);

// Disable orbit controls when using transform controls
transformControls.addEventListener('dragging-changed', function(event) {
    controls.enabled = !event.value;
});

// Raycasting for object selection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const selectableObjects = [cube1, cube2];

// File loading system
const stlLoader = new THREE.STLLoader();
let importedObjects = []; // Track imported objects separately
let selectedObject = null; // Track currently selected object

// Point placement system
let pointPlacementMode = 'none'; // 'none', 'start', 'end'
const allPoints = [];

// Tree generation state
let isGeneratingTree = false;

// Point geometries and materials (scaled for 5cm cubes)
const pointGeometry = new THREE.SphereGeometry(0.25, 8, 6); // 5mm radius indicators
const startPointMaterial = new THREE.MeshLambertMaterial({ color: 0xFF5722, emissive: 0x221100 });
const endPointMaterial = new THREE.MeshLambertMaterial({ color: 0x2196F3, emissive: 0x001122 });

function createPoint(type, position, normal, parentCube) {
    const material = type === 'start' ? startPointMaterial : endPointMaterial;
    const point = new THREE.Mesh(pointGeometry, material);
    
    // Set point properties
    point.name = type === 'start' ? 'Start Point' : 'End Point';
    point.userData = {
        type: type,
        parentCube: parentCube,
        localPosition: new THREE.Vector3(),
        localNormal: new THREE.Vector3()
    };
    
    // Convert world position to local position relative to parent cube
    const localPosition = new THREE.Vector3();
    parentCube.worldToLocal(localPosition.copy(position));
    point.userData.localPosition.copy(localPosition);
    
    // Convert world normal to local normal
    const localNormal = new THREE.Vector3();
    const worldToLocalMatrix = new THREE.Matrix3().getNormalMatrix(parentCube.matrixWorld.clone().invert());
    localNormal.copy(normal).applyMatrix3(worldToLocalMatrix).normalize();
    point.userData.localNormal.copy(localNormal);
    
            // Position the point slightly offset from surface  
        point.position.copy(localPosition);
        point.position.add(localNormal.clone().multiplyScalar(1.0)); // 1cm offset from 5cm cube surface
    
    // Add as child to parent cube so it transforms with it
    parentCube.add(point);
    allPoints.push(point);
    
    return point;
}

function placePointOnSurface(event, targetCube) {
    if (pointPlacementMode === 'none') return;
    
    // Calculate mouse position
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Raycast specifically to the target cube
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(targetCube);
    
    if (intersects.length > 0) {
        const intersection = intersects[0];
        const point = createPoint(
            pointPlacementMode,
            intersection.point,
            intersection.face.normal,
            targetCube
        );
        
        // Update object list
        populateObjectList();
        
        return point;
    }
    
    return null;
}

// Cura-style Tree Support Algorithm
// Based on analysis of CuraEngine source code

// Configuration parameters (matching Cura's defaults)
const TREE_CONFIG = {
    // Branch settings
    branch_radius: 1.5,
    branch_diameter_angle: 7.0 * Math.PI / 180, // 7 degrees in radians
    tip_diameter: 0.8,
    
    // Movement settings
    maximum_move_distance: 5.0,     // Fast movement distance
    maximum_move_distance_slow: 2.5, // Slow movement distance
    
    // Layer settings
    layer_height: 0.2,
    tip_layers: 4,
    
    // Support settings
    support_angle: 50.0 * Math.PI / 180, // 50 degrees overhang angle
    support_xy_distance: 0.7,
    support_z_distance: 0.2,
    
    // Tree structure settings
    tree_support_branch_distance: 4.0,
    tree_support_collision_resolution: 0.5
};

// TreeSupportElement - represents a node in the tree support structure
class TreeSupportElement {
    constructor(position, layer, distance_to_top, options = {}) {
        this.position = { ...position };          // Current position
        this.layer = layer;                       // Current layer index
        this.distance_to_top = distance_to_top;   // Distance from original tip
        
        // Support properties
        this.to_buildplate = options.to_buildplate !== false;
        this.to_model_gracious = options.to_model_gracious || false;
        this.radius = this.calculateRadius();
        
        // Tree structure
        this.parent = options.parent || null;
        this.children = [];
        this.influence_area = null;
        
        // Movement tracking
        this.last_move_distance = 0;
        this.can_use_safe_radius = true;
        
        if (this.parent) {
            this.parent.children.push(this);
        }
    }
    
    calculateRadius() {
        // Cura's radius calculation: increases with distance from tip
        const base_radius = TREE_CONFIG.tip_diameter / 2;
        const angle_factor = Math.tan(TREE_CONFIG.branch_diameter_angle);
        return Math.min(
            base_radius + this.distance_to_top * TREE_CONFIG.layer_height * angle_factor,
            TREE_CONFIG.branch_radius
        );
    }
    
    getInfluenceRadius() {
        // Influence area is larger than branch radius for movement
        return this.radius + TREE_CONFIG.support_xy_distance;
    }
}

// TreeSupportTipGenerator - generates initial support tips from overhangs
class TreeSupportTipGenerator {
    constructor(scene) {
        this.scene = scene;
        this.cube = scene.children.find(child => child.userData.type === 'cube');
        this.layer_height = TREE_CONFIG.layer_height;
        this.overhang_areas = [];
        this.tips = [];
    }
    
    detectOverhangs() {
        console.log("🔍 Detecting overhangs that need support...");
        
        this.overhang_areas = [];
        if (!this.cube) return;
        
        // Get cube bounds
        const box = new THREE.Box3().setFromObject(this.cube);
        const layers = Math.ceil((box.max.z - box.min.z) / this.layer_height);
        
        // Analyze each layer for overhangs
        for (let layer = 1; layer < layers; layer++) {
            const z = box.min.z + layer * this.layer_height;
            const overhangs = this.findOverhangsAtLayer(z, layer);
            
            if (overhangs.length > 0) {
                this.overhang_areas.push({
                    layer: layer,
                    z: z,
                    areas: overhangs
                });
                console.log(`  Layer ${layer}: Found ${overhangs.length} overhang areas`);
            }
        }
        
        console.log(`Found overhangs on ${this.overhang_areas.length} layers`);
        return this.overhang_areas;
    }
    
    findOverhangsAtLayer(z, layer) {
        // Simplified overhang detection - points that extend beyond support angle
        const overhangs = [];
        if (!this.cube) return overhangs;
        
        const box = new THREE.Box3().setFromObject(this.cube);
        const overhang_distance = this.layer_height / Math.tan(TREE_CONFIG.support_angle);
        
        // Sample points around the cube perimeter at this layer
        const samples = 32;
        for (let i = 0; i < samples; i++) {
            const angle = (i / samples) * Math.PI * 2;
            const radius = Math.max(
                Math.abs((box.max.x - box.min.x) / 2 / Math.cos(angle)),
                Math.abs((box.max.y - box.min.y) / 2 / Math.sin(angle))
            );
            
            const x = box.getCenter(new THREE.Vector3()).x + Math.cos(angle) * radius;
            const y = box.getCenter(new THREE.Vector3()).y + Math.sin(angle) * radius;
            
            // Check if this point needs support
            if (this.needsSupport(x, y, z, overhang_distance)) {
                overhangs.push({
                    position: { x, y, z },
                    normal: { x: Math.cos(angle), y: Math.sin(angle), z: 0 }
                });
            }
        }
        
        return overhangs;
    }
    
    needsSupport(x, y, z, overhang_distance) {
        // Check if point extends beyond supportable overhang angle
        const cube_box = new THREE.Box3().setFromObject(this.cube);
        
        // Point is outside the cube bounds (overhang)
        if (x < cube_box.min.x - overhang_distance || x > cube_box.max.x + overhang_distance ||
            y < cube_box.min.y - overhang_distance || y > cube_box.max.y + overhang_distance) {
            return false;
        }
        
        // Simple heuristic: if point is near cube edge and above certain height
        const center = cube_box.getCenter(new THREE.Vector3());
        const dist_from_center = Math.sqrt((x - center.x) ** 2 + (y - center.y) ** 2);
        const cube_radius = Math.max(cube_box.max.x - center.x, cube_box.max.y - center.y);
        
        return dist_from_center > cube_radius * 0.7 && z > cube_box.min.z + 0.5;
    }
    
    generateTips() {
        console.log("🌱 Generating support tips from overhangs...");
        
        this.tips = [];
        
        for (const overhang_layer of this.overhang_areas) {
            for (const overhang of overhang_layer.areas) {
                // Create tip with appropriate spacing
                if (this.shouldPlaceTip(overhang.position)) {
                    const tip = new TreeSupportElement(
                        overhang.position,
                        overhang_layer.layer,
                        0, // distance_to_top = 0 for tips
                        {
                            to_buildplate: true,
                            to_model_gracious: false
                        }
                    );
                    
                    this.tips.push(tip);
                    console.log(`  Tip placed at (${overhang.position.x.toFixed(2)}, ${overhang.position.y.toFixed(2)}, ${overhang.position.z.toFixed(2)})`);
                }
            }
        }
        
        console.log(`Generated ${this.tips.length} support tips`);
        return this.tips;
    }
    
    shouldPlaceTip(position) {
        // Check minimum distance to existing tips
        const min_distance = TREE_CONFIG.tree_support_branch_distance;
        
        for (const existing_tip of this.tips) {
            const dist = Math.sqrt(
                (position.x - existing_tip.position.x) ** 2 +
                (position.y - existing_tip.position.y) ** 2 +
                (position.z - existing_tip.position.z) ** 2
            );
            
            if (dist < min_distance) {
                return false;
            }
        }
        
        return true;
    }
}

// TreeModelVolumes - handles collision detection and avoidance
class TreeModelVolumes {
    constructor(scene) {
        this.scene = scene;
        this.cube = scene.children.find(child => child.userData.type === 'cube');
        this.collision_cache = new Map();
        this.avoidance_cache = new Map();
    }
    
    isColliding(position, radius) {
        if (!this.cube) return false;
        
        // Create bounding box for the support element
        const support_box = new THREE.Box3(
            new THREE.Vector3(position.x - radius, position.y - radius, position.z - radius),
            new THREE.Vector3(position.x + radius, position.y + radius, position.z + radius)
        );
        
        // Check collision with cube
        const cube_box = new THREE.Box3().setFromObject(this.cube);
        return support_box.intersectsBox(cube_box);
    }
    
    getAvoidanceArea(position, radius, layer) {
        // Return area where support can be placed without collision
        const avoidance_radius = radius + TREE_CONFIG.support_xy_distance;
        
        // For now, simple circular area avoiding cube
        if (!this.cube) {
            return {
                center: { ...position },
                radius: avoidance_radius
            };
        }
        
        const cube_box = new THREE.Box3().setFromObject(this.cube);
        const center = cube_box.getCenter(new THREE.Vector3());
        
        // If too close to cube, push away
        const dist_to_cube = Math.sqrt(
            (position.x - center.x) ** 2 + (position.y - center.y) ** 2
        );
        
        const cube_radius = Math.max(
            cube_box.max.x - center.x,
            cube_box.max.y - center.y
        ) + avoidance_radius;
        
        if (dist_to_cube < cube_radius) {
            const push_angle = Math.atan2(position.y - center.y, position.x - center.x);
            return {
                center: {
                    x: center.x + Math.cos(push_angle) * cube_radius,
                    y: center.y + Math.sin(push_angle) * cube_radius,
                    z: position.z
                },
                radius: avoidance_radius
            };
        }
        
        return {
            center: { ...position },
            radius: avoidance_radius
        };
    }
}

// TreeSupport - main tree support algorithm
class TreeSupport {
    constructor(scene) {
        this.scene = scene;
        this.tip_generator = new TreeSupportTipGenerator(scene);
        this.model_volumes = new TreeModelVolumes(scene);
        this.support_elements = [];
        this.layer_data = [];
    }
    
    generateSupportAreas() {
        console.log("=== Cura-Style Tree Support Generation ===");
        
        // Phase 1: Detect overhangs and generate tips
        const overhangs = this.tip_generator.detectOverhangs();
        if (overhangs.length === 0) {
            console.log("No overhangs detected, no support needed");
            return [];
        }
        
        const tips = this.tip_generator.generateTips();
        if (tips.length === 0) {
            console.log("No tips generated, no support needed");
            return [];
        }
        
        // Phase 2: Initialize layer data structure
        this.initializeLayerData(tips);
        
        // Phase 3: Propagate influence areas downward (layer pathing)
        this.createLayerPathing();
        
        // Phase 4: Place support nodes
        this.createNodesFromAreas();
        
        // Phase 5: Generate final support geometry
        return this.generateSupportGeometry();
    }
    
    initializeLayerData(tips) {
        console.log("📊 Initializing layer data structure...");
        
        // Find layer range
        const max_layer = Math.max(...tips.map(tip => tip.layer));
        this.layer_data = Array.from({ length: max_layer + 1 }, () => []);
        
        // Place tips in their respective layers
        for (const tip of tips) {
            this.layer_data[tip.layer].push(tip);
        }
        
        console.log(`Initialized ${this.layer_data.length} layers`);
    }
    
    createLayerPathing() {
        console.log("🌳 Creating layer pathing (propagating influence areas)...");
        
        // Process layers from top to bottom
        for (let layer = this.layer_data.length - 1; layer > 0; layer--) {
            const current_elements = this.layer_data[layer];
            if (current_elements.length === 0) continue;
            
            console.log(`Processing layer ${layer} with ${current_elements.length} elements`);
            
            // For each element in current layer, try to create child in layer below
            for (const element of current_elements) {
                this.propagateElement(element, layer - 1);
            }
            
            // Merge overlapping influence areas in the layer below
            if (this.layer_data[layer - 1].length > 1) {
                this.mergeInfluenceAreas(layer - 1);
            }
        }
    }
    
    propagateElement(element, target_layer) {
        if (target_layer < 0) return;
        
        // Calculate possible movement based on Cura's algorithm
        const max_move = element.distance_to_top < TREE_CONFIG.tip_layers 
            ? TREE_CONFIG.maximum_move_distance_slow 
            : TREE_CONFIG.maximum_move_distance;
        
        // Try different movement strategies (following Cura's approach)
        const movement_attempts = [
            { x: 0, y: 0 }, // Try not moving first
            { x: max_move, y: 0 },
            { x: -max_move, y: 0 },
            { x: 0, y: max_move },
            { x: 0, y: -max_move },
            { x: max_move * 0.7, y: max_move * 0.7 },
            { x: -max_move * 0.7, y: max_move * 0.7 },
            { x: max_move * 0.7, y: -max_move * 0.7 },
            { x: -max_move * 0.7, y: -max_move * 0.7 }
        ];
        
        for (const movement of movement_attempts) {
            const new_position = {
                x: element.position.x + movement.x,
                y: element.position.y + movement.y,
                z: element.position.z - TREE_CONFIG.layer_height
            };
            
            // Check if this position is valid
            if (this.isValidPosition(new_position, element.radius)) {
                // Create child element
                const child = new TreeSupportElement(
                    new_position,
                    target_layer,
                    element.distance_to_top + 1,
                    {
                        parent: element,
                        to_buildplate: element.to_buildplate,
                        to_model_gracious: element.to_model_gracious
                    }
                );
                
                child.last_move_distance = Math.sqrt(movement.x ** 2 + movement.y ** 2);
                this.layer_data[target_layer].push(child);
                
                console.log(`  Propagated element to (${new_position.x.toFixed(2)}, ${new_position.y.toFixed(2)}) with move distance ${child.last_move_distance.toFixed(2)}`);
                return; // Success, try next element
            }
        }
        
        console.log(`  ❌ Failed to propagate element from layer ${element.layer}`);
    }
    
    isValidPosition(position, radius) {
        // Check collision with model
        if (this.model_volumes.isColliding(position, radius)) {
            return false;
        }
        
        // Check if still above buildplate (with some margin)
        if (position.z < -1.0) {
            return false;
        }
        
        // Check bounds (simple boundary check)
        const bounds = 20; // Reasonable print area
        if (Math.abs(position.x) > bounds || Math.abs(position.y) > bounds) {
            return false;
        }
        
        return true;
    }
    
    mergeInfluenceAreas(layer) {
        console.log(`  🔗 Merging influence areas on layer ${layer}`);
        
        const elements = this.layer_data[layer];
        const merged_elements = [];
        const merged_indices = new Set();
        
        for (let i = 0; i < elements.length; i++) {
            if (merged_indices.has(i)) continue;
            
            const element_a = elements[i];
            let merged_with_any = false;
            
            for (let j = i + 1; j < elements.length; j++) {
                if (merged_indices.has(j)) continue;
                
                const element_b = elements[j];
                
                // Check if influence areas overlap
                if (this.shouldMergeElements(element_a, element_b)) {
                    // Merge elements
                    const merged = this.mergeElements(element_a, element_b, layer);
                    merged_elements.push(merged);
                    merged_indices.add(i);
                    merged_indices.add(j);
                    merged_with_any = true;
                    
                    console.log(`    Merged 2 elements at (${element_a.position.x.toFixed(1)}, ${element_a.position.y.toFixed(1)}) and (${element_b.position.x.toFixed(1)}, ${element_b.position.y.toFixed(1)})`);
                    break;
                }
            }
            
            if (!merged_with_any) {
                merged_elements.push(element_a);
            }
        }
        
        this.layer_data[layer] = merged_elements;
        console.log(`    Result: ${elements.length} → ${merged_elements.length} elements`);
    }
    
    shouldMergeElements(element_a, element_b) {
        // Check if influence areas overlap
        const dist = Math.sqrt(
            (element_a.position.x - element_b.position.x) ** 2 +
            (element_a.position.y - element_b.position.y) ** 2
        );
        
        const influence_a = element_a.getInfluenceRadius();
        const influence_b = element_b.getInfluenceRadius();
        
        return dist < (influence_a + influence_b) * 0.8; // Allow some overlap
    }
    
    mergeElements(element_a, element_b, layer) {
        // Create merged element at average position
        const merged_position = {
            x: (element_a.position.x + element_b.position.x) / 2,
            y: (element_a.position.y + element_b.position.y) / 2,
            z: (element_a.position.z + element_b.position.z) / 2
        };
        
        const merged = new TreeSupportElement(
            merged_position,
            layer,
            Math.min(element_a.distance_to_top, element_b.distance_to_top),
            {
                to_buildplate: element_a.to_buildplate && element_b.to_buildplate,
                to_model_gracious: element_a.to_model_gracious && element_b.to_model_gracious
            }
        );
        
        // Merge parent relationships
        if (element_a.parent) merged.children.push(element_a.parent);
        if (element_b.parent) merged.children.push(element_b.parent);
        
        return merged;
    }
    
    createNodesFromAreas() {
        console.log("📍 Creating support nodes from influence areas...");
        
        let total_nodes = 0;
        for (let layer = 0; layer < this.layer_data.length; layer++) {
            const elements = this.layer_data[layer];
            
            for (const element of elements) {
                // Set final node position (for now, use element position)
                element.final_position = { ...element.position };
                total_nodes++;
            }
        }
        
        console.log(`Created ${total_nodes} support nodes`);
    }
    
    generateSupportGeometry() {
        console.log("🏗️ Generating final support geometry...");
        
        const support_lines = [];
        let total_branches = 0;
        
        // Generate support branches for each layer
        for (let layer = 0; layer < this.layer_data.length; layer++) {
            const elements = this.layer_data[layer];
            
            for (const element of elements) {
                // Create vertical support column
                const branch = this.createSupportBranch(element);
                if (branch) {
                    support_lines.push(branch);
                    total_branches++;
                }
                
                // Connect to parent if exists
                if (element.parent && element.parent.final_position) {
                    const connection = this.createParentConnection(element, element.parent);
                    if (connection) {
                        support_lines.push(connection);
                    }
                }
            }
        }
        
        console.log(`Generated ${total_branches} support branches`);
        console.log("✅ Tree support generation completed!");
        
        return support_lines;
    }
    
    createSupportBranch(element) {
        // Create vertical support branch
        const radius = element.radius;
        const height = TREE_CONFIG.layer_height;
        
        return {
            type: 'cylinder',
            position: element.final_position,
            radius: radius,
            height: height,
            element: element
        };
    }
    
    createParentConnection(child, parent) {
        // Create connecting branch between child and parent
        const start = child.final_position;
        const end = parent.final_position;
        
        const distance = Math.sqrt(
            (end.x - start.x) ** 2 + (end.y - start.y) ** 2 + (end.z - start.z) ** 2
        );
        
        if (distance < 0.01) return null; // Too close, skip
        
        return {
            type: 'connection',
            start: start,
            end: end,
            radius: Math.min(child.radius, parent.radius),
            distance: distance
        };
    }
}

// Helper function to get repulsion vector away from nearest cube surface
function getRepulsionVector(position) {
    let minDistance = Infinity;
    let closestPoint = null;
    
    // Check distance to both cubes
    [cube1, cube2].forEach(cube => {
        const localPoint = new THREE.Vector3();
        cube.worldToLocal(localPoint.copy(position));
        
        // Clamp to cube boundaries
        const size = 2.5; // Half cube size (5cm cube = 2.5cm radius)
        const clamped = new THREE.Vector3(
            Math.max(-size, Math.min(size, localPoint.x)),
            Math.max(-size, Math.min(size, localPoint.y)),
            Math.max(-size, Math.min(size, localPoint.z))
        );
        
        // Convert back to world space
        cube.localToWorld(clamped);
        
        const distance = position.distanceTo(clamped);
        if (distance < minDistance) {
            minDistance = distance;
            closestPoint = clamped;
        }
    });
    
    if (closestPoint) {
        return new THREE.Vector3().subVectors(position, closestPoint).normalize();
    }
    
    return new THREE.Vector3();
}

// Helper function to calculate node depth from root
function getNodeDepth(node) {
    let depth = 0;
    let current = node;
    while (current.parent) {
        depth++;
        current = current.parent;
    }
    return depth;
}

function getRandomDirection(targetDirection, randomness = 0.3) {
    const randomVec = new THREE.Vector3(
        (Math.random() - 0.5) * randomness,
        (Math.random() - 0.5) * randomness,
        (Math.random() - 0.5) * randomness
    );
    
    return targetDirection.clone().add(randomVec).normalize();
}

async function generateTreeStep() {
    if (!isGeneratingTree) return;
    
    // Check if we have any active attractors left
    const activeAttractors = attractors.filter(a => a.isActive);
    if (activeAttractors.length === 0) {
        isGeneratingTree = false;
        updateTreeButtonStates();
        console.log("Tree generation completed! All attractors reached with natural growth.");
        return;
    }
    
    // Perform one step of space colonization growth
    const grewSuccessfully = spaceColonizationGrowth();
    
    if (!grewSuccessfully) {
        // No growth occurred, check if we're stuck
        const growingNodes = treeNodes.filter(node => node.isGrowing);
        if (growingNodes.length === 0) {
            isGeneratingTree = false;
            updateTreeButtonStates();
            console.log("Tree generation completed! No more growing nodes.");
            return;
        }
    }
    
    // Continue generation
    setTimeout(generateTreeStep, generationSpeed);
}

function startTreeGeneration() {
    if (isGeneratingTree) return;
    
    // Clear existing trees
    clearTrees();
    
    // Check if we have start and end points
    const startPoints = allPoints.filter(p => p.userData.type === 'start');
    const endPoints = allPoints.filter(p => p.userData.type === 'end');
    
    if (startPoints.length === 0 || endPoints.length === 0) {
        alert('Please place both start points and end points before generating trees.');
        return;
    }
    
    console.log(`=== Cura-Style Tree Generation ===`);
    console.log(`${endPoints.length} end points (growth starts) → ${startPoints.length} start points (growth targets)`);
    
    // Initialize the space colonization algorithm (CORRECTED: FROM end TO start)
    createAttractorsFromStartPoints();   // Start points become attractors (targets)
    createGrowthNodesFromEndPoints();    // End points become initial growth nodes (sources)
    
    if (attractors.length === 0 || treeNodes.length === 0) {
        alert('Failed to initialize tree generation. Please check your points.');
        return;
    }
    
    console.log(`Initialized: ${treeNodes.length} growth nodes, ${attractors.length} attractors`);
    
    isGeneratingTree = true;
    updateTreeButtonStates();
    
    // Start the iterative growth process
    generateTreeStep();
}

// CORRECTED: Start points become attractors (targets for convergence)
function createAttractorsFromStartPoints() {
    attractors.length = 0; // Clear previous attractors
    
    const startPoints = allPoints.filter(p => p.userData.type === 'start');
    
    startPoints.forEach((point, index) => {
        const worldPos = new THREE.Vector3();
        point.getWorldPosition(worldPos);
        
        const attractor = new Attractor(worldPos);
        attractors.push(attractor);
        
        console.log(`Target Attractor ${index + 1}: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})`);
    });
}

// CORRECTED: End points become initial growth nodes (thin branches)
function createGrowthNodesFromEndPoints() {
    treeNodes.length = 0; // Clear previous nodes
    
    const endPoints = allPoints.filter(p => p.userData.type === 'end');
    
    endPoints.forEach((point, index) => {
        const worldPos = new THREE.Vector3();
        point.getWorldPosition(worldPos);
        
        // Move slightly away from surface to avoid immediate collision
        const surfaceNormal = new THREE.Vector3();
        const worldToLocalMatrix = new THREE.Matrix3().getNormalMatrix(point.userData.parentCube.matrixWorld);
        surfaceNormal.copy(point.userData.localNormal).applyMatrix3(worldToLocalMatrix).normalize();
        worldPos.add(surfaceNormal.multiplyScalar(0.1));
        
        const branchNode = new TreeNode(worldPos, null);
        branchNode.isGrowing = true;
        branchNode.thickness = TIP_THICKNESS; // Start thin at end points
        branchNode.nodeColor = 0x00aaff; // Light blue for branch starts
        treeNodes.push(branchNode);
        
        console.log(`Branch start ${index + 1}: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})`);
    });
}

// Progressive merging is now handled inline during growth for better control

function addDebugMarkers() {
    // Add small spheres to show attractor and growth node positions
    const attractorGeometry = new THREE.SphereGeometry(0.03, 8, 6);
    const attractorMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
    
    const growthGeometry = new THREE.SphereGeometry(0.025, 8, 6);
    const growthMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
    
    attractors.forEach((attractor, index) => {
        const sphere = new THREE.Mesh(attractorGeometry, attractorMaterial);
        sphere.position.copy(attractor.position);
        sphere.name = `debug_attractor_${index}`;
        scene.add(sphere);
        treeBranches.push(sphere); // Add to cleanup list
    });
    
    treeNodes.forEach((node, index) => {
        const sphere = new THREE.Mesh(growthGeometry, growthMaterial);
        sphere.position.copy(node.position);
        sphere.name = `debug_growth_${index}`;
        scene.add(sphere);
        treeBranches.push(sphere); // Add to cleanup list
    });
    
    console.log(`Added debug markers: ${attractors.length} red attractors, ${treeNodes.length} green growth nodes`);
}

function clearTrees() {
    // Remove all tree meshes from scene
    treeBranches.forEach(branch => {
        scene.remove(branch);
        branch.geometry.dispose();
    });
    
    // Clear arrays
    treeNodes.length = 0;
    treeBranches.length = 0;
    attractors.length = 0;
    
    isGeneratingTree = false;
    updateTreeButtonStates();
}

function clearSupport() {
    // Remove all support meshes from scene
    scene.children.forEach(child => {
        if (child.userData && child.userData.type === 'tree_support') {
            scene.remove(child);
            child.geometry.dispose();
        }
    });
    console.log("Support visualization cleared.");
}

// File Import Functions
function importSTLFile(file) {
    const reader = new FileReader();
    
    reader.onload = function(event) {
        const contents = event.target.result;
        
        try {
            const geometry = stlLoader.parse(contents);
            
            // Center and scale the geometry
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            // Center the geometry
            geometry.translate(-center.x, -center.y, -center.z);
            
            // Scale to reasonable size (max dimension = 10cm)
            const maxDimension = Math.max(size.x, size.y, size.z);
            const scaleFactor = 10 / maxDimension;
            geometry.scale(scaleFactor, scaleFactor, scaleFactor);
            
            // Create material and mesh
            const material = new THREE.MeshLambertMaterial({ 
                color: Math.random() * 0xffffff,
                transparent: false
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            
            // Position above build plate
            mesh.position.set(0, 0, 0);
            mesh.name = file.name.replace(/\.[^/.]+$/, ""); // Remove file extension
            mesh.userData.type = 'imported';
            mesh.userData.originalFile = file.name;
            
            // Add to scene and tracking arrays
            scene.add(mesh);
            importedObjects.push(mesh);
            selectableObjects.push(mesh);
            
            // Auto-orient for optimal 3D printing
            autoOrientObject(mesh);
            
            // Select the newly imported object
            selectObject(mesh);
            
            // Update object list
            populateObjectList();
            
            console.log(`Successfully imported: ${file.name}`);
            
        } catch (error) {
            console.error('Error parsing STL file:', error);
            alert('Error loading STL file. Please check the file format.');
        }
    };
    
    reader.onerror = function(error) {
        console.error('Error reading file:', error);
        alert('Error reading file.');
    };
    
    reader.readAsArrayBuffer(file);
}

function handleFileImport() {
    const fileInput = document.getElementById('fileInput');
    fileInput.click();
}

function setupFileInput() {
    const fileInput = document.getElementById('fileInput');
    
    fileInput.addEventListener('change', function(event) {
        const files = event.target.files;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const extension = file.name.toLowerCase().split('.').pop();
            
            if (extension === 'stl') {
                importSTLFile(file);
            } else if (extension === 'step' || extension === 'stp') {
                alert('STEP files are not yet supported. Please convert to STL format or use an STL file.');
            } else {
                alert('Unsupported file format. Please use STL files.');
            }
        }
        
        // Clear the input so the same file can be selected again
        fileInput.value = '';
    });
}

// Object Management Functions
function selectObject(object) {
    selectedObject = object;
    
    // Update transform controls
    transformControls.attach(object);
    
    // Update visual feedback
    clearObjectHighlights();
    object.material.emissive.setHex(0x222222);
    
    // Update object list selection
    updateObjectListSelection(object);
    
    // Show mode buttons
    showModeButtons();
}

function clearObjectHighlights() {
    // Clear highlights on all selectable objects
    selectableObjects.forEach(obj => {
        obj.material.emissive.setHex(0x000000);
    });
    
    // Clear point highlights
    allPoints.forEach(point => {
        point.material.emissive.setHex(point.userData.type === 'start' ? 0x221100 : 0x001122);
    });
}

function deleteSelectedObject() {
    if (!selectedObject) {
        alert('Please select an object to delete.');
        return;
    }
    
    // Don't allow deletion of build plate
    if (selectedObject.userData.type === 'buildplate') {
        alert('Cannot delete the build plate.');
        return;
    }
    
    // Don't allow deletion of central support column
    if (selectedObject.userData.type === 'support_column') {
        alert('Cannot delete the central support column.');
        return;
    }
    
    // Handle point deletion specifically
    if (allPoints.includes(selectedObject)) {
        // Remove from parent cube
        selectedObject.parent.remove(selectedObject);
        
        // Remove from allPoints array
        const pointIndex = allPoints.indexOf(selectedObject);
        if (pointIndex > -1) {
            allPoints.splice(pointIndex, 1);
        }
        
        // Dispose of geometry
        selectedObject.geometry.dispose();
        
        console.log(`Deleted point: ${selectedObject.name}`);
        
        // Clear selection
        selectedObject = null;
        clearSelection();
        
        // Update object list
        populateObjectList();
        return;
    }
    
    // Remove from scene
    scene.remove(selectedObject);
    
    // Remove from tracking arrays
    const selectableIndex = selectableObjects.indexOf(selectedObject);
    if (selectableIndex > -1) {
        selectableObjects.splice(selectableIndex, 1);
    }
    
    const importedIndex = importedObjects.indexOf(selectedObject);
    if (importedIndex > -1) {
        importedObjects.splice(importedIndex, 1);
    }
    
    // Remove any points attached to this object
    const attachedPoints = allPoints.filter(point => point.userData.parentCube === selectedObject);
    attachedPoints.forEach(point => {
        point.parent.remove(point);
        point.geometry.dispose();
        const pointIndex = allPoints.indexOf(point);
        if (pointIndex > -1) {
            allPoints.splice(pointIndex, 1);
        }
    });
    
    // Clean up geometry and material
    selectedObject.geometry.dispose();
    if (Array.isArray(selectedObject.material)) {
        selectedObject.material.forEach(material => material.dispose());
    } else {
        selectedObject.material.dispose();
    }
    
    console.log(`Deleted object: ${selectedObject.name}`);
    
    // Clear selection
    selectedObject = null;
    clearSelection();
    
    // Update object list
    populateObjectList();
}

// Auto-Orientation Functions for 3D Printing Optimization
function autoOrientObject(object) {
    if (!object || !object.geometry) {
        console.log("No valid object selected for auto-orientation");
        return;
    }
    
    console.log(`Auto-orienting object: ${object.name}`);
    
    // Get the geometry and compute bounding box
    const geometry = object.geometry;
    const boundingBox = new THREE.Box3().setFromObject(object);
    const size = boundingBox.getSize(new THREE.Vector3());
    const center = boundingBox.getCenter(new THREE.Vector3());
    
    // Find optimal orientation by testing different rotations
    const orientations = [
        { x: 0, y: 0, z: 0 },           // Original
        { x: Math.PI/2, y: 0, z: 0 },   // Face down
        { x: -Math.PI/2, y: 0, z: 0 },  // Face up
        { x: 0, y: Math.PI/2, z: 0 },   // Side 1
        { x: 0, y: -Math.PI/2, z: 0 },  // Side 2
        { x: 0, y: 0, z: Math.PI/2 },   // Side 3
        { x: 0, y: 0, z: -Math.PI/2 },  // Side 4
        { x: Math.PI, y: 0, z: 0 },     // Upside down
    ];
    
    let bestOrientation = orientations[0];
    let bestScore = evaluateOrientation(object, bestOrientation);
    
    // Test each orientation
    orientations.forEach(orientation => {
        const score = evaluateOrientation(object, orientation);
        if (score > bestScore) {
            bestScore = score;
            bestOrientation = orientation;
        }
    });
    
    // Apply the best orientation
    object.rotation.set(bestOrientation.x, bestOrientation.y, bestOrientation.z);
    
    // Position object on build plate after rotation
    positionOnBuildPlate(object);
    
    console.log(`Applied orientation: x=${(bestOrientation.x * 180/Math.PI).toFixed(1)}°, y=${(bestOrientation.y * 180/Math.PI).toFixed(1)}°, z=${(bestOrientation.z * 180/Math.PI).toFixed(1)}° (score: ${bestScore.toFixed(2)})`);
}

function evaluateOrientation(object, orientation) {
    // Create a temporary object to test orientation without modifying original
    const tempObject = object.clone();
    tempObject.rotation.set(orientation.x, orientation.y, orientation.z);
    
    const boundingBox = new THREE.Box3().setFromObject(tempObject);
    const size = boundingBox.getSize(new THREE.Vector3());
    
    // Scoring criteria for 3D printing optimization:
    let score = 0;
    
    // 1. Prefer wider base (better bed adhesion) - 40% weight
    const baseArea = size.x * size.y;
    score += (baseArea / (size.x * size.y * size.z)) * 40;
    
    // 2. Prefer lower height (faster print, less support) - 30% weight
    score += (1 - (size.z / Math.max(size.x, size.y, size.z))) * 30;
    
    // 3. Prefer orientations that minimize overhangs - 30% weight
    // Simplified: favor orientations where the largest dimension is horizontal
    const maxHorizontal = Math.max(size.x, size.y);
    const aspectRatio = maxHorizontal / size.z;
    score += Math.min(aspectRatio / 3, 1) * 30;
    
    return score;
}

function positionOnBuildPlate(object) {
    // Get the object's bounding box after rotation
    const boundingBox = new THREE.Box3().setFromObject(object);
    
    // Position object so its bottom sits on the build plate (y = -2.5)
    const bottomY = boundingBox.min.y;
    const objectBottomOffset = bottomY - object.position.y;
    object.position.y = -2.5 - objectBottomOffset + 0.01; // Slight offset to avoid z-fighting
}

// Cloning Functions
function cloneSelectedObject() {
    if (!selectedObject) {
        alert('Please select an object to clone.');
        return;
    }
    
    // Don't allow cloning of build plate or points
    if (selectedObject.userData.type === 'buildplate' || allPoints.includes(selectedObject)) {
        alert('Cannot clone build plate or points.');
        return;
    }
    
    console.log(`Cloning object: ${selectedObject.name}`);
    
    // Clone the object
    const clonedObject = selectedObject.clone();
    
    // Update name and properties
    const originalName = selectedObject.name.replace(/ \(Copy \d+\)$/, ''); // Remove existing copy suffix
    const copyNumber = getCopyNumber(originalName);
    clonedObject.name = `${originalName} (Copy ${copyNumber})`;
    clonedObject.userData = { ...selectedObject.userData };
    
    // Position the clone offset from original
    const offset = 3; // 3cm offset
    clonedObject.position.set(
        selectedObject.position.x + offset,
        selectedObject.position.y,
        selectedObject.position.z
    );
    
    // Add to scene and tracking
    scene.add(clonedObject);
    
    if (selectedObject.userData.type === 'imported') {
        importedObjects.push(clonedObject);
    }
    selectableObjects.push(clonedObject);
    
    // Select the new clone
    selectObject(clonedObject);
    
    // Update object list
    populateObjectList();
    
    console.log(`Successfully cloned: ${clonedObject.name}`);
}

function getCopyNumber(baseName) {
    // Find the highest copy number for objects with this base name
    let highestCopy = 0;
    
    selectableObjects.forEach(obj => {
        if (obj.name.startsWith(baseName)) {
            const match = obj.name.match(/\(Copy (\d+)\)$/);
            if (match) {
                const copyNum = parseInt(match[1]);
                if (copyNum > highestCopy) {
                    highestCopy = copyNum;
                }
            }
        }
    });
    
    return highestCopy + 1;
}

// Arrangement Functions
function arrangeAllObjects() {
    // Get all non-build-plate and non-column objects
    const objectsToArrange = selectableObjects.filter(obj => 
        obj.userData.type !== 'buildplate' && obj.userData.type !== 'support_column'
    );
    
    if (objectsToArrange.length === 0) {
        alert('No objects to arrange.');
        return;
    }
    
    console.log(`Arranging ${objectsToArrange.length} objects around central column`);
    
    // Build plate dimensions and column parameters
    const buildPlateSize = { x: 20, y: 12.5 };
    const columnRadius = 1.5; // Column radius (3cm diameter)
    const minDistanceFromColumn = 3.5; // Minimum distance from column center (1.5cm radius + 2cm clearance)
    const edgeMargin = 1.5; // Margin from build plate edges
    
    // Create radial arrangement around the central column
    arrangeObjectsRadially(objectsToArrange, minDistanceFromColumn, buildPlateSize, edgeMargin);
    
    // Automatically place a START point at the base of the central column
    createCentralStartPoint();
    
    console.log('Radial arrangement complete with central start point');
}

function arrangeObjectsRadially(objects, minRadius, buildPlateSize, edgeMargin) {
    if (objects.length === 0) return;
    
    // Calculate available area for arrangement (excluding column area and margins)
    const maxRadiusX = (buildPlateSize.x / 2) - edgeMargin;
    const maxRadiusY = (buildPlateSize.y / 2) - edgeMargin;
    
    if (objects.length === 1) {
        // Single object: place it optimally
        const obj = objects[0];
        obj.position.x = minRadius + 1;
        obj.position.z = 0;
        positionOnBuildPlate(obj);
        console.log(`Positioned single object ${obj.name} at (${obj.position.x.toFixed(1)}, ${obj.position.y.toFixed(1)}, ${obj.position.z.toFixed(1)})`);
        return;
    }
    
    // Multiple objects: arrange in concentric rings
    let currentRadius = minRadius;
    let objectsPlaced = 0;
    
    while (objectsPlaced < objects.length) {
        // Calculate how many objects can fit in current ring
        const circumference = 2 * Math.PI * currentRadius;
        const objectSpacing = 2.0; // 2cm spacing between objects
        const maxObjectsInRing = Math.floor(circumference / objectSpacing);
        const objectsInThisRing = Math.min(maxObjectsInRing, objects.length - objectsPlaced);
        
        // Check if we're still within build plate bounds
        if (currentRadius > Math.min(maxRadiusX, maxRadiusY)) {
            console.warn(`Some objects may be outside build plate bounds`);
        }
        
        // Place objects in current ring
        for (let i = 0; i < objectsInThisRing; i++) {
            const obj = objects[objectsPlaced + i];
            const angle = (i / objectsInThisRing) * 2 * Math.PI;
            
            const x = Math.cos(angle) * currentRadius;
            const z = Math.sin(angle) * currentRadius;
            
            // Clamp to build plate bounds
            const clampedX = Math.max(-maxRadiusX, Math.min(maxRadiusX, x));
            const clampedZ = Math.max(-maxRadiusY, Math.min(maxRadiusY, z));
            
            obj.position.x = clampedX;
            obj.position.z = clampedZ;
            positionOnBuildPlate(obj);
            
            console.log(`Ring ${Math.floor(objectsPlaced / maxObjectsInRing) + 1}: Positioned ${obj.name} at (${clampedX.toFixed(1)}, ${obj.position.y.toFixed(1)}, ${clampedZ.toFixed(1)})`);
        }
        
        objectsPlaced += objectsInThisRing;
        currentRadius += 3.0; // Move to next ring (3cm further out)
    }
}

function createCentralStartPoint() {
    // Find the central column
    const centralColumn = scene.children.find(child => child.userData.type === 'support_column');
    if (!centralColumn) {
        console.warn('Central column not found, cannot place start point');
        return;
    }
    
    // Remove any existing start points from the central column
    const existingPoints = allPoints.filter(point => 
        point.userData.parentCube === centralColumn && point.userData.type === 'start'
    );
    existingPoints.forEach(point => {
        point.parent.remove(point);
        point.geometry.dispose();
        const pointIndex = allPoints.indexOf(point);
        if (pointIndex > -1) {
            allPoints.splice(pointIndex, 1);
        }
    });
    
    // Create new start point at the base of the central column
    const startPosition = new THREE.Vector3(0, -2.5, 0); // Base of column (on build plate)
    const startNormal = new THREE.Vector3(0, -1, 0); // Pointing down (at base)
    
    const centralStartPoint = createPoint('start', startPosition, startNormal, centralColumn);
    centralStartPoint.name = 'Central Start Point';
    
    // Position the point slightly above the build plate
    centralStartPoint.position.set(0, -2.0, 0); // 0.5cm above build plate
    
    console.log('Created central start point at base of support column');
    
    // Update object list to show the new point
    populateObjectList();
}

function smartArrangeObjects() {
    // Advanced arrangement algorithm (future enhancement)
    // Could implement bin packing, minimize support material, etc.
    arrangeAllObjects(); // For now, use simple grid
}

// Floating Object Test Function
function floatSelectedObject() {
    if (!selectedObject) {
        alert('Please select an object to float above the build plate.');
        return;
    }
    
    // Don't allow floating of build plate, central column, or points
    if (selectedObject.userData.type === 'buildplate' || 
        selectedObject.userData.type === 'support_column' || 
        allPoints.includes(selectedObject)) {
        alert('Cannot float build plate, central column, or points.');
        return;
    }
    
    console.log(`🎈 Floating object: ${selectedObject.name}`);
    
    // Get current object bounding box
    const bbox = new THREE.Box3().setFromObject(selectedObject);
    const size = bbox.getSize(new THREE.Vector3());
    
    // Calculate how much to lift the object
    const buildPlateLevel = -2.5;
    const floatHeight = 3.0; // Float 3cm above build plate
    const currentBottom = bbox.min.y;
    
    // Lift the object so its bottom is at the desired float height
    const liftAmount = (buildPlateLevel + floatHeight) - currentBottom;
    selectedObject.position.y += liftAmount;
    
    console.log(`🚀 Lifted ${selectedObject.name} by ${liftAmount.toFixed(2)}cm - now floating ${floatHeight}cm above build plate`);
    console.log(`💡 Generate tree supports to see bottom support points created automatically`);
    
    // Clear any existing support visualization
    clearSupport();
}

// Update the main generation function
function generateCuraTreeSupport() {
    console.log("=== Starting Simple Tree Support Generation ===");
    
    // Set generation state
    isGeneratingTree = true;
    updateTreeButtonStates();
    
    try {
        // Clear existing support
        clearSupport();
        
        // Find central column and start point
        const centralColumn = scene.children.find(child => child.userData.type === 'support_column');
        
        if (!centralColumn) {
            console.error("❌ Central column not found");
            alert("Central column not found. Please reset the scene.");
            return;
        }
        
        // Find start point within the central column's children
        let centralStartPoint = null;
        if (centralColumn.children) {
            centralStartPoint = centralColumn.children.find(child => child.name === 'Central Start Point');
        }
        
        if (!centralStartPoint) {
            console.error("❌ Central start point not found");
            console.log("🔧 Creating central start point...");
            createCentralStartPoint();
            // Try to find it again after creation
            centralStartPoint = centralColumn.children.find(child => child.name === 'Central Start Point');
            
            if (!centralStartPoint) {
                console.error("❌ Failed to create central start point");
                alert("Failed to create central start point. Please check console for errors.");
                return;
            }
        }
        
        console.log("✅ Found central column and start point");
        console.log(`📍 Central column position: (${centralColumn.position.x.toFixed(2)}, ${centralColumn.position.y.toFixed(2)}, ${centralColumn.position.z.toFixed(2)})`);
        console.log(`📍 Central column has ${centralColumn.children.length} children`);
        
        // Get central start position - should be at the base center of the column
        const startPos = new THREE.Vector3(0, -2.5, 0); // Exact base of column on build plate
        console.log(`🎯 Central start position: (${startPos.x.toFixed(2)}, ${startPos.y.toFixed(2)}, ${startPos.z.toFixed(2)})`);
        
        // Find all objects that need support
        const objectsNeedingSupport = findObjectsNeedingSupport();
        console.log(`📦 Found ${objectsNeedingSupport.length} objects needing support`);
        
        if (objectsNeedingSupport.length === 0) {
            console.log("❌ No objects need support");
            alert("No objects found that need support. Try using 'Float Test Object' to create a floating object.");
            return;
        }
        
        // Generate support structures
        const supportElements = [];
        
        for (const targetInfo of objectsNeedingSupport) {
            console.log(`🌳 Generating supports for ${targetInfo.object.name}`);
            const supports = generateSimpleTreeSupports(startPos, targetInfo);
            supportElements.push(...supports);
        }
        
        console.log(`📊 Generated ${supportElements.length} support elements`);
        
        if (supportElements.length === 0) {
            console.log("❌ No support elements generated");
            alert("No support elements were generated. Check console for details.");
            return;
        }
        
        // Visualize the support structure
        console.log("🎨 Visualizing support structure...");
        visualizeSimpleSupports(supportElements);
        
        console.log("✅ Tree Support Generation Complete");
        
    } catch (error) {
        console.error("❌ Error in tree support generation:", error);
        console.error("Stack trace:", error.stack);
        alert(`Error generating supports: ${error.message}`);
    } finally {
        // Reset generation state
        isGeneratingTree = false;
        updateTreeButtonStates();
    }
}

function findObjectsNeedingSupport() {
    const objectsNeedingSupport = [];
    const buildPlateLevel = -2.5;
    const floatingThreshold = 0.5;
    
    // Get all supportable objects (exclude build plate, column, supports)
    const supportableObjects = scene.children.filter(child => 
        child.userData && 
        child.userData.type !== 'buildplate' && 
        child.userData.type !== 'support_column' &&
        child.userData.type !== 'tree_support' &&
        child.geometry && 
        child.visible
    );
    
    console.log(`🔍 Checking ${supportableObjects.length} objects for support needs`);
    
    for (const obj of supportableObjects) {
        const bbox = new THREE.Box3().setFromObject(obj);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        
        console.log(`  📦 ${obj.name}: bottom at y=${bbox.min.y.toFixed(2)}, size=${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)}`);
        
        // Check if object is floating
        const isFloating = bbox.min.y > (buildPlateLevel + floatingThreshold);
        
        if (isFloating) {
            console.log(`  🎈 ${obj.name} is FLOATING - needs support`);
            
            // Generate support target points for floating object
            const targetPoints = generateFloatingObjectTargets(obj, bbox);
            
            objectsNeedingSupport.push({
                object: obj,
                type: 'floating',
                targets: targetPoints,
                bbox: bbox
            });
            
        } else {
            console.log(`  🏗️ ${obj.name} is on build plate`);
            
            // For testing: add artificial overhang points for cubes
            if (obj.userData.type === 'cube') {
                console.log(`  🧪 Adding test overhang points for cube`);
                const targetPoints = generateTestOverhangTargets(obj, bbox);
                
                objectsNeedingSupport.push({
                    object: obj,
                    type: 'overhang',
                    targets: targetPoints,
                    bbox: bbox
                });
            }
        }
    }
    
    return objectsNeedingSupport;
}

function generateFloatingObjectTargets(object, bbox) {
    const targets = [];
    const size = bbox.getSize(new THREE.Vector3());
    
    // Create a sparser grid for better tree visualization
    const density = 4.0; // Every 4cm (reduced density for cleaner tree structure)
    const pointsX = Math.max(1, Math.ceil(size.x / density));
    const pointsZ = Math.max(1, Math.ceil(size.z / density));
    
    console.log(`    📐 Creating ${pointsX}×${pointsZ} organic tree support grid`);
    
    for (let i = 0; i < pointsX; i++) {
        for (let j = 0; j < pointsZ; j++) {
            const x = bbox.min.x + (i + 0.5) * (size.x / pointsX);
            const z = bbox.min.z + (j + 0.5) * (size.z / pointsZ);
            const y = bbox.min.y - 0.3; // Slightly further below object for better tree growth
            
            targets.push(new THREE.Vector3(x, y, z));
        }
    }
    
    return targets;
}

function generateTestOverhangTargets(object, bbox) {
    const targets = [];
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    
    // Create fewer, more realistic overhang points for better tree visualization
    const numPoints = 4; // Reduced from 8 for cleaner tree structure
    const radius = Math.max(size.x, size.z) * 0.7; // Slightly further out
    const height = bbox.min.y + size.y * 0.9; // Higher up for more dramatic supports
    
    for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const x = center.x + Math.cos(angle) * radius;
        const z = center.z + Math.sin(angle) * radius;
        
        targets.push(new THREE.Vector3(x, height, z));
    }
    
    console.log(`    🧪 Created ${numPoints} test overhang targets for organic tree supports`);
    return targets;
}

function generateSimpleTreeSupports(startPos, targetInfo) {
    const supportElements = [];
    const targets = targetInfo.targets;
    
    console.log(`  🌲 Generating Cura-style tree supports from (${startPos.x.toFixed(1)}, ${startPos.y.toFixed(1)}, ${startPos.z.toFixed(1)}) to ${targets.length} targets`);
    
    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        console.log(`    🎯 Target ${i + 1}: (${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)})`);
        
        // Create Cura-style organic tree branch
        const branchPath = createCuraTreeBranch(startPos, target, i);
        if (branchPath && branchPath.length > 0) {
            supportElements.push(...branchPath);
        }
    }
    
    return supportElements;
}

function createCuraTreeBranch(startPos, endPos, branchIndex) {
    const distance = startPos.distanceTo(endPos);
    
    if (distance < 0.1) {
        console.log(`    ⚠️ Branch too short (${distance.toFixed(3)}), skipping`);
        return [];
    }
    
    console.log(`    🌳 Creating Cura-style tree branch ${branchIndex + 1}: ${distance.toFixed(2)}cm long`);
    
    // Cura tree support parameters
    const layerHeight = 0.2; // 0.2mm layers
    const maxMoveDistance = 1.5; // Max movement per layer (1.5cm)
    const organicFactor = 0.3; // How much organic movement to add
    const baseRadius = 0.4; // 8mm diameter at base
    const tipRadius = 0.08; // 1.6mm diameter at tip
    
    const totalLayers = Math.ceil(distance / layerHeight);
    const segments = [];
    
    let currentPos = startPos.clone();
    let currentRadius = baseRadius;
    
    // Generate organic path layer by layer (like Cura does)
    for (let layer = 0; layer < totalLayers; layer++) {
        const progress = layer / totalLayers;
        
        // Calculate target direction
        const targetDirection = new THREE.Vector3().subVectors(endPos, currentPos).normalize();
        
        // Add organic movement (Cura's signature organic tree look)
        const organicOffset = new THREE.Vector3(
            (Math.random() - 0.5) * organicFactor,
            0, // Don't add random Y movement, keep growing upward
            (Math.random() - 0.5) * organicFactor
        );
        
        // Calculate next position with movement constraints
        const moveDistance = Math.min(maxMoveDistance, currentPos.distanceTo(endPos));
        const nextDirection = targetDirection.clone().add(organicOffset).normalize();
        const nextPos = currentPos.clone().add(nextDirection.multiplyScalar(moveDistance));
        
        // Calculate radius for this segment (taper from base to tip)
        const segmentRadius = baseRadius + (tipRadius - baseRadius) * progress;
        
        // Create segment
        if (layer > 0) { // Don't create segment for first point
            const segmentDistance = currentPos.distanceTo(nextPos);
            
            segments.push({
                type: 'tree_segment',
                start: currentPos.clone(),
                end: nextPos.clone(),
                startRadius: currentRadius,
                endRadius: segmentRadius,
                distance: segmentDistance,
                layer: layer,
                branchIndex: branchIndex,
                segmentIndex: layer
            });
        }
        
        currentPos = nextPos;
        currentRadius = segmentRadius;
        
        // Stop if we're close enough to the target
        if (currentPos.distanceTo(endPos) < layerHeight) {
            // Create final segment to exact target
            segments.push({
                type: 'tree_segment',
                start: currentPos.clone(),
                end: endPos.clone(),
                startRadius: currentRadius,
                endRadius: tipRadius,
                distance: currentPos.distanceTo(endPos),
                layer: layer + 1,
                branchIndex: branchIndex,
                segmentIndex: layer + 1
            });
            break;
        }
    }
    
    console.log(`      ✅ Created ${segments.length} organic segments for branch ${branchIndex + 1}`);
    return segments;
}

function visualizeSimpleSupports(supportElements) {
    console.log(`🎨 Creating ${supportElements.length} Cura-style tree support visualizations`);
    
    for (const element of supportElements) {
        if (element.type === 'tree_segment') {
            // Create tapered cylinder for each organic segment
            const geometry = new THREE.CylinderGeometry(
                element.endRadius,    // Top radius (toward tip)
                element.startRadius,  // Bottom radius (toward base)
                element.distance,     // Height of this segment
                8                     // Radial segments
            );
            
            // Use gradient coloring - darker at base, lighter at tips
            const baseColor = 0x006600; // Dark green at base
            const tipColor = 0x00bb00;  // Lighter green at tips
            const progress = element.layer / 20; // Rough progress estimation
            const color = new THREE.Color(baseColor).lerp(new THREE.Color(tipColor), Math.min(progress, 1));
            
            const material = new THREE.MeshLambertMaterial({ 
                color: color,
                transparent: true, 
                opacity: 0.85 
            });
            
            const cylinder = new THREE.Mesh(geometry, material);
            
            // Position and orient the cylinder segment
            const midpoint = new THREE.Vector3().addVectors(element.start, element.end).multiplyScalar(0.5);
            cylinder.position.copy(midpoint);
            
            // Orient cylinder to point from start to end
            const direction = new THREE.Vector3().subVectors(element.end, element.start).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            
            // Only rotate if direction is not parallel to up vector
            if (Math.abs(direction.dot(up)) < 0.99) {
                const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
                cylinder.setRotationFromQuaternion(quaternion);
            }
            
            cylinder.userData.type = 'tree_support';
            cylinder.name = `Tree Support B${element.branchIndex + 1}S${element.segmentIndex}`;
            
            scene.add(cylinder);
            
            // Log every 5th segment to avoid spam
            if (element.segmentIndex % 5 === 0) {
                console.log(`  🌿 Added segment B${element.branchIndex + 1}S${element.segmentIndex}: ${element.distance.toFixed(2)}cm, radius ${element.startRadius.toFixed(2)}→${element.endRadius.toFixed(2)}cm`);
            }
        }
    }
    
    console.log("🎉 Cura-style tree support visualization complete!");
}

// Helper function to get repulsion vector away from nearest cube surface
function getRepulsionVector(position) {
    let minDistance = Infinity;
    let closestPoint = null;
    
    // Check distance to both cubes
    [cube1, cube2].forEach(cube => {
        const localPoint = new THREE.Vector3();
        cube.worldToLocal(localPoint.copy(position));
        
        // Clamp to cube boundaries
        const size = 2.5; // Half cube size (5cm cube = 2.5cm radius)
        const clamped = new THREE.Vector3(
            Math.max(-size, Math.min(size, localPoint.x)),
            Math.max(-size, Math.min(size, localPoint.y)),
            Math.max(-size, Math.min(size, localPoint.z))
        );
        
        // Convert back to world space
        cube.localToWorld(clamped);
        
        const distance = position.distanceTo(clamped);
        if (distance < minDistance) {
            minDistance = distance;
            closestPoint = clamped;
        }
    });
    
    if (closestPoint) {
        return new THREE.Vector3().subVectors(position, closestPoint).normalize();
    }
    
    return new THREE.Vector3();
}

// Helper function to calculate node depth from root
function getNodeDepth(node) {
    let depth = 0;
    let current = node;
    while (current.parent) {
        depth++;
        current = current.parent;
    }
    return depth;
}

function getRandomDirection(targetDirection, randomness = 0.3) {
    const randomVec = new THREE.Vector3(
        (Math.random() - 0.5) * randomness,
        (Math.random() - 0.5) * randomness,
        (Math.random() - 0.5) * randomness
    );
    
    return targetDirection.clone().add(randomVec).normalize();
}

async function generateTreeStep() {
    if (!isGeneratingTree) return;
    
    // Check if we have any active attractors left
    const activeAttractors = attractors.filter(a => a.isActive);
    if (activeAttractors.length === 0) {
        isGeneratingTree = false;
        updateTreeButtonStates();
        console.log("Tree generation completed! All attractors reached with natural growth.");
        return;
    }
    
    // Perform one step of space colonization growth
    const grewSuccessfully = spaceColonizationGrowth();
    
    if (!grewSuccessfully) {
        // No growth occurred, check if we're stuck
        const growingNodes = treeNodes.filter(node => node.isGrowing);
        if (growingNodes.length === 0) {
            isGeneratingTree = false;
            updateTreeButtonStates();
            console.log("Tree generation completed! No more growing nodes.");
            return;
        }
    }
    
    // Continue generation
    setTimeout(generateTreeStep, generationSpeed);
}

function startTreeGeneration() {
    if (isGeneratingTree) return;
    
    // Clear existing trees
    clearTrees();
    
    // Check if we have start and end points
    const startPoints = allPoints.filter(p => p.userData.type === 'start');
    const endPoints = allPoints.filter(p => p.userData.type === 'end');
    
    if (startPoints.length === 0 || endPoints.length === 0) {
        alert('Please place both start points and end points before generating trees.');
        return;
    }
    
    console.log(`=== Cura-Style Tree Generation ===`);
    console.log(`${endPoints.length} end points (growth starts) → ${startPoints.length} start points (growth targets)`);
    
    // Initialize the space colonization algorithm (CORRECTED: FROM end TO start)
    createAttractorsFromStartPoints();   // Start points become attractors (targets)
    createGrowthNodesFromEndPoints();    // End points become initial growth nodes (sources)
    
    if (attractors.length === 0 || treeNodes.length === 0) {
        alert('Failed to initialize tree generation. Please check your points.');
        return;
    }
    
    console.log(`Initialized: ${treeNodes.length} growth nodes, ${attractors.length} attractors`);
    
    isGeneratingTree = true;
    updateTreeButtonStates();
    
    // Start the iterative growth process
    generateTreeStep();
}

// CORRECTED: Start points become attractors (targets for convergence)
function createAttractorsFromStartPoints() {
    attractors.length = 0; // Clear previous attractors
    
    const startPoints = allPoints.filter(p => p.userData.type === 'start');
    
    startPoints.forEach((point, index) => {
        const worldPos = new THREE.Vector3();
        point.getWorldPosition(worldPos);
        
        const attractor = new Attractor(worldPos);
        attractors.push(attractor);
        
        console.log(`Target Attractor ${index + 1}: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})`);
    });
}

// CORRECTED: End points become initial growth nodes (thin branches)
function createGrowthNodesFromEndPoints() {
    treeNodes.length = 0; // Clear previous nodes
    
    const endPoints = allPoints.filter(p => p.userData.type === 'end');
    
    endPoints.forEach((point, index) => {
        const worldPos = new THREE.Vector3();
        point.getWorldPosition(worldPos);
        
        // Move slightly away from surface to avoid immediate collision
        const surfaceNormal = new THREE.Vector3();
        const worldToLocalMatrix = new THREE.Matrix3().getNormalMatrix(point.userData.parentCube.matrixWorld);
        surfaceNormal.copy(point.userData.localNormal).applyMatrix3(worldToLocalMatrix).normalize();
        worldPos.add(surfaceNormal.multiplyScalar(0.1));
        
        const branchNode = new TreeNode(worldPos, null);
        branchNode.isGrowing = true;
        branchNode.thickness = TIP_THICKNESS; // Start thin at end points
        branchNode.nodeColor = 0x00aaff; // Light blue for branch starts
        treeNodes.push(branchNode);
        
        console.log(`Branch start ${index + 1}: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})`);
    });
}

// Progressive merging is now handled inline during growth for better control

function addDebugMarkers() {
    // Add small spheres to show attractor and growth node positions
    const attractorGeometry = new THREE.SphereGeometry(0.03, 8, 6);
    const attractorMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
    
    const growthGeometry = new THREE.SphereGeometry(0.025, 8, 6);
    const growthMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
    
    attractors.forEach((attractor, index) => {
        const sphere = new THREE.Mesh(attractorGeometry, attractorMaterial);
        sphere.position.copy(attractor.position);
        sphere.name = `debug_attractor_${index}`;
        scene.add(sphere);
        treeBranches.push(sphere); // Add to cleanup list
    });
    
    treeNodes.forEach((node, index) => {
        const sphere = new THREE.Mesh(growthGeometry, growthMaterial);
        sphere.position.copy(node.position);
        sphere.name = `debug_growth_${index}`;
        scene.add(sphere);
        treeBranches.push(sphere); // Add to cleanup list
    });
    
    console.log(`Added debug markers: ${attractors.length} red attractors, ${treeNodes.length} green growth nodes`);
}

function clearTrees() {
    // Remove all tree meshes from scene
    treeBranches.forEach(branch => {
        scene.remove(branch);
        branch.geometry.dispose();
    });
    
    // Clear arrays
    treeNodes.length = 0;
    treeBranches.length = 0;
    attractors.length = 0;
    
    isGeneratingTree = false;
    updateTreeButtonStates();
}

function clearSelection() {
    // Clear 3D selection
    transformControls.detach();
    selectableObjects.forEach(obj => {
        obj.material.emissive.setHex(0x000000);
    });
    
    // Clear point highlights
    allPoints.forEach(point => {
        point.material.emissive.setHex(point.userData.type === 'start' ? 0x221100 : 0x001122);
    });
    
    // Clear list selection
    document.querySelectorAll('.object-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Hide mode buttons and reset point mode
    hideModeButtons();
    setPointPlacementMode('none');
}

// Object list management
function populateObjectList() {
    const objectList = document.getElementById('objectList');
    objectList.innerHTML = '';
    
    // Add build plate to the list
    const buildPlate = scene.children.find(child => child.userData.type === 'buildplate');
    if (buildPlate) {
        const listItem = document.createElement('div');
        listItem.className = 'object-item';
        listItem.dataset.objectType = 'buildplate';
        
        listItem.innerHTML = `
            <div class="object-icon" style="background-color: #808080; border-radius: 2px;"></div>
            <span>${buildPlate.name}</span>
        `;
        
        objectList.appendChild(listItem);
    }
    
    // Add central column to the list
    const centralColumn = scene.children.find(child => child.userData.type === 'support_column');
    if (centralColumn) {
        const listItem = document.createElement('div');
        listItem.className = 'object-item';
        listItem.dataset.objectType = 'support_column';
        
        listItem.innerHTML = `
            <div class="object-icon" style="background-color: #606060; border-radius: 2px;"></div>
            <span>${centralColumn.name}</span>
        `;
        
        objectList.appendChild(listItem);
    }
    
    // Add original cubes and imported objects
    selectableObjects.forEach((obj, index) => {
        if (obj.userData.type === 'buildplate') return; // Skip build plate, already added
        
        const listItem = document.createElement('div');
        listItem.className = 'object-item';
        listItem.dataset.objectIndex = index;
        listItem.dataset.objectType = obj.userData.type || 'cube';
        
        // Get object color for icon
        const color = obj.material.color;
        const colorHex = `#${color.getHexString()}`;
        
        listItem.innerHTML = `
            <div class="object-icon" style="background-color: ${colorHex}; mask: none; -webkit-mask: none; border-radius: 2px;"></div>
            <span>${obj.name || `Object ${index + 1}`}</span>
        `;
        
        // Add click handler for list item
        listItem.addEventListener('click', () => {
            selectObjectFromList(obj, listItem);
        });
        
        objectList.appendChild(listItem);
        
        // Add points belonging to this object
        const objectPoints = allPoints.filter(point => point.userData.parentCube === obj);
        objectPoints.forEach((point, pointIndex) => {
            const pointItem = document.createElement('div');
            pointItem.className = 'object-item';
            pointItem.style.paddingLeft = '25px'; // Indent to show hierarchy
            pointItem.dataset.pointIndex = allPoints.indexOf(point);
            pointItem.dataset.objectType = 'point';
            
            const pointColor = point.userData.type === 'start' ? '#FF5722' : '#2196F3';
            const pointIcon = point.userData.type === 'start' ? '●' : '●';
            
            pointItem.innerHTML = `
                <div class="object-icon" style="color: ${pointColor}; background: none; font-size: 16px; line-height: 16px; text-align: center;">${pointIcon}</div>
                <span>${point.name} ${objectPoints.filter(p => p.userData.type === point.userData.type).indexOf(point) + 1}</span>
            `;
            
            // Add click handler for point item
            pointItem.addEventListener('click', () => {
                selectPointFromList(point, pointItem);
            });
            
            objectList.appendChild(pointItem);
        });
    });
}

function selectPointFromList(point, listItem) {
    // Clear other selections
    clearSelection();
    
    // Update list item selection
    document.querySelectorAll('.object-item').forEach(item => {
        item.classList.remove('selected');
    });
    listItem.classList.add('selected');
    
    // Highlight the point
    point.material.emissive.setHex(0x444444);
    
    // Set selected object for deletion
    selectedObject = point;
}

function selectObjectFromList(object, listItem) {
    selectObject(object);
    
    // Update list item selection
    document.querySelectorAll('.object-item').forEach(item => {
        item.classList.remove('selected');
    });
    listItem.classList.add('selected');
}

function updateObjectListSelection(selectedObj) {
    document.querySelectorAll('.object-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    if (selectedObj) {
        const index = selectableObjects.indexOf(selectedObj);
        if (index !== -1) {
            const listItem = document.querySelector(`[data-object-index="${index}"]`);
            if (listItem) {
                listItem.classList.add('selected');
            }
        }
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update controls for damping
    controls.update();
    
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Mouse click event for object selection
function onMouseClick(event) {
    // Don't process clicks on UI elements
    if (event.target.classList.contains('mode-btn') || 
        event.target.classList.contains('point-btn') ||
        event.target.classList.contains('tree-btn') ||
        event.target.closest('.sidebar') || 
        event.target.closest('.object-item') ||
        event.target.closest('.toolbar')) {
        return;
    }
    
    // Calculate mouse position in normalized device coordinates
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Update the picking ray with the camera and mouse position
    raycaster.setFromCamera(mouse, camera);
    
    // Calculate objects intersecting the picking ray
    const intersects = raycaster.intersectObjects(selectableObjects);
    
    if (intersects.length > 0) {
        const selectedObject = intersects[0].object;
        
        // Check if we're in point placement mode and clicked on a cube
        if (pointPlacementMode !== 'none' && selectableObjects.includes(selectedObject)) {
            placePointOnSurface(event, selectedObject);
            return;
        }
        
        // Check if selected object is a point
        if (allPoints.includes(selectedObject)) {
            // Clear other selections
            clearSelection();
            
            // Highlight the selected point
            selectedObject.material.emissive.setHex(0x444444);
            
            // Update object list selection for the point
            const pointIndex = allPoints.indexOf(selectedObject);
            const pointItem = document.querySelector(`[data-point-index="${pointIndex}"]`);
            if (pointItem) {
                pointItem.classList.add('selected');
            }
            
            return;
        }
        
        // Check if selected object is a selectable cube
        if (selectableObjects.includes(selectedObject)) {
            // Use the selectObject function
            selectObject(selectedObject);
        }
    } else {
        // Deselect if clicking on empty space
        clearSelection();
    }
}

// Transform mode buttons
let modeButtons = null;

function createModeButtons() {
    if (modeButtons) return modeButtons;
    
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'mode-buttons';
    buttonContainer.innerHTML = `
        <button id="moveBtn" class="mode-btn active">Move</button>
        <button id="rotateBtn" class="mode-btn">Rotate</button>
        <button id="scaleBtn" class="mode-btn">Scale</button>
    `;
    document.body.appendChild(buttonContainer);
    
    // Add event listeners to buttons
    document.getElementById('moveBtn').addEventListener('click', () => {
        transformControls.setMode('translate');
        updateActiveButton('moveBtn');
    });
    
    document.getElementById('rotateBtn').addEventListener('click', () => {
        transformControls.setMode('rotate');
        updateActiveButton('rotateBtn');
    });
    
    document.getElementById('scaleBtn').addEventListener('click', () => {
        transformControls.setMode('scale');
        updateActiveButton('scaleBtn');
    });
    
    modeButtons = buttonContainer;
    return buttonContainer;
}

function updateActiveButton(activeId) {
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(activeId).classList.add('active');
}

function showModeButtons() {
    const buttons = createModeButtons();
    buttons.style.display = 'block';
}

function hideModeButtons() {
    if (modeButtons) {
        modeButtons.style.display = 'none';
    }
}

// Control functions (toolbar is always visible now)
function updateTreeButtonStates() {
    const generateBtn = document.getElementById('generateTreeBtn');
    const clearBtn = document.getElementById('clearTreeBtn');
    const resetBtn = document.getElementById('resetBtn');
    
    if (generateBtn) {
        generateBtn.disabled = isGeneratingTree;
        generateBtn.textContent = isGeneratingTree ? 'Generating...' : 'Generate Tree';
    }
    
    if (clearBtn) {
        clearBtn.disabled = isGeneratingTree;
    }
    
    if (resetBtn) {
        resetBtn.disabled = isGeneratingTree;
    }
}

function setupPointControls() {
    document.getElementById('startPointBtn').addEventListener('click', () => {
        setPointPlacementMode('start');
    });
    
    document.getElementById('endPointBtn').addEventListener('click', () => {
        setPointPlacementMode('end');
    });
    
    document.getElementById('noPointBtn').addEventListener('click', () => {
        setPointPlacementMode('none');
    });
}

function setupTreeControls() {
    document.getElementById('generateTreeBtn').addEventListener('click', () => {
        generateCuraTreeSupport();
    });
    
    document.getElementById('clearTreeBtn').addEventListener('click', () => {
        clearTrees();
    });
    
    document.getElementById('resetBtn').addEventListener('click', () => {
        resetAll();
    });
    
    // File import and delete controls
    document.getElementById('importBtn').addEventListener('click', () => {
        handleFileImport();
    });
    
    document.getElementById('deleteBtn').addEventListener('click', () => {
        deleteSelectedObject();
    });
    
    // Object management controls
    document.getElementById('autoOrientBtn').addEventListener('click', () => {
        if (selectedObject) {
            autoOrientObject(selectedObject);
        } else {
            alert('Please select an object to auto-orient.');
        }
    });
    
    document.getElementById('cloneBtn').addEventListener('click', () => {
        cloneSelectedObject();
    });
    
    document.getElementById('arrangeBtn').addEventListener('click', () => {
        arrangeAllObjects();
    });
    
    document.getElementById('floatTestBtn').addEventListener('click', () => {
        floatSelectedObject();
    });
}

function resetAll() {
    if (isGeneratingTree) return;
    
    // Clear trees
    clearTrees();
    
    // Clear all points
    allPoints.forEach(point => {
        point.parent.remove(point);
        point.geometry.dispose();
    });
    allPoints.length = 0;
    
    // Clear selections
    clearSelection();
    
    // Reset point placement mode
    setPointPlacementMode('none');
    
    // Update object list
    populateObjectList();
}

function setPointPlacementMode(mode) {
    pointPlacementMode = mode;
    
    // Update button states
    document.querySelectorAll('.point-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (mode === 'start') {
        document.getElementById('startPointBtn').classList.add('active');
        document.body.style.cursor = 'crosshair';
    } else if (mode === 'end') {
        document.getElementById('endPointBtn').classList.add('active');
        document.body.style.cursor = 'crosshair';
    } else {
        document.getElementById('noPointBtn').classList.add('active');
        document.body.style.cursor = 'default';
    }
}

// Keyboard controls for deselection and deletion
function onKeyDown(event) {
    if (event.code === 'Escape') {
        clearSelection();
    } else if (event.code === 'Delete' || event.code === 'Backspace') {
        deleteSelectedObject();
    }
}

function deleteSelectedPoint() {
    // Find selected point in the object list
    const selectedPointItem = document.querySelector('.object-item.selected[data-object-type="point"]');
    if (selectedPointItem) {
        const pointIndex = parseInt(selectedPointItem.dataset.pointIndex);
        const point = allPoints[pointIndex];
        
        if (point) {
            // Remove from parent cube
            point.parent.remove(point);
            
            // Remove from allPoints array
            const arrayIndex = allPoints.indexOf(point);
            if (arrayIndex > -1) {
                allPoints.splice(arrayIndex, 1);
            }
            
            // Dispose of geometry and material references
            point.geometry.dispose();
            
            // Update object list
            populateObjectList();
            
            // Clear selection
            clearSelection();
        }
    }
}

// Add event listeners
window.addEventListener('click', onMouseClick, false);
window.addEventListener('keydown', onKeyDown, false);

// Initialize object list and controls
populateObjectList();
setupPointControls();
setupTreeControls();
updateTreeButtonStates();
setupFileInput(); // Initialize file input

// Create central start point automatically
createCentralStartPoint();

// Start the animation
animate(); 

// Centralized Tree Support - generates from central column to overhangs
class CentralizedTreeSupport {
    constructor(scene) {
        this.scene = scene;
        this.centralColumn = scene.children.find(child => child.userData.type === 'support_column');
        this.centralStartPoint = scene.children.find(child => child.name === 'Central Start Point');
        this.objects = this.getAllSupportableObjects();
        this.model_volumes = new TreeModelVolumes(scene);
        this.overhang_detector = new CentralizedOverhangDetector(scene);
        this.support_paths = [];
        this.layer_height = TREE_CONFIG.layer_height;
        
        // Debug logging
        console.log(`🔍 Found central column: ${this.centralColumn ? 'YES' : 'NO'}`);
        console.log(`🔍 Found central start point: ${this.centralStartPoint ? 'YES' : 'NO'}`);
        console.log(`🔍 Found ${this.objects.length} supportable objects:`, this.objects.map(obj => obj.name));
    }
    
    getAllSupportableObjects() {
        // Get all objects that might need support (exclude build plate and central column)
        return this.scene.children.filter(child => 
            child.userData && 
            child.userData.type !== 'buildplate' && 
            child.userData.type !== 'support_column' &&
            child.userData.type !== 'tree_support' &&
            child.geometry && 
            child.visible
        );
    }
    
    generateFromCentralPoint() {
        console.log("🌳 Generating centralized tree supports from central column");
        
        if (!this.centralColumn || !this.centralStartPoint) {
            console.error("❌ Central column or start point not found");
            console.error(`Central column: ${this.centralColumn}`);
            console.error(`Central start point: ${this.centralStartPoint}`);
            return [];
        }
        
        console.log(`✅ Prerequisites found - proceeding with overhang detection`);
        
        // Step 1: Detect all overhangs that need support
        console.log(`🔍 Starting overhang detection on ${this.objects.length} objects...`);
        const overhangs = this.overhang_detector.detectAllOverhangs(this.objects);
        
        if (overhangs.length === 0) {
            console.log("❌ No overhangs detected requiring support - objects may not need support or detection parameters may need adjustment");
            return [];
        }
        
        console.log(`✅ Found ${overhangs.length} overhang points requiring support`);
        
        // Step 2: Generate support paths from central point to each overhang
        const support_geometry = [];
        
        for (const overhang of overhangs) {
            const path = this.generateSupportPath(overhang);
            if (path && path.length > 0) {
                support_geometry.push(...path);
            }
        }
        
        console.log(`Generated ${support_geometry.length} support elements`);
        return support_geometry;
    }
    
    generateSupportPath(overhang) {
        console.log(`🎯 Generating path to overhang at (${overhang.position.x.toFixed(2)}, ${overhang.position.y.toFixed(2)}, ${overhang.position.z.toFixed(2)})`);
        
        // Get central start position (base of column)
        const startPos = new THREE.Vector3();
        this.centralStartPoint.getWorldPosition(startPos);
        
        const endPos = new THREE.Vector3(overhang.position.x, overhang.position.y, overhang.position.z);
        
        // Generate path using Cura's tree growing algorithm
        const pathElements = this.growPathToCura(startPos, endPos, overhang);
        
        return pathElements;
    }
    
    growPathToCura(startPos, endPos, overhang) {
        const pathElements = [];
        const totalDistance = startPos.distanceTo(endPos);
        const totalLayers = Math.ceil(totalDistance / this.layer_height);
        
        // Create path segments following Cura's approach
        let currentPos = startPos.clone();
        let currentRadius = TREE_CONFIG.branch_radius; // Start thick at base
        
        const direction = new THREE.Vector3().subVectors(endPos, startPos).normalize();
        const stepSize = totalDistance / Math.max(totalLayers, 10);
        
        for (let i = 0; i < totalLayers; i++) {
            const progress = i / totalLayers;
            const layer = Math.floor(startPos.y / this.layer_height) + i;
            
            // Calculate next position with some organic variation
            const nextPos = this.calculateNextPosition(currentPos, endPos, progress, overhang);
            
            // Check for collisions and adjust path if needed
            const adjustedPos = this.avoidCollisions(nextPos, currentRadius);
            
            // Calculate radius (taper as we get further from base)
            const distanceFromTip = (1 - progress) * totalDistance;
            currentRadius = this.calculateBranchRadius(distanceFromTip);
            
            // Create path segment
            if (i > 0) {
                const segment = this.createPathSegment(currentPos, adjustedPos, currentRadius);
                if (segment) {
                    pathElements.push(segment);
                }
            }
            
            // Create support node at this position
            const node = this.createSupportNode(adjustedPos, currentRadius, layer);
            pathElements.push(node);
            
            currentPos = adjustedPos;
            
            // Stop if we're close enough to target
            if (currentPos.distanceTo(endPos) < TREE_CONFIG.support_xy_distance) {
                break;
            }
        }
        
        console.log(`  Generated path with ${pathElements.length} elements`);
        return pathElements;
    }
    
    calculateNextPosition(currentPos, targetPos, progress, overhang) {
        // Cura-style movement: combination of direct movement and organic curves
        const directVector = new THREE.Vector3().subVectors(targetPos, currentPos);
        const distance = directVector.length();
        
        // Calculate maximum movement distance based on progress
        const maxMove = progress < 0.3 ? TREE_CONFIG.maximum_move_distance_slow : TREE_CONFIG.maximum_move_distance;
        const moveDistance = Math.min(distance, maxMove);
        
        // Add some organic curvature (Cura's tree-like growth)
        const organicOffset = this.calculateOrganicOffset(currentPos, targetPos, progress);
        
        const nextPos = currentPos.clone();
        nextPos.add(directVector.normalize().multiplyScalar(moveDistance));
        nextPos.add(organicOffset);
        
        return nextPos;
    }
    
    calculateOrganicOffset(currentPos, targetPos, progress) {
        // Add slight organic movement for natural tree appearance
        const perpVector = new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() * 0.3, // Less vertical variation
            Math.random() - 0.5
        ).normalize();
        
        // Reduce organic movement as we approach target
        const organicStrength = (1 - progress) * 0.5;
        return perpVector.multiplyScalar(organicStrength);
    }
    
    avoidCollisions(position, radius) {
        // Check collision with all objects and adjust position if needed
        const safeRadius = radius + TREE_CONFIG.support_xy_distance;
        
        for (const obj of this.objects) {
            if (this.model_volumes.isColliding(position, safeRadius)) {
                // Push away from collision
                const avoidanceArea = this.model_volumes.getAvoidanceArea(position, safeRadius, 0);
                return new THREE.Vector3(
                    avoidanceArea.center.x,
                    position.y, // Keep Y unchanged
                    avoidanceArea.center.z
                );
            }
        }
        
        return position;
    }
    
    calculateBranchRadius(distanceFromTip) {
        // Cura's radius calculation: thicker at base, thinner at tip
        const baseRadius = TREE_CONFIG.branch_radius;
        const tipRadius = TREE_CONFIG.tip_diameter / 2;
        const angle_factor = Math.tan(TREE_CONFIG.branch_diameter_angle);
        
        return Math.max(
            tipRadius,
            Math.min(baseRadius, tipRadius + distanceFromTip * angle_factor)
        );
    }
    
    createPathSegment(startPos, endPos, radius) {
        const direction = new THREE.Vector3().subVectors(endPos, startPos);
        const distance = direction.length();
        
        if (distance < 0.01) return null; // Skip very short segments
        
        return {
            type: 'connection',
            start: startPos.clone(),
            end: endPos.clone(),
            radius: radius,
            distance: distance
        };
    }
    
    createSupportNode(position, radius, layer) {
        return {
            type: 'cylinder',
            position: position.clone(),
            radius: radius,
            height: this.layer_height,
            layer: layer
        };
    }
} 

// Centralized Overhang Detector - finds overhangs on all objects
class CentralizedOverhangDetector {
    constructor(scene) {
        this.scene = scene;
        this.layer_height = TREE_CONFIG.layer_height;
    }
    
    detectAllOverhangs(objects) {
        console.log(`🔍 Scanning ${objects.length} objects for overhangs...`);
        
        const allOverhangs = [];
        
        for (const obj of objects) {
            console.log(`  📦 Analyzing object: ${obj.name} (type: ${obj.userData.type})`);
            const objectOverhangs = this.detectObjectOverhangs(obj);
            allOverhangs.push(...objectOverhangs);
            
            if (objectOverhangs.length > 0) {
                console.log(`  ✅ ${obj.name}: Found ${objectOverhangs.length} overhang points`);
            } else {
                console.log(`  ❌ ${obj.name}: No overhangs detected`);
            }
        }
        
        // Filter and optimize overhang points
        console.log(`🔧 Optimizing ${allOverhangs.length} detected overhangs...`);
        const optimizedOverhangs = this.optimizeOverhangPoints(allOverhangs);
        
        console.log(`📊 Total overhangs: ${allOverhangs.length} → ${optimizedOverhangs.length} (after optimization)`);
        return optimizedOverhangs;
    }
    
    detectObjectOverhangs(object) {
        const overhangs = [];
        
        // Get object bounding box
        const bbox = new THREE.Box3().setFromObject(object);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        
        console.log(`    📏 Object ${object.name} - Size: ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)}cm, Center: (${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)})`);
        
        const buildPlateLevel = -2.5; // Build plate Y position
        const floatingThreshold = 0.5; // If object bottom is more than 0.5cm above build plate, it's floating
        
        // Check if object is floating above build plate
        const isFloating = bbox.min.y > (buildPlateLevel + floatingThreshold);
        
        if (isFloating) {
            console.log(`    🎈 Object ${object.name} is FLOATING ${(bbox.min.y - buildPlateLevel).toFixed(2)}cm above build plate - needs bottom support`);
            
            // Generate support points under the entire bottom surface
            const bottomSupportPoints = this.generateBottomSupportPoints(object, bbox);
            overhangs.push(...bottomSupportPoints);
            
            console.log(`    ✅ Added ${bottomSupportPoints.length} bottom support points for floating object`);
        } else {
            console.log(`    🏗️ Object ${object.name} is ON build plate - checking for edge overhangs`);
        }
        
        // Sample points around the object perimeter at different heights (for edge overhangs)
        const layers = Math.ceil(size.y / this.layer_height);
        const overhangAngle = TREE_CONFIG.support_angle;
        
        console.log(`    🔍 Scanning ${layers} layers (${this.layer_height}cm layer height) with ${(overhangAngle * 180 / Math.PI).toFixed(1)}° support angle`);
        
        for (let layer = 1; layer < layers; layer++) {
            const y = bbox.min.y + layer * this.layer_height;
            const layerOverhangs = this.findOverhangsAtHeight(object, y, overhangAngle);
            if (layerOverhangs.length > 0) {
                console.log(`      Layer ${layer} (y=${y.toFixed(2)}): Found ${layerOverhangs.length} overhang points`);
            }
            overhangs.push(...layerOverhangs);
        }
        
        // TEMPORARY: Add artificial overhangs for testing cubes ONLY if they're on the build plate
        if (object.userData.type === 'cube' && !isFloating && overhangs.length === 0) {
            console.log(`    🧪 Adding artificial overhang points for testing cube: ${object.name}`);
            // Add some test overhang points around the cube's upper edges
            const testHeight = bbox.min.y + size.y * 0.8; // Near the top of the cube
            for (let i = 0; i < 4; i++) {
                const angle = (i / 4) * Math.PI * 2;
                const radius = Math.max(size.x, size.z) * 0.6;
                const testPoint = new THREE.Vector3(
                    center.x + Math.cos(angle) * radius,
                    testHeight,
                    center.z + Math.sin(angle) * radius
                );
                overhangs.push({
                    position: testPoint,
                    normal: new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
                    object: object,
                    height: testHeight
                });
            }
            console.log(`    ✅ Added ${overhangs.length} test overhang points`);
        }
        
        return overhangs;
    }
    
    generateBottomSupportPoints(object, bbox) {
        const supportPoints = [];
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        
        // Generate a grid of support points under the object's bottom surface
        const density = 2.0; // Support point every 2cm
        const pointsX = Math.max(1, Math.ceil(size.x / density));
        const pointsZ = Math.max(1, Math.ceil(size.z / density));
        
        console.log(`    📐 Generating ${pointsX}×${pointsZ} grid of bottom support points`);
        
        for (let i = 0; i < pointsX; i++) {
            for (let j = 0; j < pointsZ; j++) {
                // Calculate position for this support point
                const x = bbox.min.x + (i + 0.5) * (size.x / pointsX);
                const z = bbox.min.z + (j + 0.5) * (size.z / pointsZ);
                const y = bbox.min.y - 0.1; // Slightly below the object bottom
                
                const supportPoint = new THREE.Vector3(x, y, z);
                
                supportPoints.push({
                    position: supportPoint,
                    normal: new THREE.Vector3(0, -1, 0), // Pointing downward
                    object: object,
                    height: y,
                    type: 'bottom_support' // Mark as bottom support for different handling
                });
            }
        }
        
        return supportPoints;
    }
    
    findOverhangsAtHeight(object, height, overhangAngle) {
        const overhangs = [];
        const samples = 16; // Sample points around perimeter
        
        const bbox = new THREE.Box3().setFromObject(object);
        const center = bbox.getCenter(new THREE.Vector3());
        const maxRadius = Math.max(
            bbox.max.x - center.x,
            bbox.max.z - center.z
        );
        
        // Sample points in a circle around the object at this height
        for (let i = 0; i < samples; i++) {
            const angle = (i / samples) * Math.PI * 2;
            const radius = maxRadius * 1.2; // Sample slightly outside object bounds
            
            const testPoint = new THREE.Vector3(
                center.x + Math.cos(angle) * radius,
                height,
                center.z + Math.sin(angle) * radius
            );
            
            // Check if this point would need support
            if (this.needsSupport(testPoint, object, overhangAngle)) {
                overhangs.push({
                    position: testPoint,
                    normal: new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
                    object: object,
                    height: height
                });
            }
        }
        
        return overhangs;
    }
    
    needsSupport(point, object, overhangAngle) {
        // Simplified overhang detection
        // Check if point is close to object surface and extends beyond support angle
        
        const bbox = new THREE.Box3().setFromObject(object);
        const center = bbox.getCenter(new THREE.Vector3());
        
        // Distance from object center
        const horizontalDist = Math.sqrt(
            (point.x - center.x) ** 2 + (point.z - center.z) ** 2
        );
        
        // Height above base
        const heightAboveBase = point.y - bbox.min.y;
        
        // Calculate overhang distance based on support angle
        const maxSupportedOverhang = heightAboveBase * Math.tan(overhangAngle);
        
        // If horizontal distance exceeds what can be supported at this height, needs support
        const objectRadius = Math.max(bbox.max.x - center.x, bbox.max.z - center.z);
        const overhangDistance = horizontalDist - objectRadius;
        
        return overhangDistance > 0 && overhangDistance > maxSupportedOverhang * 0.5;
    }
    
    optimizeOverhangPoints(overhangs) {
        // Remove overhang points that are too close to each other
        const optimized = [];
        const minDistance = TREE_CONFIG.tree_support_branch_distance;
        
        for (const overhang of overhangs) {
            let tooClose = false;
            
            for (const existing of optimized) {
                const distance = overhang.position.distanceTo(existing.position);
                if (distance < minDistance) {
                    tooClose = true;
                    break;
                }
            }
            
            if (!tooClose) {
                optimized.push(overhang);
            }
        }
        
        return optimized;
    }
} 
