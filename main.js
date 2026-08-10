import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { createVRMAnimationClip, VRMAnimationLoaderPlugin } from "@pixiv/three-vrm-animation";
const VRM_MODELS = {
  "Nika": "./assets/models/nika.vrm",
  "Nika1": "./assets/models/nika_hat_with_cat_ears.vrm"
};
const VRM_DEFAULT_MODEL = VRM_MODELS["Nika"];

const VRMA_IDLE = "./assets/vrma/idle.vrma";
const VRMA_THINKING = "./assets/vrma/thinking.vrma"; 

const VOICE_EFFECT = new Audio("./assets/sounds/VOICE_EFFECT.ogg");

const FOLLOW_SPEED = 0.08;
const SENSITIVITY = 0.2;
const LOOK_TRACKING_LERP = 0.12;

const SPRING_STIFFNESS = 35;
const SPRING_DAMPING   = 12;
const LOOK_NDC_X_MIN = -1.0;
const LOOK_NDC_X_MAX = 1.0;
const LOOK_NDC_Y_MIN = -0.25;
const LOOK_NDC_Y_MAX = 1.0;

let audioCtx = null;
let analyser = null;
let freqData = null;
function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    freqData = new Uint8Array(analyser.frequencyBinCount);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
document.addEventListener("pointerdown", () => getAudioCtx(), { once: true });

let scene, camera, renderer, clock, mixer;
let backgroundColor = 0x222222;
let vrm, vrmaAction;
let zoom = 1.5, rotX = 0, rotY = 0;

let tracking_val = false;

let cachedMeshes = [];

const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
const targetMouseNDC = new THREE.Vector2();

const headPos = new THREE.Vector3();
const desiredPos = new THREE.Vector3();
const lookAtDesired = new THREE.Vector3();
const lookAtVelocity = new THREE.Vector3();
const lookAtTarget = new THREE.Object3D();

const reaction_messages = [
  "Hey!",
  "Ouch!",
  "Stop it!",
  "That tickles!",
  "Stop touching my head!",
  "Please don't touch my head!",
  "Don't touch my head!",
];
let dragging = false;
let isLeftClicking = false;
let reaction_message = "";
let reaction_message_last = "";
document.addEventListener("pointerdown", (e) => { if (e.button === 2) { dragging = true; e.target.setPointerCapture?.(e.pointerId); } });
document.addEventListener("pointerup",   (e) => { if (e.button === 2) dragging = false; });
document.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  isLeftClicking = true;
  if (isPointerTouchingBones(e.clientX, e.clientY)) {
    reaction_message = reaction_messages[Math.floor(Math.random() * reaction_messages.length)];
    if (reaction_message === reaction_message_last) {
      reaction_message = reaction_messages[Math.floor(Math.random() * reaction_messages.length)];
    }
    reaction_message_last = reaction_message;

    showHeadTag(reaction_message, "voice_effect");
    void playHeadTouchEmotion();
  }
});
document.addEventListener("pointerup", (e) => {
  if (e.button !== 0) return;
  isLeftClicking = false;
});

let mouseTracking = false;
let mouse_X, mouse_Y;
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("pointermove", (e) => {
  if (!dragging) {
    if (!mouseTracking) mouseTracking = true;
    mouse_X = e.clientX;
    mouse_Y = e.clientY;
    return;
  }
  rotY = Math.max(-180, Math.min(180, rotY + e.movementX * SENSITIVITY));
  rotX = Math.max(-90,  Math.min(90,  rotX + e.movementY * SENSITIVITY));
});
document.addEventListener("pointerleave", () => {
  tracking_val = false;
  mouseTracking = false;
  resetLookAt();
});
document.addEventListener("pointerenter", () => {
  mouseTracking = true;
  tracking_val = true;
});
document.addEventListener("wheel", (e) => {
  zoom = Math.max(1, Math.min(10, zoom + e.deltaY * 0.0025));
});

let isTypingInInput = false;
const inputEl = document.getElementById("user_prompt");
if (inputEl) {
  const updateTypingState = (isTyping) => {
    isTypingInInput = isTyping;
    if (!isTyping) {
      mouseTracking = true;
    }
  };

  inputEl.addEventListener("focus", () => updateTypingState(true));
  inputEl.addEventListener("blur", () => updateTypingState(false));
  inputEl.addEventListener("input", () => updateTypingState(true));
  inputEl.addEventListener("keydown", () => updateTypingState(true));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const degToRad = (d) => d * (Math.PI / 180);
const bone = (name) => vrm?.humanoid?.getNormalizedBoneNode(name);

const HAIR_TOUCH_BONES =[
    "J_Sec_Hair1_01",
    "J_Sec_Hair2_01",
    "J_Sec_Hair3_01",
    "J_Sec_Hair4_01",
    "J_Sec_Hair5_01",
    "J_Sec_Hair6_01",
    "J_Sec_Hair7_01",

    "J_Sec_Hair1_02",
    "J_Sec_Hair2_02",
    "J_Sec_Hair3_02",
    "J_Sec_Hair4_02",
    "J_Sec_Hair5_02",
    "J_Sec_Hair6_02",

    "J_Sec_Hair1_03",
    "J_Sec_Hair2_03",
    "J_Sec_Hair3_03",
    "J_Sec_Hair4_03",
    "J_Sec_Hair5_03",
    "J_Sec_Hair6_03",

    "J_Sec_Hair1_04",
    "J_Sec_Hair2_04",
    "J_Sec_Hair3_04",
    "J_Sec_Hair4_04",
    "J_Sec_Hair5_04",
    "J_Sec_Hair6_04",

    "J_Sec_Hair1_05",
    "J_Sec_Hair2_05",
    "J_Sec_Hair3_05",
    "J_Sec_Hair4_05",
    "J_Sec_Hair5_05",
    "J_Sec_Hair6_05",

    "J_Sec_Hair1_06",
    "J_Sec_Hair2_06",
    "J_Sec_Hair3_06",
    "J_Sec_Hair4_06",
    "J_Sec_Hair5_06",
    "J_Sec_Hair6_06",

    "J_Sec_Hair1_07",
    "J_Sec_Hair2_07",
    "J_Sec_Hair3_07",
    "J_Sec_Hair4_07",
    "J_Sec_Hair5_07",

    "J_Sec_Hair1_08",
    "J_Sec_Hair2_08",
    "J_Sec_Hair3_08",
    "J_Sec_Hair4_08",
    "J_Sec_Hair5_08",

    "J_Sec_Hair1_09",
    "J_Sec_Hair2_09",
    "J_Sec_Hair3_09",
    "J_Sec_Hair4_09",

    "J_Sec_Hair1_10",
    "J_Sec_Hair2_10",
    "J_Sec_Hair3_10",

    "J_Sec_Hair1_11",
    "J_Sec_Hair2_11",
    "J_Sec_Hair3_11",

    "J_Sec_Hair1_12",
    "J_Sec_Hair2_12",
    "J_Sec_Hair3_12",

    "J_Sec_Hair1_13",
    "J_Sec_Hair2_13",
    "J_Sec_Hair3_13",

    "J_Sec_Hair1_14",
    "J_Sec_Hair2_14",
    "J_Sec_Hair3_14",

    "J_Sec_Hair1_15",
    "J_Sec_Hair2_15",
    "J_Sec_Hair3_15",
    "J_Sec_Hair4_15",

    "J_Sec_Hair1_16",
    "J_Sec_Hair2_16",
    "J_Sec_Hair3_16",
    "J_Sec_Hair4_16",

    "J_Sec_Hair1_17",
    "J_Sec_Hair2_17",
    "J_Sec_Hair3_17",
    "J_Sec_Hair4_17",

    "J_Sec_Hair1_18",
    "J_Sec_Hair2_18",
    "J_Sec_Hair3_18",
    "J_Sec_Hair4_18"
];

const FACE_TOUCH_BONES = [
    "J_Bip_C_Neck",
    "J_Bip_C_Head",
    "J_Adj_L_FaceEye",
    "J_Adj_R_FaceEye",

    "Face",
    "Face_(merged)",
    "Face_(merged)_1",
    "Face_(merged)_2",
    "Face_(merged)_3",
    "Face_(merged)_4",
    "Face_(merged)_5",
    "Face_(merged)_6",
    "Face_(merged)_7"
];

let headTagEl;
function showHeadTag(text, play_effect_or_audio = null) {
  if (!headTagEl) return;
  headTagEl.textContent = text;
  headTagEl.style.display = text ? "block" : "none";
  if (play_effect_or_audio === null) return;
  else if (play_effect_or_audio === "tts_audio") {
    playTTS();
  } else if (play_effect_or_audio === "voice_effect") {
    playEffect(text);
  }
}

function resetLookAt() {
  vrm?.lookAt?.reset();
  lookAtVelocity.set(0, 0, 0);
}

function buildModelButtons() {
  const list = document.getElementById("myList");
  if (!list) return;

  const fragment = document.createDocumentFragment();

  Object.entries(VRM_MODELS).forEach(([modelName, modelPath]) => {
    const buttonId = modelName.toLowerCase();
    if (document.getElementById(buttonId)) return;

    const item = document.createElement("li");
    const button = document.createElement("button");
    button.id = buttonId;
    button.textContent = modelName;
    button.addEventListener("click", () => loadVRM(modelPath));

    item.appendChild(button);

    fragment.appendChild(item);
  });

  if (fragment.childNodes.length) {
    list.insertBefore(fragment, list.firstElementChild);
  }
}

let trackingActivationTimer = null;
let trackingStartupTime = 0;
const TRACKING_ACTIVATION_DELAY = 1000;
function enableTrackingAfterLoad() {
  if (trackingActivationTimer) {
    window.clearTimeout(trackingActivationTimer);
  }

  trackingStartupTime = performance.now();
  mouse_X = window.innerWidth * 0.5;
  mouse_Y = window.innerHeight * 0.5;
  resetLookAt();

  trackingActivationTimer = window.setTimeout(() => {
    tracking_val = true;
    trackingActivationTimer = null;
    resetLookAt();
  }, TRACKING_ACTIVATION_DELAY);
}

function collectTouchBones(root) {
  touchBones = [];
  root.traverse((obj) => {
    if (!obj?.name) return;
    if (HAIR_TOUCH_BONES.includes(obj.name) || FACE_TOUCH_BONES.includes(obj.name) || /Eye/i.test(obj.name)) {
      touchBones.push(obj);
    }
  });
}

let touchBones = [];
function isPointerTouchingBones(pointerX, pointerY) {
  if (!touchBones.length) return false;

  return touchBones.some((obj) => {
    const worldPos = new THREE.Vector3();
    obj.getWorldPosition(worldPos);
    const screenPos = worldPos.project(camera);
    const pxX = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const pxY = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
    const radiusPx = /Eye|Glasses/i.test(obj.name) ? 24 : 18;
    return Math.hypot(pointerX - pxX, pointerY - pxY) <= radiusPx;
  });
}

async function playHeadTouchEmotion() {
  if (!vrm?.expressionManager) return;
  await setExpression("angry", 0.5, 250);
  await sleep(1500);
  await setExpression("angry", 0.0, 250);
  await setExpression("smile", 0.5, 250);
}

let isTouchingHeadBone = false;
function updateHeadTouchState() {
  if (!touchBones.length || mouse_X === undefined || mouse_Y === undefined) {
    if (isTouchingHeadBone) {
      isTouchingHeadBone = false;
      window.dispatchEvent(new CustomEvent("head-touch-change", { detail: { touching: false } }));
    }
    return;
  }

  const isNowTouching = isPointerTouchingBones(mouse_X, mouse_Y);

  if (isNowTouching !== isTouchingHeadBone) {
    isTouchingHeadBone = isNowTouching;
    window.dispatchEvent(new CustomEvent("head-touch-change", { detail: { touching: isTouchingHeadBone } }));
  }
}

let playing_voice_effect = false;
let currentVoiceAudio = null;
let currentVoicePlaybackId = 0;
async function playTTS(path = "./tts/output.wav") {
  const audio = new Audio(`${path}?t=${Date.now()}`);
  const playbackId = ++currentVoicePlaybackId;

  if (currentVoiceAudio) {
    currentVoiceAudio.pause();
    currentVoiceAudio.currentTime = 0;
  }
  currentVoiceAudio = audio;
  playing_voice_effect = true;

  const ctx = getAudioCtx();
  const source = ctx.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(ctx.destination);

  try {
    await audio.play();
    await new Promise((resolve) =>
      audio.addEventListener("ended", resolve, { once: true })
    );
  } finally {
    if (playbackId === currentVoicePlaybackId) {
      currentVoiceAudio = null;
      playing_voice_effect = false;
    }
    source.disconnect();
  }
}

async function playEffect(str) {
  const text = (str ?? "").trim();
  const n = text.split(/\s+/).filter(Boolean).length;
  if (!n) return;

  const playbackId = ++currentVoicePlaybackId;

  if (currentVoiceAudio) {
    currentVoiceAudio.pause();
    currentVoiceAudio.currentTime = 0;
    currentVoiceAudio = null;
  }

  currentVoiceAudio = VOICE_EFFECT;
  playing_voice_effect = true;

  try {
    for (let i = 0; i < n; i++) {
      if (playbackId !== currentVoicePlaybackId) break;

      VOICE_EFFECT.currentTime = 0;
      await VOICE_EFFECT.play();

      await new Promise((resolve) => {
        const onEnded = () => {
          VOICE_EFFECT.removeEventListener("ended", onEnded);
          resolve();
        };
        VOICE_EFFECT.addEventListener("ended", onEnded, { once: true });
      });

      if (playbackId !== currentVoicePlaybackId) break;
      const wait = Math.random() * 50 + 25;
      await sleep(wait);
    }
  } catch (error) {
    console.log("Audio playback error:", error);
  } finally {
    if (playbackId === currentVoicePlaybackId) {
      currentVoiceAudio = null;
      playing_voice_effect = false;
    }
  }
}

const VISEMES = ["aa", "ih", "ou", "ee", "oh"];
let currentViseme = "aa";
let visemeSwapTimer = 0;
let mouthValue = 0;
function updateLipSync(dt) {
  if (!vrm?.expressionManager) return;

  const speaking = playing_voice_effect && currentVoiceAudio && currentVoiceAudio !== VOICE_EFFECT && analyser;

  if (speaking) {
    analyser.getByteFrequencyData(freqData);
    const avg = freqData.reduce((a, b) => a + b, 0) / freqData.length;
    const target = Math.min(1, avg / 80);
    mouthValue += (target - mouthValue) * 0.4;

    visemeSwapTimer -= dt;
    if (visemeSwapTimer <= 0) {
      VISEMES.forEach(v => vrm.expressionManager.setValue(v, 0));
      currentViseme = VISEMES[Math.floor(Math.random() * VISEMES.length)];
      visemeSwapTimer = 0.08 + Math.random() * 0.08;
    }
  } else {
    mouthValue += (0 - mouthValue) * 0.4;
  }

  vrm.expressionManager.setValue(currentViseme, mouthValue);
}

async function expressionAnimate(name, value) {
  if (!vrm) return;
  for (const s of [0.1, 0.25, 0.4, 0.6, 0.8, 0.95, 1.0, 0.95, 0.8, 0.6, 0.4, 0.25, 0.1, 0]) {
    vrm.expressionManager.setValue(name, value * s);
    await sleep(25);
  }
}

async function setExpression(name, target = 1.0, duration = 400) {
  if (!vrm?.expressionManager) return;
  const steps = 30;
  const delay = duration / steps;
  const current = vrm.expressionManager.getValue(name) ?? 0;

  for (let i = 1; i <= steps; i++) {
    vrm.expressionManager.setValue(name, current + (target - current) * (i / steps));
    await sleep(delay);
  }
}


async function autoBlink() {
  while (true) {
    await sleep(2500 + Math.random() * 3000);
    if (vrm) await expressionAnimate("blink", 1.0);
  }
}

function playVRMA(path, loop = false) {
  if (!vrm || !mixer) return;
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  loader.register((p) => new VRMAnimationLoaderPlugin(p));

  loader.load(path, (gltf) => {
    const vrma = gltf.userData.vrmAnimations?.[0];
    if (!vrma) return;

    const clip = createVRMAnimationClip(vrma, vrm);
    if (!clip || !clip.tracks?.length) return;

    const action = mixer.clipAction(clip);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;

    if (vrmaAction) action.crossFadeFrom(vrmaAction, 0.5, true);
    action.play();
    vrmaAction = action;

    if (!loop) {
      const onFinish = (e) => {
        if (e.action !== vrmaAction) return;
        mixer.removeEventListener("finished", onFinish);
        playVRMA(VRMA_IDLE, true);
      };
      mixer.addEventListener("finished", onFinish);
    }
  }, undefined, (error) => {
    console.error("Failed to load VRMA:", path, error);
  });
}

function unloadVRM() {
  if (!vrm) return;
  mixer?.stopAllAction();
  mixer?.uncacheRoot(vrm.scene);
  vrmaAction = null;
  scene.remove(vrm.scene);
  vrm.scene.traverse((obj) => {
    obj.geometry?.dispose?.();
    [obj.material].flat().forEach((m) => m?.dispose?.());
  });
  vrm = null;
  cachedMeshes = [];
}

let current_model = null;
function loadVRM(modelPath) {
  const loader = new GLTFLoader();
  if (modelPath === current_model) return;
  current_model = modelPath;
  loader.register((p) => new VRMLoaderPlugin(p));
  loader.load(modelPath, (gltf) => {
    unloadVRM();
    vrm = gltf.userData.vrm;
    if (!vrm) return;

    if (vrm.lookAt?.applier) {
      console.log("DOWN", vrm.lookAt.applier.rangeMapVerticalDown);
      console.log("UP", vrm.lookAt.applier.rangeMapVerticalUp);
    } else {
      console.warn("Loaded VRM has no lookAt.applier:", current_model);
    }

    cachedMeshes = [];
    vrm.scene.traverse((obj) => { if (obj.isMesh) cachedMeshes.push(obj); });
    collectTouchBones(vrm.scene);
    if (vrm.lookAt) vrm.lookAt.target = lookAtTarget;
    scene.add(vrm.scene);
    mixer = new THREE.AnimationMixer(vrm.scene);
    vrm.scene.rotation.y = degToRad(90);
    vrm.update(1 / 60);
    enableTrackingAfterLoad();
    playVRMA(VRMA_IDLE, true);
    showHeadTag("Hi, i'm Nika!");
    setExpression("smile", 0.5);
  }, undefined, (error) => {
    console.error("Failed to load VRM:", current_model, error);  });
}

const reload_vrm_btn = document.getElementById("reload_vrm");
const tracking_btn = document.getElementById("tracking");
if (reload_vrm_btn) {
  reload_vrm_btn.addEventListener("click", () => {
    vrmaAction.stop();
    vrmaAction.reset();
    playVRMA(VRMA_IDLE, true);
    setExpression("smile", 0.5);
  });
}

if (tracking_btn) {
  tracking_btn.addEventListener("click", () => {
    const span = document.getElementById("tracking_id");
    const turningOn = span.textContent.trim() === "OFF";

    if (trackingActivationTimer) {
      window.clearTimeout(trackingActivationTimer);
      trackingActivationTimer = null;
    }

    tracking_val = turningOn;
    span.textContent = turningOn ? "ON" : "OFF";
    if (!turningOn) resetLookAt();
  });
}

function init() {
  headTagEl = document.getElementById("head-tag");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(backgroundColor);
  scene.add(lookAtTarget);

  camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.3, 2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(1, 2, 1);
  scene.add(dir);

  clock = new THREE.Clock();

  buildModelButtons();
  loadVRM(VRM_DEFAULT_MODEL);

  let vrmWs;
  function connectVrmWS() {
    vrmWs = new WebSocket("ws://localhost:8766");
    vrmWs.onclose = () => setTimeout(connectVrmWS, 1000);
    vrmWs.onerror = () => vrmWs.close();
    vrmWs.onmessage = ({ data }) => {
      const [cmd, ...rest] = data.split(":");
      const arg = rest.join(":");
      if (cmd === "llm_response") console.log("LLM Response:", arg);
      if (cmd === "tts_audio") showHeadTag(arg, "tts_audio");
      if (cmd === "voice_effect") showHeadTag(arg, "voice_effect");
      if (cmd === "play") playVRMA(arg);
      if (cmd === "play_loop") playVRMA(arg, true);
      if (cmd === "expression" && vrm?.expressionManager) {
        Object.keys(vrm.expressionManager.expressionMap).forEach((name) =>
          vrm.expressionManager.setValue(name, 0)
        );
        setExpression(rest[0], 1.0, 500);
      }
    };
  }
  connectVrmWS();

  window.addEventListener("thinking", () => {
    showHeadTag("Nika is thinking...");
    playVRMA(VRMA_THINKING, false);
  });
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function updateLookAt(dt) {
  if (!vrm?.lookAt) return;

  if (isTypingInInput) {
    tracking_val = true;
    vrm.lookAt.autoUpdate = true;

    targetMouseNDC.set(0, -0.95);
    mouseNDC.lerp(targetMouseNDC, 0.16);
    raycaster.setFromCamera(mouseNDC, camera);

    const dist = camera.position.distanceTo(headPos);
    raycaster.ray.at(dist, lookAtDesired);

    const disp = lookAtDesired.clone().sub(lookAtTarget.position);
    const accel = disp.multiplyScalar(SPRING_STIFFNESS).sub(lookAtVelocity.clone().multiplyScalar(SPRING_DAMPING));

    lookAtVelocity.addScaledVector(accel, dt);
    lookAtTarget.position.addScaledVector(lookAtVelocity, dt);
    return;
  }

  if (!mouseTracking) {
    resetLookAt();
    vrm.lookAt.autoUpdate = false;
    return;
  }

  const startupElapsed = performance.now() - trackingStartupTime;
  if (startupElapsed < TRACKING_ACTIVATION_DELAY) {
    tracking_val = false;
    resetLookAt();
    vrm.lookAt.autoUpdate = false;
    return;
  }

  vrm.lookAt.autoUpdate = tracking_val;
  if (!tracking_val || mouse_X === undefined) return;

  const rawNdcY = -(mouse_Y / window.innerHeight) * 2 + 1;
  const lowScreenFactor = THREE.MathUtils.clamp((-rawNdcY) / 0.9, 0, 1);
  const trackingLerp = THREE.MathUtils.lerp(LOOK_TRACKING_LERP, 0.035, lowScreenFactor);
  const horizontalScale = THREE.MathUtils.lerp(1.0, 0.78, lowScreenFactor);

  const ndcX = Math.max(LOOK_NDC_X_MIN, Math.min(LOOK_NDC_X_MAX, ((mouse_X / window.innerWidth) * 2 - 1) * horizontalScale));
  const ndcY = Math.max(LOOK_NDC_Y_MIN, Math.min(LOOK_NDC_Y_MAX, rawNdcY + Math.max(0, -rawNdcY) * 0.25));
  targetMouseNDC.set(ndcX, ndcY);
  mouseNDC.lerp(targetMouseNDC, trackingLerp);
  raycaster.setFromCamera(mouseNDC, camera);

  const dist = camera.position.distanceTo(headPos);
  raycaster.ray.at(dist, lookAtDesired);

  const disp = lookAtDesired.clone().sub(lookAtTarget.position);
  const accel = disp.multiplyScalar(SPRING_STIFFNESS).sub(lookAtVelocity.clone().multiplyScalar(SPRING_DAMPING));

  lookAtVelocity.addScaledVector(accel, dt);
  lookAtTarget.position.addScaledVector(lookAtVelocity, dt);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  if (vrm) {
    const head = bone("head");
    if (head) head.getWorldPosition(headPos);

    const theta = degToRad(rotY), phi = degToRad(rotX);
    desiredPos.set(
      headPos.x + zoom * Math.cos(theta) * Math.cos(phi),
      headPos.y + zoom * Math.sin(phi),
      headPos.z + zoom * Math.sin(theta) * Math.cos(phi)
    );
    camera.position.lerp(desiredPos, FOLLOW_SPEED);
    camera.lookAt(headPos);

    updateLookAt(dt);
    updateHeadTouchState();
    updateLipSync(dt);

    if (headTagEl?.style.display !== "none" && head) {
      const p = headPos.clone().project(camera);
      headTagEl.style.left = `${(p.x * 0.5 + 0.5) * window.innerWidth + 60}px`;
      headTagEl.style.top = `${(-p.y * 0.5 + 0.5) * window.innerHeight - 40}px`;
    }

    vrm.update(dt);
  }

  mixer?.update(dt);
  renderer.render(scene, camera);
}

init();
animate();
autoBlink();