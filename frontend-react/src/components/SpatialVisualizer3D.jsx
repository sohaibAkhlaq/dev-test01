import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Eye, RotateCcw, Box, Sparkles } from 'lucide-react';

export default function SpatialVisualizer3D({ classes = [], totalAnnotations = 0, selectedClass = null }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const boxesGroupRef = useRef(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [hoveredBox, setHoveredBox] = useState(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 380;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(15, 18, 22);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x6366f1, 2.0);
    dirLight.position.set(20, 30, 10);
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0x06b6d4, 3, 50);
    pointLight.position.set(-10, 15, -10);
    scene.add(pointLight);

    // 3. Holographic Ground Grid
    const gridHelper = new THREE.GridHelper(30, 20, 0x6366f1, 0x1e293b);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // 4. Group for 3D Labeled Shapes / Bounding Boxes
    const boxesGroup = new THREE.Group();
    scene.add(boxesGroup);
    boxesGroupRef.current = boxesGroup;

    // 5. Mouse Orbit Interaction
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };

    const handleMouseDown = (e) => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouse.x;
      const deltaY = e.clientY - prevMouse.y;

      boxesGroup.rotation.y += deltaX * 0.008;
      boxesGroup.rotation.x += deltaY * 0.008;
      gridHelper.rotation.y = boxesGroup.rotation.y;

      prevMouse = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Resize Handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    // 6. Animation Loop
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (autoRotate && !isDragging) {
        boxesGroup.rotation.y += 0.004;
        gridHelper.rotation.y = boxesGroup.rotation.y;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  // Update 3D Bounding Boxes when classes update
  useEffect(() => {
    const group = boxesGroupRef.current;
    if (!group) return;

    // Clear old boxes
    while (group.children.length > 0) {
      const obj = group.children[0];
      group.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    }

    const activeClasses = (classes || []).filter((c) => c.count > 0);
    if (activeClasses.length === 0) return;

    // Create 3D Spatial Cuboids representing annotation clusters
    activeClasses.forEach((cls, idx) => {
      const count = cls.count;
      const colorHex = cls.color || '#6366f1';
      const threeColor = new THREE.Color(colorHex);

      // Generate realistic spatial cluster
      const angle = (idx / activeClasses.length) * Math.PI * 2;
      const radius = 6 + (idx % 3) * 2.5;
      const posX = Math.cos(angle) * radius;
      const posZ = Math.sin(angle) * radius;
      const height = Math.min(Math.max(count * 0.15, 1.2), 6.5);
      const width = 2.2;
      const depth = 2.2;

      // 1. Semi-transparent 3D Box
      const boxGeo = new THREE.BoxGeometry(width, height, depth);
      const boxMat = new THREE.MeshStandardMaterial({
        color: threeColor,
        transparent: true,
        opacity: 0.45,
        roughness: 0.2,
        metalness: 0.8,
      });
      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      boxMesh.position.set(posX, height / 2, posZ);

      // 2. Wireframe glowing edges
      const edges = new THREE.EdgesGeometry(boxGeo);
      const lineMat = new THREE.LineBasicMaterial({
        color: threeColor,
        linewidth: 2,
      });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      boxMesh.add(wireframe);

      // 3. Top Anchor Sphere
      const sphereGeo = new THREE.SphereGeometry(0.3, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.set(0, height / 2 + 0.3, 0);
      boxMesh.add(sphere);

      boxMesh.userData = { className: cls.name, count: cls.count, color: colorHex };
      group.add(boxMesh);
    });
  }, [classes]);

  const resetCamera = () => {
    if (boxesGroupRef.current) {
      boxesGroupRef.current.rotation.set(0, 0, 0);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} className="three-viewport-wrap" />

      {/* Viewport Overlay HUD */}
      <div className="viewport-overlay-controls">
        <div className="viewport-tag">
          <Sparkles size={12} style={{ display: 'inline', marginRight: 4 }} />
          3D CVAT Spatial Cuboid Engine ({totalAnnotations} shapes)
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', pointerEvents: 'auto' }}>
          <button
            className="btn-tech btn-tech-outline"
            style={{ padding: '0.2rem 0.6rem', fontSize: '0.72rem' }}
            onClick={() => setAutoRotate(!autoRotate)}
            title="Toggle Orbit Auto-Rotation"
          >
            <RotateCcw size={12} />
            {autoRotate ? 'Pause Orbit' : 'Auto Orbit'}
          </button>
          <button
            className="btn-tech btn-tech-outline"
            style={{ padding: '0.2rem 0.6rem', fontSize: '0.72rem' }}
            onClick={resetCamera}
            title="Reset Perspective"
          >
            <Eye size={12} />
            Reset View
          </button>
        </div>
      </div>
    </div>
  );
}
