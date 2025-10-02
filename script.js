const BUILD_VOLUME = {
    width: 250,
    depth: 250,
    height: 250
};

const TREE_PARAMS = {
    step: 8,
    attractionRadius: 45,
    mergeRadius: 12,
    reachDistance: 5,
    maxIterations: 240,
    minUpComponent: 0.2,
    maxTurn: THREE.MathUtils.degToRad(32),
    clearance: 1.5,
    minRadius: 0.9,
    baseRadius: 2.6,
    radiusScale: 1.1,
    radiusExponent: 0.48,
    tipRadius: 1.2,
    tipHeight: 4.0,
    tipGap: 1.4,
    upBias: 0.12
};

class SupportNode {
    constructor(position, parent = null) {
        this.position = position.clone();
        this.parent = parent;
        this.children = [];
        this.flow = 0;
        this.tipFlow = 0;
        this.radius = TREE_PARAMS.minRadius;
        this.id = SupportNode._nextId++;
    }
}
SupportNode._nextId = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d14);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(180, 190, 210);
camera.lookAt(new THREE.Vector3(0, BUILD_VOLUME.height * 0.35, 0));

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0x707070, 0.65);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
keyLight.position.set(140, 220, 160);
keyLight.castShadow = true;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 600;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x96b8ff, 0.35);
fillLight.position.set(-160, 140, -190);
scene.add(fillLight);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 80;
controls.maxDistance = 520;
controls.maxPolarAngle = Math.PI * 0.48;

const grid = new THREE.GridHelper(BUILD_VOLUME.width, 10, 0x4d6c6d, 0x2a363c);
grid.position.y = 0;
scene.add(grid);

const buildPlateGeometry = new THREE.PlaneGeometry(BUILD_VOLUME.width, BUILD_VOLUME.depth);
const buildPlateMaterial = new THREE.MeshStandardMaterial({
    color: 0x1d2a30,
    metalness: 0.1,
    roughness: 0.7,
    transparent: true,
    opacity: 0.85
});
const buildPlate = new THREE.Mesh(buildPlateGeometry, buildPlateMaterial);
buildPlate.rotation.x = -Math.PI / 2;
buildPlate.receiveShadow = true;
scene.add(buildPlate);

const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x264a63, transparent: true, opacity: 0.45 });
const outlineGeometry = new THREE.BufferGeometry();
const hw = BUILD_VOLUME.width / 2;
const hh = BUILD_VOLUME.height;
const hd = BUILD_VOLUME.depth / 2;
const outlineVertices = [
    -hw, 0, -hd,  hw, 0, -hd,
    hw, 0, -hd,   hw, 0,  hd,
    hw, 0,  hd,  -hw, 0,  hd,
    -hw, 0,  hd, -hw, 0, -hd,

    -hw, hh, -hd,  hw, hh, -hd,
    hw, hh, -hd,   hw, hh,  hd,
    hw, hh,  hd,  -hw, hh,  hd,
    -hw, hh,  hd, -hw, hh, -hd,

    -hw, 0, -hd, -hw, hh, -hd,
    hw, 0, -hd,  hw, hh, -hd,
    hw, 0,  hd,  hw, hh,  hd,
    -hw, 0,  hd, -hw, hh,  hd
];
outlineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(outlineVertices, 3));
const buildOutline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
scene.add(buildOutline);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const loader = new THREE.STLLoader();

const importBtn = document.getElementById('importBtn');
const targetBtn = document.getElementById('targetBtn');
const clearTargetsBtn = document.getElementById('clearTargetsBtn');
const generateBtn = document.getElementById('generateBtn');
const clearSupportsBtn = document.getElementById('clearSupportsBtn');
const statusEl = document.getElementById('status');
const fileInput = document.getElementById('fileInput');
const targetListEl = document.getElementById('targetList');

let isPickingTargets = false;
let parts = [];
let targets = [];
let supportGroup = new THREE.Group();
scene.add(supportGroup);

function setStatus(message) {
    statusEl.textContent = message;
}

function formatVector(vec) {
    return `${vec.x.toFixed(1)}, ${vec.y.toFixed(1)}, ${vec.z.toFixed(1)}`;
}

function updateTargetList() {
    targetListEl.innerHTML = '';
    targets.forEach((target, index) => {
        const item = document.createElement('li');
        item.className = 'target-item';
        const info = document.createElement('div');
        info.textContent = `Target ${index + 1}: ${formatVector(target.position)}`;
        const normal = document.createElement('div');
        normal.style.color = '#7ca8ff';
        normal.textContent = `Normal: ${formatVector(target.supportDirection)}`;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'danger';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
            scene.remove(target.marker);
            target.marker.geometry.dispose();
            target.marker.material.dispose();
            targets.splice(index, 1);
            updateTargetList();
            setStatus(`Removed target ${index + 1}.`);
        });
        item.appendChild(info);
        item.appendChild(normal);
        item.appendChild(removeBtn);
        targetListEl.appendChild(item);
    });
}

function clampToBuildVolume(position) {
    position.x = THREE.MathUtils.clamp(position.x, -hw + TREE_PARAMS.clearance, hw - TREE_PARAMS.clearance);
    position.z = THREE.MathUtils.clamp(position.z, -hd + TREE_PARAMS.clearance, hd - TREE_PARAMS.clearance);
    position.y = THREE.MathUtils.clamp(position.y, TREE_PARAMS.clearance, hh - TREE_PARAMS.clearance);
}

function addTarget(intersection) {
    const worldPoint = intersection.point.clone();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(intersection.object.matrixWorld);
    const worldNormal = intersection.face.normal.clone().applyMatrix3(normalMatrix).normalize();
    let supportDir = worldNormal.clone().negate();
    if (supportDir.y <= 0.05) {
        supportDir = new THREE.Vector3(0, 1, 0);
    }
    supportDir.normalize();
    const anchor = worldPoint.clone().addScaledVector(supportDir, -TREE_PARAMS.tipGap);
    clampToBuildVolume(anchor);

    const markerGeometry = new THREE.SphereGeometry(2.5, 18, 14);
    const markerMaterial = new THREE.MeshStandardMaterial({ color: 0xffc857, emissive: 0x362200, metalness: 0.1, roughness: 0.4 });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.copy(worldPoint);
    scene.add(marker);

    targets.push({
        position: worldPoint,
        normal: worldNormal,
        supportDirection: supportDir,
        anchor,
        weight: 1.0,
        marker,
        mesh: intersection.object
    });
    updateTargetList();
    setStatus(`Added target ${targets.length} at ${formatVector(worldPoint)}.`);
}

function onPointerDown(event) {
    if (!isPickingTargets || event.button !== 0) {
        return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(parts, false);
    if (intersects.length === 0) {
        return;
    }
    addTarget(intersects[0]);
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);

function clearTargets() {
    targets.forEach(target => {
        scene.remove(target.marker);
        target.marker.geometry.dispose();
        target.marker.material.dispose();
    });
    targets = [];
    updateTargetList();
}

function clearSupports() {
    scene.remove(supportGroup);
    supportGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    });
    supportGroup = new THREE.Group();
    scene.add(supportGroup);
}

function fitGeometryToBuildVolume(geometry) {
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const available = Math.min(BUILD_VOLUME.width * 0.92, BUILD_VOLUME.height * 0.92, BUILD_VOLUME.depth * 0.92);
    const scaleFactor = maxDim > available ? available / maxDim : 1;
    geometry.scale(scaleFactor, scaleFactor, scaleFactor);
    geometry.center();
    geometry.computeBoundingBox();
    return geometry.boundingBox;
}

function loadSTL(buffer, name) {
    const geometry = loader.parse(buffer);
    geometry.computeVertexNormals();
    const bbox = fitGeometryToBuildVolume(geometry);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const material = new THREE.MeshStandardMaterial({
        color: 0x8ab5ff,
        metalness: 0.2,
        roughness: 0.6
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = size.y / 2;
    mesh.name = name || `Imported STL ${parts.length + 1}`;
    scene.add(mesh);
    parts.push(mesh);
    setStatus(`Loaded ${mesh.name}. Add targets to continue.`);
}

importBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        clearTargets();
        clearSupports();
        loadSTL(e.target.result, file.name);
    };
    reader.readAsArrayBuffer(file);
    fileInput.value = '';
});

targetBtn.addEventListener('click', () => {
    isPickingTargets = !isPickingTargets;
    targetBtn.classList.toggle('active', isPickingTargets);
    setStatus(isPickingTargets ? 'Target placement active – click the part to add tips.' : 'Target placement disabled.');
});

clearTargetsBtn.addEventListener('click', () => {
    clearTargets();
    setStatus('Cleared all targets.');
});

clearSupportsBtn.addEventListener('click', () => {
    clearSupports();
    setStatus('Removed generated supports.');
});

function nearestNodeWithin(nodes, point, radius) {
    let best = null;
    let bestDistSq = radius * radius;
    for (const node of nodes) {
        const distSq = node.position.distanceToSquared(point);
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            best = node;
        }
    }
    return best;
}

function findNodeNear(nodes, point, radius, exclude) {
    const radiusSq = radius * radius;
    for (const node of nodes) {
        if (node === exclude) continue;
        if (node.position.distanceToSquared(point) < radiusSq) {
            return node;
        }
    }
    return null;
}

function distancePointToSegment(point, a, b) {
    const ab = b.clone().sub(a);
    const t = THREE.MathUtils.clamp(point.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
    const closest = a.clone().addScaledVector(ab, t);
    return {
        distance: closest.distanceTo(point),
        closest,
        t
    };
}

function createRoots(targets) {
    const rootPositions = [];
    for (const target of targets) {
        const projected = new THREE.Vector3(target.anchor.x, TREE_PARAMS.clearance, target.anchor.z);
        clampToBuildVolume(projected);
        let merged = false;
        for (const pos of rootPositions) {
            if (pos.distanceToSquared(projected) < TREE_PARAMS.mergeRadius * TREE_PARAMS.mergeRadius) {
                pos.add(projected).multiplyScalar(0.5);
                merged = true;
                break;
            }
        }
        if (!merged) {
            rootPositions.push(projected);
        }
    }
    if (rootPositions.length === 0) {
        rootPositions.push(new THREE.Vector3(0, TREE_PARAMS.clearance, 0));
    }
    return rootPositions.map(pos => new SupportNode(pos));
}

function ensureTipNode(node, target, nodes) {
    const anchor = target.anchor.clone();
    const segmentDistance = anchor.distanceTo(node.position);
    if (segmentDistance > TREE_PARAMS.step * 0.6) {
        const tipNode = new SupportNode(anchor, node);
        node.children.push(tipNode);
        tipNode.tipFlow += target.weight;
        tipNode.isTip = true;
        nodes.push(tipNode);
        return tipNode;
    }
    node.tipFlow += target.weight;
    node.isTip = true;
    return node;
}

function propagateFlow(nodes) {
    nodes.forEach(node => {
        node.flow = node.tipFlow || 0;
    });
    const sorted = nodes.slice().sort((a, b) => b.position.y - a.position.y);
    for (const node of sorted) {
        if (node.parent) {
            node.parent.flow += node.flow;
        }
    }
    for (const node of nodes) {
        const influence = node.flow > 0 ? node.flow : (node.children.reduce((sum, child) => sum + child.flow, 0));
        const radius = TREE_PARAMS.radiusScale * Math.pow(Math.max(influence, 1e-3), TREE_PARAMS.radiusExponent);
        node.radius = Math.max(TREE_PARAMS.minRadius, radius);
        if (!node.parent) {
            node.radius = Math.max(node.radius, TREE_PARAMS.baseRadius);
        }
    }
}

function buildSupportMeshes(nodes, resolvedTargets) {
    clearSupports();
    const branchMaterial = new THREE.MeshStandardMaterial({
        color: 0x5ac18e,
        roughness: 0.6,
        metalness: 0.1
    });
    for (const node of nodes) {
        if (!node.parent) continue;
        const start = node.parent.position;
        const end = node.position;
        const direction = end.clone().sub(start);
        const length = direction.length();
        if (length < 0.1) continue;
        const geometry = new THREE.CylinderGeometry(node.radius, node.parent.radius, length, 10, 1, false);
        const branch = new THREE.Mesh(geometry, branchMaterial);
        branch.castShadow = true;
        branch.receiveShadow = true;
        const midpoint = start.clone().addScaledVector(direction, 0.5);
        branch.position.copy(midpoint);
        const orientation = new THREE.Quaternion();
        orientation.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
        branch.setRotationFromQuaternion(orientation);
        supportGroup.add(branch);
    }

    const tipMaterial = new THREE.MeshStandardMaterial({ color: 0xffe29f, roughness: 0.3, metalness: 0.15 });
    resolvedTargets.forEach(target => {
        const tipGeometry = new THREE.ConeGeometry(TREE_PARAMS.tipRadius, TREE_PARAMS.tipHeight, 12, 1, true);
        const tip = new THREE.Mesh(tipGeometry, tipMaterial);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), target.supportDirection.clone().normalize());
        tip.setRotationFromQuaternion(quaternion);
        const tipPosition = target.position.clone().addScaledVector(target.supportDirection, -TREE_PARAMS.tipHeight / 2);
        tip.position.copy(tipPosition);
        tip.castShadow = true;
        tip.receiveShadow = true;
        supportGroup.add(tip);
    });
}

function generateSupports() {
    if (parts.length === 0) {
        setStatus('Import a part before generating supports.');
        return;
    }
    if (targets.length === 0) {
        setStatus('Add at least one target to grow supports.');
        return;
    }

    const nodes = createRoots(targets);
    const unresolved = targets.map(target => ({ ...target, reached: false, tipNode: null }));

    let iterations = 0;
    while (iterations < TREE_PARAMS.maxIterations && unresolved.some(t => !t.reached)) {
        iterations++;
        const attractionMap = new Map();
        for (const target of unresolved) {
            if (target.reached) continue;
            const nearest = nearestNodeWithin(nodes, target.anchor, TREE_PARAMS.attractionRadius);
            if (!nearest) continue;
            const toTarget = target.anchor.clone().sub(nearest.position);
            const distance = toTarget.length();
            if (distance < TREE_PARAMS.reachDistance) {
                target.reached = true;
                target.tipNode = ensureTipNode(nearest, target, nodes);
                continue;
            }
            toTarget.normalize();
            toTarget.y = Math.max(toTarget.y + TREE_PARAMS.upBias, TREE_PARAMS.minUpComponent);
            toTarget.normalize();
            if (attractionMap.has(nearest)) {
                attractionMap.get(nearest).add(toTarget);
            } else {
                attractionMap.set(nearest, toTarget);
            }
        }

        if (attractionMap.size === 0) {
            break;
        }

        const newNodes = [];
        for (const [node, attraction] of attractionMap.entries()) {
            const direction = attraction.clone().normalize();
            const parentDirection = node.parent ? node.position.clone().sub(node.parent.position).normalize() : new THREE.Vector3(0, 1, 0);
            const angle = direction.angleTo(parentDirection);
            if (angle > TREE_PARAMS.maxTurn) {
                direction.copy(parentDirection.clone().lerp(direction, TREE_PARAMS.maxTurn / angle)).normalize();
            }
            if (direction.y < TREE_PARAMS.minUpComponent) {
                direction.y = TREE_PARAMS.minUpComponent;
                direction.normalize();
            }
            const candidate = node.position.clone().addScaledVector(direction, TREE_PARAMS.step);
            clampToBuildVolume(candidate);
            if (candidate.y <= node.position.y + 0.2) {
                candidate.y = node.position.y + TREE_PARAMS.step * 0.6;
            }
            const merged = findNodeNear(nodes, candidate, TREE_PARAMS.mergeRadius, node);
            let child;
            if (merged && merged.position.y > node.position.y) {
                child = merged;
                if (!child.parent || child.parent.position.distanceTo(node.position) > 1) {
                    child.parent = node;
                    node.children.push(child);
                }
            } else {
                child = new SupportNode(candidate, node);
                node.children.push(child);
                nodes.push(child);
                newNodes.push(child);
            }
        }

        if (newNodes.length === 0) {
            break;
        }

        for (const child of newNodes) {
            for (const target of unresolved) {
                if (target.reached) continue;
                const info = distancePointToSegment(target.anchor, child.parent.position, child.position);
                if (info.distance < TREE_PARAMS.reachDistance && child.position.y >= child.parent.position.y) {
                    target.reached = true;
                    target.tipNode = ensureTipNode(child, target, nodes);
                }
            }
        }
    }

    for (const target of unresolved) {
        if (!target.reached) {
            const base = new THREE.Vector3(target.anchor.x, TREE_PARAMS.clearance, target.anchor.z);
            clampToBuildVolume(base);
            const root = new SupportNode(base);
            const tip = new SupportNode(target.anchor.clone(), root);
            tip.tipFlow = target.weight;
            tip.isTip = true;
            root.children.push(tip);
            nodes.push(root, tip);
        }
    }

    propagateFlow(nodes);
    buildSupportMeshes(nodes, targets);
    setStatus(`Generated tree supports with ${nodes.length} nodes in ${iterations} iterations.`);
}

generateBtn.addEventListener('click', generateSupports);

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
