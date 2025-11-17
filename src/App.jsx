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
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 0, 200);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 50, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x3a5f3a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

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
      
      const buildingGeo = new THREE.BoxGeometry(width, height, depth);
      const buildingMat = new THREE.MeshStandardMaterial({ 
        color: Math.random() > 0.5 ? 0x808080 : 0x696969 
      });
      const building = new THREE.Mesh(buildingGeo, buildingMat);
      building.position.set(pos[0], height / 2, pos[2]);
      building.castShadow = true;
      building.receiveShadow = true;
      scene.add(building);
    });

    // Weapon (gun model attached to camera)
    const weaponGroup = new THREE.Group();
    const barrelGeo = new THREE.BoxGeometry(0.05, 0.05, 0.5);
    const weaponMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const barrel = new THREE.Mesh(barrelGeo, weaponMat);
    barrel.position.set(0.15, -0.15, -0.3);
    
    const handleGeo = new THREE.BoxGeometry(0.08, 0.15, 0.1);
    const handle = new THREE.Mesh(handleGeo, weaponMat);
    handle.position.set(0.15, -0.25, -0.1);
    
    weaponGroup.add(barrel);
    weaponGroup.add(handle);
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

      // Weapon recoil recovery
      if (weaponGroupRef.current && weaponGroupRef.current.rotation.x < 0) {
        weaponGroupRef.current.rotation.x += 0.05;
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

    // Weapon recoil
    if (weaponGroupRef.current) {
      weaponGroupRef.current.rotation.x = -0.1;
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
