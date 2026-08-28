import * as THREE from "three";
import {
  PATH, // base paths for assets
  VRM_MODELS, // VRM models list and the default VRM model to load on startup
  MODEL_ACTIVATION_DELAY, // ms delay before enabling model visibility after load
  FOLLOW_SPEED, // mouse drag sensitivity and camera follow speed
  DEFAULT_MODEL_SETTINGS as DM, DEFAULT_SETTINGS as DS, // default model settings and default settings for the options in the settings menu
  CAMERA_SETTINGS, // camera settings for position and rotation
} from "@config/config.js";
import { 
  buildModelButtons, // Build settings menu and model selection buttons
  inputTextPlaceholder
} from "./utils.js";
import { EVENTS, eventListeners } from "./events.js";
import {
  initThree,
  look_at_target,
  scene, camera, renderer, clock, mixer,
  VRM, loadVRM, playVRMA,
  updateEyeTracking,
  head_tag_el,
  showHeadTag,
  showExpressionForDuration
} from "./vrm.js";
import {
  updateLipSync // update lip sync based on audio
} from "./audio.js";
import { createBoneColliders, debugTouchBoneCoverage } from "./bone_touch.js";
let ws_con = true;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const head_pos = new THREE.Vector3();
const desired_pos = new THREE.Vector3();

const inputEl = document.getElementById("user_prompt");

let background_color = 0x222222;
export let ws;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const degToRad = (d) => d * (Math.PI / 180);
const bone = (name) => VRM.vrm?.humanoid?.getNormalizedBoneNode(name);

document.addEventListener("pointerdown", () => { once: true });

// loadModel wraps vrm.js's loadVRM with main.js-specific post-load work
// (eye-tracking activation delay, legacy sphere-collider touch system) that
// depends on state owned here, not in vrm.js.
let colliders;

function onModelLoaded() {
  if (EVENTS.touch_old) {
    colliders = createBoneColliders(VRM.vrm, { debug: false });
    //debugTouchBoneCoverage(VRM.vrm);
  }
}
export function loadModel(model_path) {
  document.getElementById('loading_spinner').classList.add('show');
  if (VRM.vrm) VRM.vrm.scene.visible = false;
  loadVRM(model_path, (vrm) => {
    onModelLoaded(vrm);
    // defer showing model until next frame to avoid T-pose snap
    requestAnimationFrame(() => {
      if (VRM.vrm) VRM.vrm.scene.visible = true;
      document.getElementById('loading_spinner').classList.remove('show');
    });
  });
}

function init() {
  // scene/camera/renderer/clock are imported bindings owned by vrm.js —
  // build them locally, then hand them to vrm.js via initThree() rather
  // than assigning the imports directly (which throws).
  const _scene = new THREE.Scene();
  _scene.background = new THREE.Color(background_color);
  _scene.add(look_at_target);

  const _camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 100);
  _camera.position.set(0, 1.3, 2);

  const _renderer = new THREE.WebGLRenderer({ antialias: true });
  _renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(_renderer.domElement);

  _scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(1, 2, 1);
  _scene.add(dir);

  const _clock = new THREE.Timer();
  
  initThree(_scene, _camera, _renderer, _clock);

  eventListeners(camera, () => colliders, renderer, raycaster);
  buildModelButtons(VRM_MODELS, loadModel, DS);
  loadModel(DM.VRM_DEFAULT_MODEL);
  function WSCommandHandler(event) {
    const [cmd, ...rest] = event.data.split(":");
    const arg = rest.join(":");
      if (cmd === "llm_response") console.log("LLM Response:", arg);
      if (cmd === "stt_result") {
        inputTextPlaceholder(inputEl, "Send a message");
        inputEl.value = arg;
      }
      if (cmd === "tts_audio") showHeadTag(arg, "TTS");
      if (cmd === "no_tts_audio") showHeadTag(arg, "Effect");
      if (cmd === "model") loadModel(VRM_MODELS[arg]);
      if (cmd === "animation" && arg !== "reset") {
        playVRMA(`${PATH.VRMA_BASE}${arg}.vrma`);
      }
      else if (cmd === "animation" && arg === "reset") {
        VRM.vrma_action?.stop();
        VRM.vrma_action?.reset();
        playVRMA(DM.VRMA_IDLE, true);
      }
      if (cmd === "expression" && VRM.vrm?.expressionManager) {
        let args = arg.split(":");
        let name = args[0]
        let value = parseFloat(args[1])
        let duration = parseInt(args[2])
        // Reset all expressions to 0 before setting the new expression to avoid conflicts
        Object.keys(VRM.vrm.expressionManager.expressionMap).forEach((name) =>
          VRM.vrm.expressionManager.setValue(name, 0)
        );
        showExpressionForDuration(VRM.vrm, name, value, duration); // Animate the expression to the target value over the specified duration
      }
    };
  function connectWS() {
    ws = new WebSocket("ws://localhost:8766");
    ws.onopen = () => setWsStatus("connected");
    ws.onclose = () => {
      setWsStatus("not_connected");
      setTimeout(connectWS, 1000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (data) => WSCommandHandler(data); // Handle incoming WebSocket messages
  }
  if (ws_con) {
    connectWS();
  }
  window.addEventListener("thinking", () => {
    showHeadTag("Nika is thinking...");
    playVRMA(DM.VRMA_THINKING, false);
  });
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

let tracking_startup_time = 0;
let first_show_head_tag = true;
function animate() {
  requestAnimationFrame(animate);
  clock.update();
  const STARTUP_ELAPSED = performance.now() - tracking_startup_time;
  const dt = clock.getDelta();

  if (VRM.vrm) {
    if (VRM.vrm_loaded && !VRM.vrm.scene.visible && STARTUP_ELAPSED > MODEL_ACTIVATION_DELAY) {
      // make the model visible after it's loaded
      if (first_show_head_tag) {
        showHeadTag("Hi, i'm Nika!");
        first_show_head_tag = false;
      }
      VRM.vrm.scene.visible = true;
    }

    // Update camera position to follow the model's head
    const head = bone("head");
    const NORMALIZED_FOLLOW_SPEED = 1 - Math.pow(1 - FOLLOW_SPEED, dt * 60); // normalize to ~60fps baseline
    if (head) head.getWorldPosition(head_pos);

    const theta = degToRad(CAMERA_SETTINGS.rot_y), phi = degToRad(CAMERA_SETTINGS.rot_x);
    desired_pos.set(
      head_pos.x + CAMERA_SETTINGS.zoom * Math.cos(theta) * Math.cos(phi),
      head_pos.y + CAMERA_SETTINGS.zoom * Math.sin(phi),
      head_pos.z + CAMERA_SETTINGS.zoom * Math.sin(theta) * Math.cos(phi)
    );
    camera.position.lerp(desired_pos, NORMALIZED_FOLLOW_SPEED);
    camera.lookAt(head_pos);


    updateEyeTracking(dt); // update eye tracking based on mouse position and typing state
    updateLipSync(VRM.vrm,dt); // update lip sync based on audio input

    if (head_tag_el?.style.display !== "none" && head) {
      // Update the position of the head tag element to follow the model's head in screen space
      const p = head_pos.clone().project(camera);
      head_tag_el.style.left = `${(p.x * 0.5 + 0.5) * window.innerWidth + 60}px`;
      head_tag_el.style.top = `${(-p.y * 0.5 + 0.5) * window.innerHeight - 40}px`;
    }

    VRM.vrm.update(dt);
  }

  mixer?.update(dt);
  renderer.render(scene, camera);
}
init();
animate();