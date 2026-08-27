import * as THREE from "three";
import {
  PATH, // base paths for assets
  VRM_MODELS, // VRM models list and the default VRM model to load on startup
  MODEL_ACTIVATION_DELAY, // ms delay before enabling model visibility after load
  FOLLOW_SPEED, // mouse drag sensitivity and camera follow speed
  DEFAULT_MODEL_SETTINGS as DM, DEFAULT_SETTINGS as DS, // default model settings and default settings for the options in the settings menu
  REACTION_MESSAGES, HAIR_TOUCH_BONES, FACE_TOUCH_BONES, // reaction messages and touch bones for hair and face
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
  setExpression,
  showExpressionForDuration
} from "./vrm.js";
import {
  updateLipSync // update lip sync based on audio
} from "./audio.js";
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

let reactionGeneration = 0;
let reaction_message, reaction_message_last;
async function reactToTouch() {
    if (!VRM.vrm?.expressionManager) return;
    const generation = ++reactionGeneration;
    const messages = Object.entries(REACTION_MESSAGES);
    
    do {
        const [key, value] =
            messages[Math.floor(Math.random() * messages.length)];

        reaction_message = { key, value };
    } while (reaction_message.key === reaction_message_last);

    reaction_message_last = reaction_message.key;

    showHeadTag(
        reaction_message.key,
        "Effect",
        reaction_message.value
    );

    await setExpression(VRM.vrm, "angry", 0.5, 250);

    if (generation !== reactionGeneration) return;
    await sleep(1500);
    if (generation !== reactionGeneration) return;
    await setExpression(VRM.vrm, "angry", 0.0, 250);
    if (generation !== reactionGeneration) return;
    await setExpression(
      VRM.vrm,
      DM.DEFAULT_EXPRESSION_NAME,
      DM.DEFAULT_EXPRESSION_VALUE,
      250
    );
}

function createBoneColliders(vrm, radius = 0.03) {
  const colliders = [];
  vrm.scene.traverse((obj) => {
    if (obj.isBone) {
      const geo = new THREE.SphereGeometry(radius, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ visible: false });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.userData.bone = obj;
      obj.add(sphere);
      colliders.push(sphere);
    }
  });
  return colliders;
}

export function onBoneTouch_old(camera, colliders, domElement, raycaster, event) {
  const rect = domElement.getBoundingClientRect();
  const x = event.touches ? event.touches[0].clientX : event.clientX;
  const y = event.touches ? event.touches[0].clientY : event.clientY;

  pointer.x = ((x - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((y - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(colliders, false);

  if (hits.length > 0) {
    const bone = hits[0].object.userData.bone;
    if (HAIR_TOUCH_BONES.includes(bone.name)) {
      console.log('Touched hair bone:', bone.name);
      reactToTouch();
    }
  }
}

function onBoneTouch(camera, meshes, domElement) { // TODO: Fix lag spike
  const rect = domElement.getBoundingClientRect();
  const x = event.touches ? event.touches[0].clientX : event.clientX;
  const y = event.touches ? event.touches[0].clientY : event.clientY;

  pointer.x = ((x - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((y - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(meshes, true);
  if (hits.length === 0) return null;

  const hit = hits[0];
  const mesh = hit.object;

  // rigid mesh parented to a bone (no skin weights) - fallback
  if (!mesh.isSkinnedMesh || !hit.face || !mesh.geometry.attributes.skinIndex) {
    let p = mesh;
    while (p && !p.isBone) p = p.parent;
    if (p) console.log('Touched bone:', p.name);
    return p || null;
  }

  const si = mesh.geometry.attributes.skinIndex;
  const sw = mesh.geometry.attributes.skinWeight;
  const boneScore = new Map();

  for (const vi of [hit.face.a, hit.face.b, hit.face.c]) {
    const idxs = [si.getX(vi), si.getY(vi), si.getZ(vi), si.getW(vi)];
    const wts  = [sw.getX(vi), sw.getY(vi), sw.getZ(vi), sw.getW(vi)];
    for (let k = 0; k < 4; k++) {
      if (wts[k] > 0) boneScore.set(idxs[k], (boneScore.get(idxs[k]) || 0) + wts[k]);
    }
  }

  let bestIdx = -1, bestScore = -1;
  boneScore.forEach((score, idx) => { if (score > bestScore) { bestScore = score; bestIdx = idx; } });
  if (bestIdx === -1) return null;

  const bone = mesh.skeleton.bones[bestIdx];
  if (HAIR_TOUCH_BONES.includes(bone.name)) {
    console.log('Touched hair bone:', bone.name);
    reactToTouch();
  }
}

// loadModel wraps vrm.js's loadVRM with main.js-specific post-load work
// (eye-tracking activation delay, legacy sphere-collider touch system) that
// depends on state owned here, not in vrm.js.
let colliders;
function onModelLoaded() {
  if (EVENTS.touch_old) colliders = createBoneColliders(VRM.vrm);
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

  eventListeners(camera, () => colliders, renderer.domElement, raycaster);
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
        playVRMA(`${PATH.VRMA_BASE}/${arg}.vrma`);
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