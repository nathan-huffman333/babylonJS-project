import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3
} from "@babylonjs/core";

import {
  AdvancedDynamicTexture,
  Rectangle,
  Ellipse
} from "@babylonjs/gui";

import "./style.css";


const canvas = document.getElementById("renderCanvas");
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

// =====================================================
// Camera
// =====================================================

const camera = new ArcRotateCamera(
  "camera",
  Math.PI / 2,
  Math.PI / 3,
  10,
  Vector3.Zero(),
  scene
);

// =====================================================
// Mouse Look
// =====================================================

const mouseSensitivity = 0.002;

canvas.addEventListener("click", () => {
  canvas.requestPointerLock();
});

canvas.addEventListener("mousemove", (event) => {
  // Only move camera when pointer is locked
  if (document.pointerLockElement !== canvas) {
    return;
  }

  camera.alpha -= event.movementX * mouseSensitivity;
  camera.beta -= event.movementY * mouseSensitivity;

  // Prevent looking completely upside down
  camera.beta = Math.max(
    0.1,
    Math.min(Math.PI - 0.1, camera.beta)
  );
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
    diameter: 20,
    segments: 32
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
// Crosshair
// =====================================================

const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

// Circle
const circle = new Ellipse();
circle.width = "40px";
circle.height = "40px";
circle.color = "red";
circle.thickness = 3;
circle.background = "transparent";

// Horizontal line
const horizontal = new Rectangle();
horizontal.width = "38px";
horizontal.height = "3px";
horizontal.background = "red";
horizontal.thickness = 0;

// Vertical line
const vertical = new Rectangle();
vertical.width = "3px";
vertical.height = "38px";
vertical.background = "red";
vertical.thickness = 0;

// Add everything to the GUI
gui.addControl(circle);
gui.addControl(horizontal);
gui.addControl(vertical);


engine.runRenderLoop(() => {
  scene.render();
});


window.addEventListener("resize", () => {
  engine.resize();
});