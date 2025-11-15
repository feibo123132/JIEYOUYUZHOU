import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface StarryCanvasProps {
  className?: string;
}

const StarryCanvas: React.FC<StarryCanvasProps> = ({ className = '' }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // 创建场景
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 1);
    mountRef.current.appendChild(renderer.domElement);

    // 创建星星粒子系统
    const starsGeometry = new THREE.BufferGeometry();
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xFFFFFF,
      size: 2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8
    });

    const starsVertices = [];
    const starsColors = [];
    
    // 生成随机星星位置
    for (let i = 0; i < 8000; i++) {
      const x = (Math.random() - 0.5) * 2000;
      const y = (Math.random() - 0.5) * 2000;
      const z = (Math.random() - 0.5) * 2000;
      starsVertices.push(x, y, z);

      // 随机星星颜色（白色、淡蓝色、淡黄色）
      const colorChoice = Math.random();
      if (colorChoice < 0.7) {
        starsColors.push(1, 1, 1); // 白色
      } else if (colorChoice < 0.85) {
        starsColors.push(0.8, 0.9, 1); // 淡蓝色
      } else {
        starsColors.push(1, 1, 0.8); // 淡黄色
      }
    }

    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
    starsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starsColors, 3));
    
    // 启用顶点颜色
    starsMaterial.vertexColors = true;
    
    const starField = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(starField);

    // 设置相机位置
    camera.position.z = 500;

    // 动画循环
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      // 缓慢旋转星空
      starField.rotation.x += 0.0005;
      starField.rotation.y += 0.0005;
      
      // 星星闪烁效果
      const time = Date.now() * 0.001;
      const positions = starsGeometry.attributes.position.array as Float32Array;
      
      for (let i = 0; i < positions.length; i += 3) {
        const originalY = positions[i + 1];
        positions[i + 1] = originalY + Math.sin(time + i) * 0.5;
      }
      
      starsGeometry.attributes.position.needsUpdate = true;
      
      renderer.render(scene, camera);
    };

    animate();

    // 保存引用
    sceneRef.current = scene;
    rendererRef.current = renderer;

    // 处理窗口大小变化
    const handleResize = () => {
      if (!renderer || !camera) return;
      
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    // 清理函数
    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      
      if (renderer) {
        renderer.dispose();
      }
      
      if (starsGeometry) {
        starsGeometry.dispose();
      }
      
      if (starsMaterial) {
        starsMaterial.dispose();
      }
    };
  }, []);

  return (
    <div 
      ref={mountRef} 
      className={`fixed inset-0 z-0 ${className}`}
      style={{ background: 'linear-gradient(to bottom, #0F1419, #1a1a2e, #16213e)' }}
    />
  );
};

export default StarryCanvas;