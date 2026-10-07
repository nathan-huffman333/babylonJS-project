import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  VertexBuffer,
} from "@babylonjs/core";

import {
  AdvancedDynamicTexture,
  Rectangle,
  Ellipse,
  TextBlock,
  Button,
  Control
} from "@babylonjs/gui";

import "./style.css";

// =====================================================
// CONFIGURATION VARIABLES
// =====================================================
// Variables to control initial, end, and adding asteroid speeds
const BASE_ASTEROID_SPEED = 5.0; 
const MAX_ASTEROID_SPEED = 6.5;
const ASTEROID_SPEED_INCREASE = 0.03;
// Number of starting asteroids.
const ASTEROID_COUNT = 20;
const ASTEROID_SPLIT_FACTOR = 0.5;
const COLLISION_SOLVER_ITERATIONS = 4;

const PLAYER_COLLISION_RADIUS = 1.25;
// Don't spawn asteroids too close to the center.
const MIN_SPAWN_DISTANCE = PLAYER_COLLISION_RADIUS + 11.5;

const BULLET_SPEED = 80;
const BULLET_LIFETIME = 2.0;
const BULLET_FADE_TIME = 0.25;

const PLAYER_MAX_HEALTH = 100;
const ASTEROID_DAMAGE = 25;
const PLAYER_DAMAGE_COOLDOWN = 1.0;
let playerDamageCooldown = 0;
let playerHealth = PLAYER_MAX_HEALTH;
let gameOver = false;
let victory = false;

// =====================================================
// SCENE SETUP
// =====================================================
const canvas = document.getElementById("renderCanvas");

const engine = new Engine(canvas, true);
const scene = new Scene(engine);

// =====================================================
// BOUNDARY
// =====================================================
const BOUNDARY_RADIUS = 20; 
const BOUNDARY_MESH_DIAMETER = BOUNDARY_RADIUS * 2;

// =====================================================
// ASTEROID MANAGEMENT
// =====================================================
const asteroids = [];
class Asteroid {
    mesh;
    radius;
    position;
    velocity;
    sizeLevel;

    constructor(mesh, radius, position, velocity, sizeLevel = 0) {
        this.mesh = mesh;
        this.radius = radius;
        this.position = position.clone();
        this.velocity = velocity.clone();
        this.sizeLevel = sizeLevel;

        this.mesh.position.copyFrom(this.position);
    }


    increaseSpeed(amount) {
        const speed = this.velocity.length();

        if (speed < 0.00001) {
            return;
        }

        const newSpeed = Math.min(speed * (1 + amount), MAX_ASTEROID_SPEED);

        this.velocity.normalize().scaleInPlace(newSpeed);
    }
    
    // Updates position and returns the new position
    updatePosition(deltaTime) {
        const previousPosition = this.position.clone();

        this.position.addInPlace(this.velocity.scale(deltaTime));

        this.mesh.position.copyFrom(this.position);

        return previousPosition;
    }
        
    // Handles collision response with another asteroid
    static handleAsteroidCollision(a1, a2) {
        const delta = a2.position.subtract(a1.position);
        const distance = delta.length();
            
        const minimumDistance = a1.radius + a2.radius;

        // No collision
        if (distance >= minimumDistance) {
            return;
        }

        // Avoid division by zero if two asteroids occupy exactly the same position
        let normal;

        if (distance > 0.00001) {
            normal = delta.scale(1 / distance);
        } else {
            // Random fallback direction
            normal = new Vector3(1, 0, 0);
        }


        // -------------------------------------------------
        // Separate the asteroids
        // -------------------------------------------------
        const penetration = minimumDistance - distance;

        // Equal masses -> move each asteroid half the penetration
        const correction = normal.scale(penetration * 0.5);

        a1.position.subtractInPlace(correction);
        a2.position.addInPlace(correction);

        a1.mesh.position.copyFrom(a1.position);
        a2.mesh.position.copyFrom(a2.position);

        // -------------------------------------------------
        // 2. Calculate relative velocity
        // -------------------------------------------------
        const relativeVelocity = a2.velocity.subtract(a1.velocity);

        // Velocity along collision normal
        const velocityAlongNormal = relativeVelocity.dot(normal);

        // Already moving apart
        if (velocityAlongNormal > 0) {
            return;
        }

        // -------------------------------------------------
        // 3. Elastic collision
        // -------------------------------------------------
        const restitution = 0.9;

        // Equal masses
        const impulseMagnitude = -(1 + restitution) * velocityAlongNormal / 2;

        const impulse = normal.scale(impulseMagnitude);

        a1.velocity.subtractInPlace(impulse);
        a2.velocity.addInPlace(impulse);

        const COLLISION_SPEED_INCREASE = 0.03;
        
        a1.velocity.scaleInPlace(1 + COLLISION_SPEED_INCREASE);
        a2.velocity.scaleInPlace(1 + COLLISION_SPEED_INCREASE);
    }
        
    // Handles collision response with the boundary sphere
    handleBoundaryCollision(boundaryRadius, speedIncrease) {
        const distance = this.position.length();
            
        const maximumCenterDistance = boundaryRadius - this.radius;

        if (distance <= maximumCenterDistance) {
            return;
        }

        // Normal pointing from center toward asteroid
        let normal;

        if (distance > 0.00001) {
            normal = this.position.scale(1 / distance);
        } else {
            normal = new Vector3(1, 0, 0);
        }

        // -------------------------------------------------
        // Put asteroid exactly back inside sphere
        // -------------------------------------------------
        this.position.copyFrom(normal.scale(maximumCenterDistance));

        this.mesh.position.copyFrom(this.position);

        // -------------------------------------------------
        // Determine if we're moving toward the wall
        // -------------------------------------------------

        const velocityAlongNormal = this.velocity.dot(normal);

        if (velocityAlongNormal <= 0) {
            return;
        }
            // Reflect velocity
            this.velocity.subtractInPlace(
                normal.scale(2 * velocityAlongNormal)
            );

            this.increaseSpeed(speedIncrease);
    }


    resolveCenterCollision(centerRadius, speedIncrease, normal) {
        const minimumDistance = centerRadius + this.radius;

        // Put asteroid exactly outside the player's collision sphere.
        this.position.copyFrom(normal.scale(minimumDistance));

        this.mesh.position.copyFrom(this.position);

        // Velocity toward the center?
        const velocityTowardCenter = this.velocity.dot(normal);

        if (velocityTowardCenter >= 0) {
            return;
        }

        // Reflect velocity.
        this.velocity.subtractInPlace(normal.scale(2 * velocityTowardCenter));

        // Increase speed after hitting player.
        this.increaseSpeed(speedIncrease);
    }


    handleCenterCollision(centerRadius, speedIncrease, previousPosition) {
        const collisionRadius = centerRadius + this.radius;

        if (!previousPosition) {
            const distance = this.position.length();
            const collisionRadius = centerRadius + this.radius;

            if (distance >= collisionRadius) {
                return;
            }

            let normal;

            if (distance > 0.00001) {
                normal = this.position.normalize();
            } else {
                normal = new Vector3(1, 0, 0);
            }

            this.resolveCenterCollision(centerRadius, speedIncrease, normal);

            return;
        }

        const movement = this.position.subtract(previousPosition);
        const movementLengthSquared = movement.lengthSquared();

        // -------------------------------------------------
        // Very little movement
        // -------------------------------------------------

        if (movementLengthSquared < 0.000001) {
            const distance = this.position.length();

            if (distance >= collisionRadius) {
                return;
            }

            let normal;

            if (distance > 0.00001) {
                normal = this.position.normalize();
            } else {
                normal = new Vector3(1, 0, 0);
            }

            this.resolveCenterCollision(centerRadius, speedIncrease, normal);

            return;
        }

        // -------------------------------------------------
        // Find closest point on movement segment to center
        // -------------------------------------------------

        const t = -previousPosition.dot(movement) / movementLengthSquared;

        const clampedT = Math.max(0, Math.min(1, t));

        const closestPoint = previousPosition.add(movement.scale(clampedT));

        const closestDistance = closestPoint.length();

        // No intersection.
        if (closestDistance >= collisionRadius) {
            return;
        }

        // -------------------------------------------------
        // We crossed the player's collision sphere.
        // Use the closest point to determine the bounce normal.
        // -------------------------------------------------

        let normal;

        if (closestDistance > 0.00001) {
            normal = closestPoint.clone().normalize();
        } else if (previousPosition.length() > 0.00001) {
            normal = previousPosition.clone().normalize();
        } else {
            normal = new Vector3(1, 0, 0);
        }

        this.resolveCenterCollision(centerRadius, speedIncrease, normal);

        return true;
    }


    checkPlayerCollision(playerRadius) {
        const collisionDistance = this.radius + playerRadius;

        if (this.position.lengthSquared() <= collisionDistance * collisionDistance) {
            return true;
        }

        return false;
    }
}

// Function to generate asteroids
function generateAsteroids(count) {
    for (let i = 0; i < count; i++) {

        // Random size type
        const sizeRoll = Math.random();

        let sizeLevel;
        let radius;
        let subdivisions;

        if (sizeRoll < 0.20) {
            sizeLevel = 0; // 20% large
            radius = 3.0;
            subdivisions = 3;
        } else if (sizeRoll < 0.55) {
            sizeLevel = 1; // 35% medium
            radius = 2.0;
            subdivisions = 2;
        } else {
            sizeLevel = 2; // 45% small
            radius = 1.0;
            subdivisions = 1;
        }

        // Find a valid spawn position

        let position;
        let isValidPosition = false;

        // Try up to 1000 times to find a valid location
        for (let attempt = 0; attempt < 1000; attempt++) {

            // Keep asteroid fully inside the sphere
            const maxSpawnRadius = BOUNDARY_RADIUS - radius - 1;

            // Uniform random point inside sphere
            const r = maxSpawnRadius * Math.cbrt(Math.random());

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            const candidate = new Vector3(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.sin(phi) * Math.sin(theta),
                r * Math.cos(phi)
            );

            if (candidate.length() < MIN_SPAWN_DISTANCE) {
                continue;
            }

            
            // Don't spawn too close to the center

            isValidPosition = true;

            for (const other of asteroids) {
                const distance = Vector3.Distance(candidate, other.position);

                const requiredDistance = radius + other.radius + 0.5;

                if (distance < requiredDistance) {
                    isValidPosition = false;
                    break;
                }
            }

            if (isValidPosition) {
              position = candidate;
              break;
            }
        }

        if (!position) {
            console.warn(`Could not find a spawn position for asteroid ${i}`);
            continue;
        }

        // Random velocity
           
        const direction = new Vector3(
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() * 2 - 1
        );

        if (direction.lengthSquared() < 0.00001) {
            direction.set(1, 0, 0);
        }

        direction.normalize();

        const speed = BASE_ASTEROID_SPEED + Math.random() * 0.01;
        const velocity = direction.scale(speed);

        // Mesh

        const mesh = MeshBuilder.CreateIcoSphere(`asteroid_${i}`,
            {
            radius: radius,
            subdivisions: subdivisions,
            },
            scene
        );

        deformAsteroid(mesh, radius, 0.35);

        const material = new StandardMaterial(`asteroidMat_${i}`, scene);

        const rockColor = 0.25 + Math.random() * 0.25;

        material.diffuseColor = new Color3(rockColor * 1.1, rockColor, rockColor * 0.9);

        material.specularColor = new Color3(0.05, 0.05, 0.05);

        mesh.material = material;

        // ---------------------------------------------
        // Asteroid
        // ---------------------------------------------

        const asteroid = new Asteroid(
            mesh,
            radius,
            position,
            velocity,
            sizeLevel
        );

        asteroids.push(asteroid);
    }
}


function deformAsteroid(mesh, radius, amount = 0.35) {
    const positions = mesh.getVerticesData(
        VertexBuffer.PositionKind
    );

    if (!positions) {
        return;
    }

    for (let i = 0; i < positions.length; i += 3) {
        const direction = new Vector3(
            positions[i],
            positions[i + 1],
            positions[i + 2]
        ).normalize();

        const variation = 1 + (Math.random() * 2 - 1) * amount;

        positions[i] = direction.x * radius * variation;

        positions[i + 1] = direction.y * radius * variation;

        positions[i + 2] = direction.z * radius * variation;
    }

    mesh.updateVerticesData(
        VertexBuffer.PositionKind,
        positions
    );

    mesh.refreshBoundingInfo();
}

generateAsteroids(ASTEROID_COUNT);


const bullets = [];

class Bullet {
    mesh;
    position;
    velocity;
    lifetime;
    fading;
    fadeTimer;
    material;

    constructor(position, direction) {
        this.position = position.clone();
        this.velocity = direction.normalize().scale(BULLET_SPEED);
        this.lifetime = BULLET_LIFETIME;

        this.fading = false;
        this.fadeTimer = 0;

        this.mesh = MeshBuilder.CreateSphere(
            "bullet",
            {
                diameter: 0.6,
                segments: 8
            },
            scene
        );

          this.material = new StandardMaterial(
            "bulletMaterial",
            scene
        );

        this.material.diffuseColor = new Color3(1, 0, 0);

        this.material.alpha = 1.0;

        this.mesh.material = this.material;
        this.mesh.position.copyFrom(this.position);
    }

    update(deltaTime) {
        this.position.addInPlace(this.velocity.scale(deltaTime));

        this.mesh.position.copyFrom(this.position);

        const distanceFromCenter = this.position.length();

        if (!this.fading && distanceFromCenter > BOUNDARY_RADIUS) {
            this.fading = true;
            this.fadeTimer = 0;
        }

        if (this.fading) {
            this.fadeTimer += deltaTime;

            const fadeProgress = this.fadeTimer / BULLET_FADE_TIME;

            this.material.alpha = Math.max(0, 1 - fadeProgress);

            // Delete after fade finishes
            if (this.fadeTimer >= BULLET_FADE_TIME) {
                return false;
            }
        }

        this.lifetime -= deltaTime;

        return this.lifetime > 0;
    }

    destroy() {
        this.mesh.dispose();
    }
}


function shoot() {
    if (gameOver || victory) {
        return;
    }
    // Get the center of the screen
    const screenX = engine.getRenderWidth() / 2;
    const screenY = engine.getRenderHeight() / 2;

    const ray = scene.createPickingRay(
        screenX,
        screenY,
        null,
        camera
    );

    const direction = ray.direction.normalize();

    const bulletStart = camera.position.add(direction.scale(1));

    const bullet = new Bullet(
        bulletStart,
        direction
    );

    bullets.push(bullet);
}


function splitAsteroid(asteroid) {
    const index = asteroids.indexOf(asteroid);

    if (index === -1) {
        return;
    }

    // Remove the old asteroid
    asteroid.mesh.dispose();
    
    asteroids.splice(index, 1);

    // Small asteroids simply disappear
    if (asteroid.sizeLevel >= 2) {
        return;
    }

    const newSizeLevel = asteroid.sizeLevel + 1;
    const newRadius = asteroid.radius * ASTEROID_SPLIT_FACTOR;

    let subdivisions;

    if (newSizeLevel === 1) {
        subdivisions = 2;
    } else {
        subdivisions = 1;
    }

    for (let i = 0; i < 2; i++) {
        // Create two different directions
        const direction = new Vector3(
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() * 2 - 1
        );

        if (direction.lengthSquared() < 0.00001) {
            direction.set(1, 0, 0);
        }

        direction.normalize();

        // Give the new asteroid some speed
        const speed = BASE_ASTEROID_SPEED + Math.random() * 3;

        const velocity = direction.scale(speed);

        const mesh = MeshBuilder.CreateIcoSphere(
            `asteroid_split_${Date.now()}_${i}`,
            {radius: newRadius, subdivisions: subdivisions,},
            scene
        );

        deformAsteroid(mesh, newRadius, 0.35);

        const material = new StandardMaterial(`asteroidSplitMat_${Date.now()}_${i}`, scene);

        const rockColor = 0.25 + Math.random() * 0.25;

        material.diffuseColor = new Color3(rockColor * 1.1, rockColor, rockColor * 0.9);

        material.specularColor = new Color3(0.05, 0.05, 0.05);

        mesh.material = material;

        const spawnPosition = asteroid.position.add(
            direction.scale(newRadius)
        );

        const newAsteroid = new Asteroid(
            mesh,
            newRadius,
            spawnPosition,
            velocity,
            asteroid.sizeLevel + 1
        );

        asteroids.push(newAsteroid);
    }
}


function damagePlayer(amount) {
    playerHealth -= amount;
    playerHealth = Math.max(0, playerHealth);

    healthText.text = `HEALTH: ${playerHealth}/${PLAYER_MAX_HEALTH}`;

    if (playerHealth <= 0) {
        playerDied();
    }
}


function playerDied() {
    if (gameOver) {
        return;
    }

    gameOver = true;

    // Show game-over screen
    gameOverBackground.isVisible = true;
    gameOverText.isVisible = true;
    restartButton.isVisible = true;

    if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
    }
}


function playerWon() {
    if (victory || gameOver) {
        return;
    }

    victory = true;

    // Show victory screen
    victoryBackground.isVisible = true;
    victoryText.isVisible = true;
    restartButton.isVisible = true;

    // Release mouse so the restart button can be clicked
    if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
    }
}


function restartGame() {
    // Reset game state
    gameOver = false;
    victory = false;
    playerHealth = PLAYER_MAX_HEALTH;
    playerDamageCooldown = 0;

    // Update health display
    healthText.text = `Health: ${playerHealth}/${PLAYER_MAX_HEALTH}`;

    // Remove all asteroids
    for (const asteroid of asteroids) {
        asteroid.mesh.dispose();
    }

    asteroids.length = 0;

    // Remove all bullets
    for (const bullet of bullets) {
        bullet.destroy();
    }

    bullets.length = 0;

    // Create new asteroids
    generateAsteroids(ASTEROID_COUNT);

    // Hide game-over screen
    gameOverBackground.isVisible = false;
    gameOverText.isVisible = false;
    
    victoryBackground.isVisible = false;
    victoryText.isVisible = false;

    restartButton.isVisible = false;
}


// =====================================================
// Camera Setup
// =====================================================

const camera = new ArcRotateCamera(
  "camera",
  Math.PI / 2,
  Math.PI / 3,
  0,
  Vector3.Zero(),
  scene
);

// =====================================================
// Mouse Look
// =====================================================

const mouseSensitivity = 0.002;

document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
        return;
    }

    if (gameOver || victory) {
        return;
    }

    if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
    }

    shoot();
});

canvas.addEventListener("mousemove", (event) => {
    // Only move camera when pointer is locked
    if (document.pointerLockElement !== canvas) {
        return;
    }

    camera.alpha -= event.movementX * mouseSensitivity;
    camera.beta -= event.movementY * mouseSensitivity;

    // Prevent looking completely upside down
    camera.beta = Math.max(0.1, Math.min(Math.PI - 0.1, camera.beta));
});

// =====================================================
// Light
// =====================================================


const light = new HemisphericLight(
    "light",
    new Vector3(0, 1, 0),
    scene
);

// =====================================================
// Wireframe sphere around player
// =====================================================

const sphere = MeshBuilder.CreateSphere(
    "playerSphere",
    {
        diameter: BOUNDARY_MESH_DIAMETER,
        segments: 160
    },
    scene
);

// Put sphere at the player's position
sphere.position = Vector3.Zero();

// Wireframe material
const sphereMaterial = new StandardMaterial("sphereMaterial", scene);
sphereMaterial.wireframe = true;
sphereMaterial.diffuseColor = new Color3(1, 1, 1); // white

sphere.material = sphereMaterial;

// =====================================================
// Crosshair GUI
// =====================================================

const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

// Circle
const circle = new Ellipse();
circle.width = "80px";
circle.height = "80px";
circle.color = "red";
circle.thickness = 5;
circle.background = "transparent";

// Horizontal line
const horizontal = new Rectangle();
horizontal.width = "78px";
horizontal.height = "4px";
horizontal.background = "red";
horizontal.thickness = 0;

// Vertical line
const vertical = new Rectangle();
vertical.width = "4px";
vertical.height = "78px";
vertical.background = "red";
vertical.thickness = 0;

// Add everything to the GUI
gui.addControl(circle);
gui.addControl(horizontal);
gui.addControl(vertical);

// =====================================================
// Health GUI
// =====================================================

const healthText = new TextBlock();

healthText.text = `Health: ${playerHealth}/${PLAYER_MAX_HEALTH}`;
healthText.color = "red";
healthText.fontSize = 24;

healthText.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_LEFT;

healthText.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_TOP;

healthText.left = "20px";
healthText.top = "20px";

gui.addControl(healthText);

// =====================================================
// Game Over GUI
// =====================================================
const gameOverBackground = new Rectangle();

gameOverBackground.width = "100%";
gameOverBackground.height = "100%";
gameOverBackground.background = "black";
gameOverBackground.alpha = 0.7;
gameOverBackground.thickness = 0;
gameOverBackground.isVisible = false;

gui.addControl(gameOverBackground);

const gameOverText = new TextBlock();

gameOverText.text = "GAME OVER";
gameOverText.color = "red";
gameOverText.fontSize = 80;
gameOverText.fontWeight = "bold";

gameOverText.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_CENTER;

gameOverText.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_CENTER;

gameOverText.isVisible = false;

gui.addControl(gameOverText);

// =====================================================
// Victory GUI
// =====================================================
const victoryBackground = new Rectangle();

victoryBackground.width = "100%";
victoryBackground.height = "100%";
victoryBackground.background = "black";
victoryBackground.alpha = 0.7;
victoryBackground.thickness = 0;
victoryBackground.isVisible = false;

gui.addControl(victoryBackground);

const victoryText = new TextBlock();

victoryText.text = "VICTORY!";
victoryText.color = "white";
victoryText.fontSize = 80;
victoryText.fontWeight = "bold";

victoryText.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_CENTER;

victoryText.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_CENTER;

victoryText.isVisible = false;

gui.addControl(victoryText);

// =====================================================
// Restart Button
// =====================================================

const restartButton = Button.CreateSimpleButton(
    "restartButton",
    "RESTART"
);

restartButton.width = "200px";
restartButton.height = "60px";

restartButton.color = "white";
restartButton.background = "red";

restartButton.cornerRadius = 10;
restartButton.fontSize = 24;

restartButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;

restartButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;

restartButton.top = "100px";

restartButton.isVisible = false;

gui.addControl(restartButton);

restartButton.onPointerUpObservable.add(() => {
    restartGame();
});

// =====================================================
// Game Loop (Physics Update)
// =====================================================
engine.runRenderLoop(() => {
    const deltaTime = engine.getDeltaTime() / 1000;
    const clampedDeltaTime = Math.min(deltaTime, 0.033);

    if (gameOver) {
        scene.render();
        return;
    }

    if (victory) {
        scene.render();
        return;
    }

    playerDamageCooldown -= clampedDeltaTime;

    // Move asteroids
    const previousPositions = new Map();

    for (const asteroid of asteroids) {
        const previousPosition = asteroid.updatePosition(clampedDeltaTime);

        previousPositions.set(asteroid, previousPosition);
    }

    // Check + damage player
    for (const asteroid of asteroids) {
        const hitPlayer = asteroid.handleCenterCollision(
            PLAYER_COLLISION_RADIUS,
            ASTEROID_SPEED_INCREASE,
            previousPositions.get(asteroid)
        );

        if (hitPlayer && playerDamageCooldown <= 0) {
            damagePlayer(ASTEROID_DAMAGE);
            playerDamageCooldown = PLAYER_DAMAGE_COOLDOWN;
        }
    }

    // Outer Boundary collisions
    for (const asteroid of asteroids) {
        asteroid.handleBoundaryCollision(BOUNDARY_RADIUS, ASTEROID_SPEED_INCREASE);
    }

    // Asteroid-asteroid collisions
    for (let iteration = 0; iteration < COLLISION_SOLVER_ITERATIONS; iteration++) {
        for (let i = 0; i < asteroids.length; i++) {
            for (let j = i + 1; j < asteroids.length; j++) {
                Asteroid.handleAsteroidCollision(asteroids[i], asteroids[j]);
            }
        }

        // Re-check the outer boundary after
        for (const asteroid of asteroids) {
            asteroid.handleBoundaryCollision(BOUNDARY_RADIUS, 0);
        }

    }

    for (let i = bullets.length - 1; i >= 0; i--) {

    const bullet = bullets[i];

    const alive = bullet.update(clampedDeltaTime);

    if (!alive) {
        bullet.destroy();
        bullets.splice(i, 1);
        continue;
    }

    // Check this bullet against every asteroid
    for (let j = asteroids.length - 1; j >= 0; j--) {

        const asteroid = asteroids[j];

        const distance = Vector3.Distance(
            bullet.position,
            asteroid.position
        );

        if (distance < asteroid.radius + 0.15) {
            // Remove bullet
            bullet.destroy();
            bullets.splice(i, 1);

            // Split asteroid
            splitAsteroid(asteroid);

            // If there are no asteroids left, the player wins
            if (asteroids.length === 0) {
                playerWon();
            }

            break;
        }
    }
}


    // Render
    scene.render();
});


window.addEventListener("resize", () => {
  engine.resize();
});