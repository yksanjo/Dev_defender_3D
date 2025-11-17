import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Crosshair, Heart, Shield, Target, Zap } from 'lucide-react';
import './App.css';

const BASE_AMMO = 30;
const enemyBlueprints = {
  PM: { color: 0xff5c5c, speed: 0.8, damage: 15, health: 120, points: 120 },
  Marketing: { color: 0x8c5cff, speed: 0.6, damage: 10, health: 160, points: 160 },
  QA: { color: 0x5ce0ff, speed: 1, damage: 8, health: 90, points: 90 },
};

const DevDefender3D = () => {
  const [score, setScore] = useState(0);
  const [health, setHealth] = useState(100);
  const [ammo, setAmmo] = useState(BASE_AMMO);
  const [isReloading, setIsReloading] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [wave, setWave] = useState(1);
  const [enemies, setEnemies] = useState([]);
  const [, setPowerUps] = useState([]);
  const [muzzleFlash, setMuzzleFlash] = useState(false);
  const [killStreak, setKillStreak] = useState(0);
  const [abilityCharge, setAbilityCharge] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const enemiesRef = useRef([]);
  const powerUpsRef = useRef([]);
  const bulletsRef = useRef([]);
  const weaponGroupRef = useRef(null);
  const animationRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const playerRotation = useRef({ yaw: 0, pitch: 0 });
  const keys = useRef({});
  const mouseMovement = useRef({ x: 0, y: 0 });
  const raycasterRef = useRef(new THREE.Raycaster());
  const streakTimeoutRef = useRef(null);

  const cleanupObjects = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    enemiesRef.current.forEach((enemy) => {
      if (enemy.mesh && sceneRef.current) sceneRef.current.remove(enemy.mesh);
    });
    powerUpsRef.current.forEach((pickup) => {
      if (pickup.mesh && sceneRef.current) sceneRef.current.remove(pickup.mesh);
    });
    bulletsRef.current.forEach((bullet) => {
      if (bullet.mesh && sceneRef.current) sceneRef.current.remove(bullet.mesh);
    });
    enemiesRef.current = [];
    powerUpsRef.current = [];
    bulletsRef.current = [];
  }, []);

  const applyPowerUp = useCallback((kind) => {
    switch (kind) {
      case 'ammo':
        setAmmo((a) => Math.min(BASE_AMMO, a + 15));
        setStatusMessage('Ammo cache secured');
        break;
      case 'health':
        setHealth((h) => Math.min(120, h + 25));
        setStatusMessage('Med kit collected');
        break;
      case 'shield':
        setHealth((h) => Math.min(130, h + 35));
        setStatusMessage('Shield boost activated');
        break;
      default:
        break;
    }
    setTimeout(() => setStatusMessage(''), 2000);
  }, []);

  const spawnPowerUp = useCallback((kind, position) => {
    if (!sceneRef.current) return;
    const colors = {
      ammo: 0x22d3ee,
      health: 0xfb7185,
      shield: 0xfacc15,
    };
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.7, 0),
      new THREE.MeshStandardMaterial({
        color: colors[kind] ?? 0xffffff,
        emissive: colors[kind] ?? 0xffffff,
        emissiveIntensity: 0.6,
        metalness: 0.2,
      }),
    );
    mesh.position.copy(position.clone().add(new THREE.Vector3(0, 1, 0)));
    mesh.castShadow = true;
    sceneRef.current.add(mesh);

    const pickup = { id: crypto.randomUUID(), kind, mesh };
    powerUpsRef.current = [...powerUpsRef.current, pickup];
    setPowerUps([...powerUpsRef.current]);
  }, []);

  const initScene = useCallback(() => {
    if (!canvasRef.current) return;

    const scene = new THREE.Scene();
    // Set clear sky blue background - very obvious
    scene.background = new THREE.Color(0x87CEEB);
    sceneRef.current = scene;

    // Simple fog for depth
    scene.fog = new THREE.Fog(0x87CEEB, 0, 200);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current, 
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    // Strong lighting for visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 4096;
    directionalLight.shadow.mapSize.height = 4096;
    directionalLight.shadow.camera.far = 200;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    directionalLight.shadow.bias = -0.0001;
    scene.add(directionalLight);

    // Create floor plane - Forest green, very visible
    const floorGeometry = new THREE.PlaneGeometry(200, 200, 20, 20);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x228B22,        // Forest green - very visible
      roughness: 0.9,
      metalness: 0.1,
      wireframe: false,       // Make sure wireframe is OFF
      side: THREE.DoubleSide  // Render both sides
    });

    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    floor.position.y = 0;             // At ground level
    floor.receiveShadow = true;
    scene.add(floor);

    // Add visible white grid on top of floor
    const gridHelper = new THREE.GridHelper(200, 40, 0xFFFFFF, 0x444444);
    gridHelper.position.y = 0.01; // Slightly above floor to prevent z-fighting
    scene.add(gridHelper);

    // Add reference cube for debugging (bright red, easy to see)
    const cubeGeometry = new THREE.BoxGeometry(5, 5, 5);
    const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0xFF0000 }); // Bright red
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.set(0, 2.5, 0); // Sitting on floor
    cube.castShadow = true;
    scene.add(cube);

    // Add axes helper for debugging (Red=X, Green=Y/up, Blue=Z)
    const axesHelper = new THREE.AxesHelper(10);
    scene.add(axesHelper);

    // Create buildings
    const buildingPositions = [
      [-15, 0, -20], [15, 0, -20], [-25, 0, -40],
      [25, 0, -40], [0, 0, -60], [-35, 0, -15],
      [35, 0, -15], [-20, 0, 20], [20, 0, 20],
      [-30, 0, 30], [30, 0, 30], [0, 0, 40],
      [-40, 0, 0], [40, 0, 0]
    ];

    buildingPositions.forEach(pos => {
      const height = Math.random() * 10 + 8;
      const width = Math.random() * 5 + 5;
      const depth = Math.random() * 5 + 5;
      
      const buildingGroup = new THREE.Group();
      
      // Main building body with better material
      const buildingGeo = new THREE.BoxGeometry(width, height, depth);
      const buildingMat = new THREE.MeshStandardMaterial({ 
        color: Math.random() > 0.5 ? 0x708090 : 0x556b2f,
        roughness: 0.7,
        metalness: 0.1,
      });
      const building = new THREE.Mesh(buildingGeo, buildingMat);
      building.castShadow = true;
      building.receiveShadow = true;
      buildingGroup.add(building);

      // Add windows
      const windowCount = Math.floor(height / 2);
      for (let i = 0; i < windowCount; i++) {
        const windowGeo = new THREE.PlaneGeometry(0.8, 0.8);
        const windowMat = new THREE.MeshStandardMaterial({ 
          color: 0x1a1a2e,
          emissive: Math.random() > 0.7 ? 0xffffaa : 0x000000,
          emissiveIntensity: 0.3,
        });
        
        // Front windows
        const frontWindow = new THREE.Mesh(windowGeo, windowMat);
        frontWindow.position.set(0, -height/2 + (i + 1) * 2, depth/2 + 0.01);
        buildingGroup.add(frontWindow);
        
        // Back windows
        const backWindow = new THREE.Mesh(windowGeo, windowMat);
        backWindow.position.set(0, -height/2 + (i + 1) * 2, -depth/2 - 0.01);
        buildingGroup.add(backWindow);
      }

      // Add roof detail
      const roofGeo = new THREE.BoxGeometry(width + 0.2, 0.3, depth + 0.2);
      const roofMat = new THREE.MeshStandardMaterial({ 
        color: 0x2c2c2c,
        roughness: 0.8,
      });
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.y = height / 2 + 0.15;
      roof.castShadow = true;
      buildingGroup.add(roof);

      buildingGroup.position.set(pos[0], height / 2, pos[2]);
      scene.add(buildingGroup);
    });

    // Realistic weapon model (assault rifle style)
    const weaponGroup = new THREE.Group();
    
    // Main body/receiver
    const bodyGeo = new THREE.BoxGeometry(0.12, 0.08, 0.4);
    const bodyMat = new THREE.MeshStandardMaterial({ 
      color: 0x1a1a1a,
      roughness: 0.3,
      metalness: 0.8,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0.2, -0.2, -0.4);
    body.castShadow = true;
    weaponGroup.add(body);

    // Barrel (longer, more detailed)
    const barrelGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.5, 16);
    const barrelMat = new THREE.MeshStandardMaterial({ 
      color: 0x2c2c2c,
      roughness: 0.2,
      metalness: 0.9,
    });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.2, -0.2, -0.65);
    barrel.castShadow = true;
    weaponGroup.add(barrel);

    // Barrel tip/flash hider
    const tipGeo = new THREE.CylinderGeometry(0.02, 0.015, 0.05, 16);
    const tip = new THREE.Mesh(tipGeo, barrelMat);
    tip.rotation.z = Math.PI / 2;
    tip.position.set(0.2, -0.2, -0.9);
    weaponGroup.add(tip);

    // Handguard/rail
    const handguardGeo = new THREE.BoxGeometry(0.1, 0.06, 0.35);
    const handguardMat = new THREE.MeshStandardMaterial({ 
      color: 0x2a2a2a,
      roughness: 0.4,
      metalness: 0.6,
    });
    const handguard = new THREE.Mesh(handguardGeo, handguardMat);
    handguard.position.set(0.2, -0.18, -0.5);
    weaponGroup.add(handguard);

    // Pistol grip
    const gripGeo = new THREE.BoxGeometry(0.06, 0.12, 0.08);
    const gripMat = new THREE.MeshStandardMaterial({ 
      color: 0x1a1a1a,
      roughness: 0.6,
      metalness: 0.1,
    });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.set(0.2, -0.28, -0.25);
    grip.rotation.x = 0.2;
    weaponGroup.add(grip);

    // Stock
    const stockGeo = new THREE.BoxGeometry(0.08, 0.1, 0.15);
    const stock = new THREE.Mesh(stockGeo, bodyMat);
    stock.position.set(0.2, -0.2, -0.15);
    weaponGroup.add(stock);

    // Magazine
    const magGeo = new THREE.BoxGeometry(0.05, 0.12, 0.04);
    const magMat = new THREE.MeshStandardMaterial({ 
      color: 0x2a2a2a,
      roughness: 0.5,
      metalness: 0.7,
    });
    const magazine = new THREE.Mesh(magGeo, magMat);
    magazine.position.set(0.2, -0.32, -0.25);
    weaponGroup.add(magazine);

    // Scope/sight (optional detail)
    const sightGeo = new THREE.BoxGeometry(0.04, 0.03, 0.08);
    const sight = new THREE.Mesh(sightGeo, barrelMat);
    sight.position.set(0.2, -0.12, -0.4);
    weaponGroup.add(sight);

    // Trigger guard
    const triggerGuardGeo = new THREE.TorusGeometry(0.03, 0.008, 8, 16, Math.PI);
    const triggerGuard = new THREE.Mesh(triggerGuardGeo, bodyMat);
    triggerGuard.rotation.x = Math.PI / 2;
    triggerGuard.position.set(0.2, -0.24, -0.2);
    weaponGroup.add(triggerGuard);

    camera.add(weaponGroup);
    weaponGroupRef.current = weaponGroup;
    scene.add(camera);

    const animate = () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
      const delta = clockRef.current.getDelta();

      playerRotation.current.yaw -= mouseMovement.current.x * 0.0025;
      playerRotation.current.pitch = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, playerRotation.current.pitch - mouseMovement.current.y * 0.0025),
      );
      mouseMovement.current = { x: 0, y: 0 };

      cameraRef.current.rotation.order = 'YXZ';
      cameraRef.current.rotation.y = playerRotation.current.yaw;
      cameraRef.current.rotation.x = playerRotation.current.pitch;

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraRef.current.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraRef.current.quaternion);
      forward.y = 0;
      right.y = 0;
      forward.normalize();
      right.normalize();

      const moveSpeed = (keys.current['shift'] ? 5 : 3) * delta;
      if (keys.current['w']) cameraRef.current.position.add(forward.clone().multiplyScalar(moveSpeed));
      if (keys.current['s']) cameraRef.current.position.add(forward.clone().multiplyScalar(-moveSpeed));
      if (keys.current['a']) cameraRef.current.position.add(right.clone().multiplyScalar(-moveSpeed));
      if (keys.current['d']) cameraRef.current.position.add(right.clone().multiplyScalar(moveSpeed));

      // Realistic weapon recoil recovery with slight sway
      if (weaponGroupRef.current) {
        // Recoil recovery
        if (weaponGroupRef.current.rotation.x < 0) {
          weaponGroupRef.current.rotation.x += 0.05;
        }
        if (weaponGroupRef.current.rotation.z !== 0) {
          weaponGroupRef.current.rotation.z *= 0.9;
        }
        if (weaponGroupRef.current.position.z < -0.4) {
          weaponGroupRef.current.position.z += 0.01;
        }
        
        // Subtle idle sway
        const time = clockRef.current.getElapsedTime();
        const baseX = 0.2;
        const baseY = -0.2;
        const baseZ = -0.4;
        weaponGroupRef.current.position.x = baseX + Math.sin(time * 0.5) * 0.002;
        weaponGroupRef.current.position.y = baseY + Math.cos(time * 0.7) * 0.002;
        if (Math.abs(weaponGroupRef.current.rotation.z) < 0.01) {
          weaponGroupRef.current.rotation.z = Math.sin(time * 0.3) * 0.01;
        }
      }

      // Update bullets
      for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
        const bullet = bulletsRef.current[i];
        if (!bullet.mesh) continue;
        bullet.mesh.position.add(bullet.velocity.clone().multiplyScalar(delta));
        
        if (bullet.mesh.position.distanceTo(cameraRef.current.position) > 100) {
          sceneRef.current.remove(bullet.mesh);
          bulletsRef.current.splice(i, 1);
        }
      }

      enemiesRef.current.forEach((enemy, index) => {
        if (!enemy.mesh) return;
        const direction = new THREE.Vector3()
          .subVectors(cameraRef.current.position, enemy.mesh.position)
          .normalize();
        
        enemy.mesh.position.add(direction.multiplyScalar(enemy.speed * (1 + wave * 0.05)));

        const distance = enemy.mesh.position.distanceTo(cameraRef.current.position);
        if (distance < 2) {
          setHealth((h) => {
            const next = Math.max(0, h - enemy.damage);
            if (next <= 0) setGameOver(true);
            return next;
          });
          
          // Push enemy back
          enemy.mesh.position.sub(direction.multiplyScalar(5));
        }
      });

      powerUpsRef.current.forEach((pickup, index) => {
        if (!pickup.mesh) return;
        pickup.mesh.rotation.y += delta * 2;
        const distance = pickup.mesh.position.distanceTo(cameraRef.current.position);
        if (distance < 2) {
          applyPowerUp(pickup.kind);
          sceneRef.current.remove(pickup.mesh);
          powerUpsRef.current.splice(index, 1);
          setPowerUps([...powerUpsRef.current]);
        }
      });


      rendererRef.current.render(sceneRef.current, cameraRef.current);
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      if (!rendererRef.current || !cameraRef.current) return;
      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [applyPowerUp]);

  const createEnemy = useCallback(() => {
    if (!sceneRef.current) return null;
    const types = Object.keys(enemyBlueprints);
    const type = types[Math.floor(Math.random() * types.length)];
    const blueprint = enemyBlueprints[type];
    const angle = Math.random() * Math.PI * 2;
    const distance = 30 + Math.random() * 30;

    // Use cylindrical enemies like in the FPSShooter example
    const enemyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8);
    const enemyMaterial = new THREE.MeshStandardMaterial({ color: blueprint.color });
    const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);
    
    enemy.position.set(
      Math.cos(angle) * distance,
      0.9,
      Math.sin(angle) * distance
    );
    enemy.castShadow = true;
    sceneRef.current.add(enemy);

    return {
      id: crypto.randomUUID(),
      type,
      mesh: enemy,
      health: blueprint.health * (1 + wave * 0.05),
      speed: blueprint.speed * 0.02,
      damage: blueprint.damage,
      points: blueprint.points,
    };
  }, [wave]);

  const handleEnemyDown = useCallback(
    (enemy) => {
      if (!enemy || !sceneRef.current) return;
      sceneRef.current.remove(enemy.mesh);
      enemiesRef.current = enemiesRef.current.filter((e) => e.id !== enemy.id);
      setEnemies([...enemiesRef.current]);

      setScore((s) => s + enemy.points);
      setAbilityCharge((c) => Math.min(100, c + 12));
      setKillStreak((current) => {
        const next = current + 1;
        if (streakTimeoutRef.current) clearTimeout(streakTimeoutRef.current);
        streakTimeoutRef.current = setTimeout(() => setKillStreak(0), 4000);
        if (next % 4 === 0) spawnPowerUp('ammo', enemy.mesh.position.clone());
        if (next % 6 === 0) spawnPowerUp('health', enemy.mesh.position.clone());
        return next;
      });

      if (Math.random() < 0.12) spawnPowerUp('shield', enemy.mesh.position.clone());
    },
    [spawnPowerUp],
  );

  const shoot = useCallback(() => {
    if (ammo <= 0 || isReloading || !cameraRef.current || !sceneRef.current) return;
    setAmmo((a) => a - 1);
    setMuzzleFlash(true);
    setTimeout(() => setMuzzleFlash(false), 90);

    // Create visible bullet
    const bulletGeometry = new THREE.SphereGeometry(0.05);
    const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    bullet.position.copy(cameraRef.current.position);
    
    const direction = new THREE.Vector3();
    cameraRef.current.getWorldDirection(direction);
    const velocity = direction.multiplyScalar(20);
    
    sceneRef.current.add(bullet);
    bulletsRef.current.push({ mesh: bullet, velocity });

    // Realistic weapon recoil with multiple axes
    if (weaponGroupRef.current) {
      weaponGroupRef.current.rotation.x = -0.15;
      weaponGroupRef.current.rotation.z = (Math.random() - 0.5) * 0.05;
      weaponGroupRef.current.position.z -= 0.02;
      
      // Recoil recovery will happen in animation loop
    }

    // Check for hits with raycaster
    const raycaster = raycasterRef.current;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), cameraRef.current);

    enemiesRef.current.forEach((enemy) => {
      if (!enemy.mesh) return;
      const intersects = raycaster.intersectObject(enemy.mesh, true);
      if (intersects.length > 0) {
        enemy.health -= 55;
        if (enemy.health <= 0) handleEnemyDown(enemy);
      }
    });
  }, [ammo, isReloading, handleEnemyDown]);

  const reload = useCallback(() => {
    if (isReloading || ammo === BASE_AMMO) return;
    setIsReloading(true);
    setTimeout(() => {
      setAmmo(BASE_AMMO);
      setIsReloading(false);
    }, 1400);
  }, [ammo, isReloading]);

  const triggerShockwave = useCallback(() => {
    if (abilityCharge < 100 || !sceneRef.current || !cameraRef.current) return;
    setAbilityCharge(0);
    setStatusMessage('Dev Shockwave deployed!');
    const radius = 15 + wave * 1.5;
    enemiesRef.current.slice().forEach((enemy) => {
      if (!enemy.mesh) return;
      const dist = enemy.mesh.position.distanceTo(cameraRef.current.position);
      if (dist <= radius) handleEnemyDown(enemy);
    });
  }, [abilityCharge, wave, handleEnemyDown]);

  useEffect(() => {
    initScene();
    return () => cleanupObjects();
  }, [initScene, cleanupObjects]);

  useEffect(() => {
    if (!gameStarted || gameOver) return;
    const spawnRate = Math.max(900, 2600 - wave * 180);
    const interval = setInterval(() => {
      if (enemiesRef.current.length >= wave + 6) return;
      const enemy = createEnemy();
      if (enemy) {
        enemiesRef.current = [...enemiesRef.current, enemy];
        setEnemies([...enemiesRef.current]);
      }
    }, spawnRate);
    return () => clearInterval(interval);
  }, [gameStarted, gameOver, wave, createEnemy]);

  useEffect(() => {
    if (enemies.length === 0 && score > 0 && !gameOver && gameStarted) {
      const timeout = setTimeout(() => setWave((w) => w + 1), 2500);
      return () => clearTimeout(timeout);
    }
  }, [enemies, score, gameOver, gameStarted]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      keys.current[key] = true;
      if (key === 'r') reload();
      if (key === 'q') triggerShockwave();
      if (key === ' ') shoot();
    };
    const handleKeyUp = (e) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    const handleMouseMove = (e) => {
      if (!gameStarted || gameOver) return;
      mouseMovement.current.x += e.movementX;
      mouseMovement.current.y += e.movementY;
    };
    const handleClick = () => {
      if (!gameStarted || gameOver) return;
      if (canvasRef.current) canvasRef.current.requestPointerLock();
      shoot();
    };
    const handlePointerLock = () => {
      if (!document.pointerLockElement && gameStarted && !gameOver) {
        setStatusMessage('Click to re-lock cursor');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    document.addEventListener('pointerlockchange', handlePointerLock);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      document.removeEventListener('pointerlockchange', handlePointerLock);
    };
  }, [gameStarted, gameOver, reload, shoot, triggerShockwave]);

  const startGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setHealth(100);
    setAmmo(BASE_AMMO);
    setWave(1);
    setAbilityCharge(0);
    setKillStreak(0);
    setStatusMessage('');
    enemiesRef.current = [];
    setEnemies([]);
    powerUpsRef.current = [];
    setPowerUps([]);
    bulletsRef.current = [];
    if (canvasRef.current) canvasRef.current.requestPointerLock();
  };

  const restart = () => {
    cleanupObjects();
    initScene();
    startGame();
  };

  return (
    <div className="game-root">
      <canvas ref={canvasRef} className="game-canvas" />

      {gameStarted && !gameOver && (
        <>
          <div className="hud hud-left">
            <div className="hud-panel health">
              <Heart size={24} />
              <span>{Math.floor(health)}%</span>
            </div>
            <div className="hud-panel score">
              <Target size={18} />
              <span>{score}</span>
            </div>
            <div className="hud-panel streak">
              <Zap size={18} />
              <span>{killStreak}x combo</span>
            </div>
          </div>

          <div className="hud hud-right">
            <div className="hud-panel wave">
              <div className="label">Wave</div>
              <div className="value">{wave}</div>
            </div>
            <div className="hud-panel ammo">
              <div className="label">Ammo</div>
              <div className={`value ${ammo < 8 ? 'danger' : ''}`}>
                {ammo}/{BASE_AMMO}
              </div>
              {isReloading && <div className="subtext">Reloading…</div>}
            </div>
            <div className="hud-panel ability">
              <div className="label with-icon">
                <Shield size={16} />
                <span>Shockwave</span>
              </div>
              <div className="ability-bar">
                <div className="ability-fill" style={{ width: `${abilityCharge}%` }} />
              </div>
              <div className="subtext">{abilityCharge === 100 ? 'Press Q' : 'Charging'}</div>
            </div>
          </div>

          <div className="crosshair">
            <Crosshair size={36} strokeWidth={3} />
          </div>

          {muzzleFlash && <div className="muzzle-flash" />}

          <div className="footer-panel">
            <p>WASD move • Shift sprint • Mouse/Space/Click shoot • R reload • Q shockwave</p>
          </div>

          {statusMessage && <div className="status-toast">{statusMessage}</div>}
        </>
      )}

      {!gameStarted && !gameOver && (
        <div className="overlay">
          <div className="card">
            <h1>🛡️ Dev Defender 3D</h1>
            <p>Corporate chaos is on its way—brace yourself.</p>
            <ul>
              <li>WASD to move, Shift to sprint</li>
              <li>Mouse / Space shoots, R reloads</li>
              <li>Collect power-ups for ammo, heals, shields</li>
              <li>Fill the Dev Shockwave meter and press Q</li>
            </ul>
            <button onClick={startGame}>Start Deployment</button>
          </div>
        </div>
      )}

      {gameOver && (
        <div className="overlay">
          <div className="card loss">
            <h2>Overwhelmed!</h2>
            <p>
              Score {score} • Wave {wave}
            </p>
            <button onClick={restart}>Run It Back</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DevDefender3D;
