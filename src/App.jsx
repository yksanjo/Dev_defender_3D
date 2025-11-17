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
    enemiesRef.current = [];
    powerUpsRef.current = [];
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
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.Fog(0x0f172a, 10, 160);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 6);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.8);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(40, 50, 20);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    scene.add(dir);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshPhongMaterial({ color: 0x1e293b, shininess: 12 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    for (let x = -60; x <= 60; x += 6) {
      for (let z = -60; z <= 60; z += 6) {
        const tile = new THREE.Mesh(
          new THREE.PlaneGeometry(5.8, 5.8),
          new THREE.MeshBasicMaterial({ color: (x + z) % 12 === 0 ? 0x1e40af : 0x0f172a }),
        );
        tile.rotation.x = -Math.PI / 2;
        tile.position.set(x, 0.01, z);
        scene.add(tile);
      }
    }

    const cubeGeo = new THREE.BoxGeometry(3, 2, 3);
    const cubeMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.1, roughness: 0.8 });
    for (let i = 0; i < 20; i++) {
      const cube = new THREE.Mesh(cubeGeo, cubeMat);
      cube.position.set(Math.random() * 100 - 50, 1, Math.random() * 100 - 50);
      cube.castShadow = true;
      scene.add(cube);
    }

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

      const moveSpeed = keys.current['shift'] ? 0.35 : 0.22;
      if (keys.current['w']) cameraRef.current.position.add(forward.clone().multiplyScalar(moveSpeed));
      if (keys.current['s']) cameraRef.current.position.add(forward.clone().multiplyScalar(-moveSpeed));
      if (keys.current['a']) cameraRef.current.position.add(right.clone().multiplyScalar(-moveSpeed));
      if (keys.current['d']) cameraRef.current.position.add(right.clone().multiplyScalar(moveSpeed));

      enemiesRef.current.forEach((enemy, index) => {
        if (!enemy.mesh) return;
        const dirToPlayer = cameraRef.current.position.clone().sub(enemy.mesh.position);
        const distance = dirToPlayer.length();
        dirToPlayer.normalize();
        enemy.mesh.position.add(dirToPlayer.multiplyScalar(enemy.speed * delta * (1 + wave * 0.05)));
        enemy.mesh.lookAt(cameraRef.current.position);

        if (distance < 1.8) {
          setHealth((h) => {
            const next = Math.max(0, h - enemy.damage);
            if (next <= 0) setGameOver(true);
            return next;
          });
          sceneRef.current.remove(enemy.mesh);
          enemiesRef.current.splice(index, 1);
          setEnemies([...enemiesRef.current]);
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

      const time = Date.now() * 0.00008;
      const hue = (Math.sin(time) + 1) / 2;
      scene.background.setHSL(0.58, 0.4, 0.15 + hue * 0.25);
      scene.fog.color.copy(scene.background);

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
    const distance = 30 + Math.random() * 35;
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2.2, 0.8),
      new THREE.MeshStandardMaterial({ color: blueprint.color, roughness: 0.6 }),
    );
    body.position.y = 1.2;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 18, 18),
      new THREE.MeshStandardMaterial({ color: 0xffddb3 }),
    );
    head.position.y = 2.4;
    head.castShadow = true;
    group.add(head);

    const visor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.26, 0.12, 16),
      new THREE.MeshBasicMaterial({ color: 0x0ea5e9 }),
    );
    visor.rotation.x = Math.PI / 2;
    visor.position.set(0, 2.4, 0.35);
    group.add(visor);

    group.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
    sceneRef.current.add(group);

    return {
      id: crypto.randomUUID(),
      type,
      mesh: group,
      health: blueprint.health * (1 + wave * 0.05),
      speed: blueprint.speed,
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
    if (ammo <= 0 || isReloading || !cameraRef.current) return;
    setAmmo((a) => a - 1);
    setMuzzleFlash(true);
    setTimeout(() => setMuzzleFlash(false), 90);

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
