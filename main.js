import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { createVRMAnimationClip, VRMAnimationLoaderPlugin } from "@pixiv/three-vrm-animation";
import {
  PATH,
  VRM_MODELS, VRM_DEFAULT_MODEL,
  VRMA_IDLE, VRMA_THINKING,
  VOICE_EFFECT,
  SENSITIVITY, FOLLOW_SPEED, // mouse drag sensitivity and camera follow speed
  MAX_YAW, MAX_PITCH, // max yaw/pitch for look-at behavior
  setLookAtLimits, // output scale for look-at behavior
  SPRING_STIFFNESS, SPRING_DAMPING, // updateLookAt uses these for spring physics
  REACTION_MESSAGES, HAIR_TOUCH_BONES, FACE_TOUCH_BONES
} from "./config.js";
import { buildModelButtons, sendPrompt, resetLookAt, setExpression, autoBlink, inputTextPlaceholder } from "./utils.js";
import { startRecording } from "./stt/stt.js";


const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
const targetMouseNDC = new THREE.Vector2();

const head_pos = new THREE.Vector3();
const desired_pos = new THREE.Vector3();
const look_at_desired = new THREE.Vector3();
const look_at_velocity = new THREE.Vector3();
const look_at_target = new THREE.Object3D();

const MODEL_ACTIVATION_DELAY = 400; // ms delay before enabling model visibility after load

let mouse_tracking_option = true; // whether to enable mouse tracking by default
let react_to_touch = true;
let vrm_loaded = false;
let scene, camera, renderer, clock, mixer;
let background_color = 0x222222;
let vrm, vrma_action;
let zoom = 1.5, rot_x = 0, rot_y = 0;
let ws;

let tracking_val = false;

let cached_meshes = [];

let dragging = false;
let is_left_clicking = false;
let reaction_message, reaction_message_last;
document.addEventListener("pointerdown", (e) => { if (e.button === 2) { dragging = true; e.target.setPointerCapture?.(e.pointerId); } });
document.addEventListener("pointerup",   (e) => { if (e.button === 2) dragging = false; });
document.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  is_left_clicking = true;
  if (react_to_touch) {
    if (isPointerTouchingBones(e.clientX, e.clientY)) {
      reaction_message = REACTION_MESSAGES[Math.floor(Math.random() * REACTION_MESSAGES.length)];
      if (reaction_message === reaction_message_last) {
        reaction_message = REACTION_MESSAGES[Math.floor(Math.random() * REACTION_MESSAGES.length)];
      }
      reaction_message_last = reaction_message;

      showHeadTag(reaction_message, "voice_effect");
      void playHeadTouchEmotion();
    }
  }
});
document.addEventListener("pointerup", (e) => {
  if (e.button !== 0) return;
  is_left_clicking = false;
});

let mouse_tracking = false;
let mouse_x, mouse_y;
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("pointermove", (e) => {
  if (!dragging) {
    if (mouse_tracking_option && !mouse_tracking) mouse_tracking = true;
    mouse_x = e.clientX;
    mouse_y = e.clientY;
    return;
  }
  rot_y = Math.max(-180, Math.min(180, rot_y + e.movementX * SENSITIVITY));
  rot_x = Math.max(-90,  Math.min(90,  rot_x + e.movementY * SENSITIVITY));
});
document.addEventListener("pointerleave", () => {
  if (mouse_tracking_option) mouse_tracking = false;
});
document.addEventListener("pointerenter", () => {
  if (mouse_tracking_option) mouse_tracking = false;
});
document.addEventListener("wheel", (e) => {
  zoom = Math.max(1, Math.min(10, zoom + e.deltaY * 0.0025));
});

let is_typing_in_input = false;
const inputEl = document.getElementById("user_prompt");
if (inputEl) {
  const updateTypingState = (is_typing) => {
    is_typing_in_input = is_typing;
    if (!is_typing) {
      if (mouse_tracking_option) mouse_tracking = true;
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

let audio_ctx = null;
let analyser = null;
let freq_data = null;
function getaudio_ctx() {
  if (!audio_ctx) {
    audio_ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audio_ctx.createAnalyser();
    analyser.fftSize = 256;
    freq_data = new Uint8Array(analyser.frequencyBinCount);
  }
  if (audio_ctx.state === "suspended") audio_ctx.resume();
  return audio_ctx;
}
document.addEventListener("pointerdown", () => getaudio_ctx(), { once: true });

let head_tag_el;
let first_show_head_tag = true;
function showHeadTag(text, play_effect_or_audio = null) {
  if (!head_tag_el) return;
  head_tag_el.textContent = text;
  head_tag_el.style.display = text ? "block" : "none";
  if (play_effect_or_audio === null) return;
  else if (play_effect_or_audio === "tts_audio") {
    playTTS();
  } else if (play_effect_or_audio === "voice_effect") {
    playEffect(text);
  }
} 
/* tracking activation delay to avoid eyes movement on load */
let tracking_activation_timer = null;
let tracking_startup_time = 0;
function enableTrackingAfterLoad() {
  if (tracking_activation_timer) {
    window.clearTimeout(tracking_activation_timer);
  }

  tracking_startup_time = performance.now();
  mouse_x = window.innerWidth * 0.5;
  mouse_y = window.innerHeight * 0.5;
  resetLookAt(vrm, look_at_velocity);

  tracking_activation_timer = window.setTimeout(() => {
    tracking_val = true;
    tracking_activation_timer = null;
    resetLookAt(vrm, look_at_velocity);
  }, MODEL_ACTIVATION_DELAY);
}

function collectTouchBones(root) {
  touch_bones = [];
  root.traverse((obj) => {
    if (!obj?.name) return;
    if (HAIR_TOUCH_BONES.includes(obj.name) || FACE_TOUCH_BONES.includes(obj.name) || /Eye/i.test(obj.name)) {
      touch_bones.push(obj);
    }
  });
}

let touch_bones = [];
function isPointerTouchingBones(pointerX, pointerY) {
  if (!touch_bones.length) return false;

  return touch_bones.some((obj) => {
    const worldPos = new THREE.Vector3();
    obj.getWorldPosition(worldPos);
    const screenPos = worldPos.project(camera);
    const pxX = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const pxY = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
    const radiusPx = /Eye/i.test(obj.name) ? 24 : 18;
    return Math.hypot(pointerX - pxX, pointerY - pxY) <= radiusPx;
  });
}

async function playHeadTouchEmotion() {
  if (!vrm?.expressionManager) return;
  await setExpression(vrm, "angry", 0.5, 250);
  await sleep(1500);
  await setExpression(vrm, "angry", 0.0, 250);
  await setExpression(vrm, "smile", 0.5, 250);
}

let is_touching_head_bone = false;
function updateHeadTouchState() {
  if (!touch_bones.length || mouse_x === undefined || mouse_y === undefined) {
    if (is_touching_head_bone) {
      is_touching_head_bone = false;
      window.dispatchEvent(new CustomEvent("head-touch-change", { detail: { touching: false } }));
    }
    return;
  }

  const is_now_touching = isPointerTouchingBones(mouse_x, mouse_y);

  if (is_now_touching !== is_touching_head_bone) {
    is_touching_head_bone = is_now_touching;
    window.dispatchEvent(new CustomEvent("head-touch-change", { detail: { touching: is_touching_head_bone } }));
  }
}

let playing_voice_effect = false;
let current_voice_audio = null;
let current_voice_playback_id = 0;
async function playTTS(path = "./tts/output.wav") {
  const audio = new Audio(`${path}?t=${Date.now()}`);
  const playbackId = ++current_voice_playback_id;

  if (current_voice_audio) {
    current_voice_audio.pause();
    current_voice_audio.currentTime = 0;
  }
  current_voice_audio = audio;
  playing_voice_effect = true;

  const ctx = getaudio_ctx();
  const source = ctx.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(ctx.destination);

  try {
    await audio.play();
    await new Promise((resolve) =>
      audio.addEventListener("ended", resolve, { once: true })
    );
  } finally {
    if (playbackId === current_voice_playback_id) {
      current_voice_audio = null;
      playing_voice_effect = false;
    }
    source.disconnect();
  }
}
async function playEffect(str) {
  const text = (str ?? "").trim();
  const n = text.split(/\s+/).filter(Boolean).length;
  if (!n) return;

  const playbackId = ++current_voice_playback_id;

  if (current_voice_audio) {
    current_voice_audio.pause();
    current_voice_audio.currentTime = 0;
    current_voice_audio = null;
  }

  current_voice_audio = VOICE_EFFECT;
  playing_voice_effect = true;

  try {
    for (let i = 0; i < n; i++) {
      if (playbackId !== current_voice_playback_id) break;

      VOICE_EFFECT.currentTime = 0;
      await VOICE_EFFECT.play();

      await new Promise((resolve) => {
        const onEnded = () => {
          VOICE_EFFECT.removeEventListener("ended", onEnded);
          resolve();
        };
        VOICE_EFFECT.addEventListener("ended", onEnded, { once: true });
      });

      if (playbackId !== current_voice_playback_id) break;
      const wait = Math.random() * 50 + 25;
      await sleep(wait);
    }
  } catch (error) {
    console.log("Audio playback error:", error);
  } finally {
    if (playbackId === current_voice_playback_id) {
      current_voice_audio = null;
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

  const speaking = playing_voice_effect && current_voice_audio && current_voice_audio !== VOICE_EFFECT && analyser;

  if (speaking) {
    analyser.getByteFrequencyData(freq_data);
    const avg = freq_data.reduce((a, b) => a + b, 0) / freq_data.length;
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
function playVRMA(animation_path, loop = false) {
  if (!vrm || !mixer) return;
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  loader.register((p) => new VRMAnimationLoaderPlugin(p));

  loader.load(animation_path, (gltf) => {
    const vrma = gltf.userData.vrmAnimations?.[0];
    if (!vrma) return;

    const clip = createVRMAnimationClip(vrma, vrm);
    if (!clip || !clip.tracks?.length) return;

    const action = mixer.clipAction(clip);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;

    if (vrma_action) action.crossFadeFrom(vrma_action, 0.5, true);
    action.play();
    vrma_action = action;

    if (!loop) {
      const onFinish = (e) => {
        if (e.action !== vrma_action) return;
        mixer.removeEventListener("finished", onFinish);
        playVRMA(VRMA_IDLE, true);
      };
      mixer.addEventListener("finished", onFinish);
    }
  }, undefined, (error) => {
    console.error("Failed to load VRMA:", animation_path, error);
  });
}
function unloadVRM() {
  if (!vrm) return;
  mixer?.stopAllAction();
  mixer?.uncacheRoot(vrm.scene);
  vrma_action = null;
  scene.remove(vrm.scene);
  vrm.scene.traverse((obj) => {
    obj.geometry?.dispose?.();
    [obj.material].flat().forEach((m) => m?.dispose?.());
  });
  vrm = null;
  cached_meshes = [];
}

let current_model_path = null;
let current_model_name = null;
function loadVRM(model_path) {
  // Load a VRM model from the specified path, unload the previous model, and set up the new model's look-at behavior, animations, and expressions.
  const loader = new GLTFLoader();
  if (model_path === current_model_path) return;
  current_model_path = model_path;
  current_model_name = Object.keys(VRM_MODELS).find(
    key => VRM_MODELS[key] === model_path
  );
  loader.register((p) => new VRMLoaderPlugin(p));
  loader.load(model_path, (gltf) => {
    unloadVRM();
    vrm = gltf.userData.vrm;
    if (!vrm) return;
    vrm.scene.visible = false; // hide the model until vrm_loaded is true after delay
    cached_meshes = [];
    vrm.scene.traverse((obj) => { if (obj.isMesh) cached_meshes.push(obj); });
    collectTouchBones(vrm.scene); // collect touch bones for hair and face
    if (vrm.lookAt) vrm.lookAt.target = look_at_target;
    scene.add(vrm.scene);
    mixer = new THREE.AnimationMixer(vrm.scene);
    vrm.scene.rotation.y = degToRad(90);
    vrm.update(1 / 60);
    enableTrackingAfterLoad(); // enable eye tracking
    playVRMA(VRMA_IDLE, true); // play idle animation
    setExpression(vrm, "smile", 0.5); // set default smile expression
    autoBlink(vrm); // start auto-blinking
    setLookAtLimits(vrm); // set look-at limits for the model's eyes
    vrm_loaded = true;
  }, undefined, (error) => {
    console.error("Failed to load VRM:", current_model, error);  });
}
const react_to_touch_btn = document.getElementById("react_to_touch");
if (react_to_touch_btn) {
  react_to_touch_btn.addEventListener("click", () => {
    react_to_touch = !react_to_touch;
    const span = document.getElementById("touch_id");
    span.textContent = react_to_touch ? "ON" : "OFF";
  });
}
const reload_vrm_btn = document.getElementById("reload_vrm");
const tracking_btn = document.getElementById("tracking");
if (reload_vrm_btn) {
  reload_vrm_btn.addEventListener("click", () => {
    vrma_action.stop();
    vrma_action.reset();
    playVRMA(VRMA_IDLE, true);
    setExpression(vrm, "smile", 0.5);
  });
}
if (tracking_btn) {
  tracking_btn.addEventListener("click", () => {
    const span = document.getElementById("tracking_id");
    const turningOn = span.textContent.trim() === "OFF";

    if (tracking_activation_timer) {
      window.clearTimeout(tracking_activation_timer);
      tracking_activation_timer = null;
    }

    mouse_tracking_option = turningOn;
    span.textContent = turningOn ? "ON" : "OFF";
  });
}
const send_prompt_btn = document.getElementById("send_prompt");
const prompt_input = document.getElementById("user_prompt");
if (send_prompt_btn) send_prompt_btn.addEventListener("click", () => sendPrompt(ws, current_model_name));
if (prompt_input) prompt_input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendPrompt(ws, current_model_name);
  }
});
const activate_stt_btn = document.getElementById("activate_stt");
if (activate_stt_btn) {
    let holdTimer = null;
    let stopRecording = null;

    activate_stt_btn.addEventListener("pointerdown", async () => {
        holdTimer = setTimeout(async () => {
            console.log("Recording...");
            inputTextPlaceholder(inputEl, "Listening...");
            stopRecording = await startRecording(ws);
        }, 250);
    });

    const release = () => {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }

        if (stopRecording) {
            inputTextPlaceholder(inputEl, "Transcribing...");
            console.log("Stopping recording...");

            stopRecording();
            stopRecording = null;
        }
    };

    activate_stt_btn.addEventListener("pointerup", release);
    activate_stt_btn.addEventListener("pointercancel", release);
    activate_stt_btn.addEventListener("pointerleave", release);
}

function init() {
  head_tag_el = document.getElementById("head-tag");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(background_color);
  scene.add(look_at_target);

  camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.3, 2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(1, 2, 1);
  scene.add(dir);

  clock = new THREE.Timer();

  buildModelButtons(VRM_MODELS, loadVRM);
  loadVRM(VRM_DEFAULT_MODEL);
  function WSCommandHandler(event) {
    const [cmd, ...rest] = event.data.split(":");
    const arg = rest.join(":");
      if (cmd === "llm_response") console.log("LLM Response:", arg);
      if (cmd === "stt_result") {
        inputTextPlaceholder(inputEl, "Send a message");
        inputEl.value = arg;
      }
      if (cmd === "tts_audio") showHeadTag(arg, "tts_audio");
      if (cmd === "voice_effect") showHeadTag(arg, "voice_effect");
      if (cmd === "model") loadVRM(VRM_MODELS[arg]);
      if (cmd === "animation" && arg !== "reset") {
        playVRMA(`${PATH.VRMA_BASE}/${arg}.vrma`);
      } else if (cmd === "animation" && arg === "reset") {
        vrma_action.stop();
        vrma_action.reset();
        playVRMA(VRMA_IDLE, true);
      }
      if (cmd === "expression" && vrm?.expressionManager) {
        Object.keys(vrm.expressionManager.expressionMap).forEach((name) =>
          vrm.expressionManager.setValue(name, 0)
        );
        setExpression(rest[0], 1.0, 500);
      }
    };
  function connectWS() {
    ws = new WebSocket("ws://localhost:8766");
    ws.onclose = () => setTimeout(connectWS, 1000);
    ws.onerror = () => ws.close();
    ws.onmessage = (data ) => WSCommandHandler(data);
  }
  connectWS();
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

const _lookState = { yaw: 0, pitch: 0, yawVel: 0, pitchVel: 0 };
function updateEyeTracking(vrm, dt) {
  if (!vrm?.lookAt) return;

  const STARTUP_ELAPSED = performance.now() - tracking_startup_time;
  if (STARTUP_ELAPSED < MODEL_ACTIVATION_DELAY) return;
  dt = Math.min(dt, 1 / 30); // clamped to avoid spring blowup after tab switch/alt-tab

  let targetYaw = 0;
  let targetPitch = 0;
  if (!mouse_tracking_option || !mouse_tracking) {
    // if mouse tracking option or mouse tracking is disabled, reset to neutral
    targetYaw = 0;
    targetPitch = 0;
  } else if (is_typing_in_input) {
    // if typing in input, look on input bar
    const INPUT_RECT = inputEl.getBoundingClientRect();
    const centerX = INPUT_RECT.left + INPUT_RECT.width / 2;
    const centerY = INPUT_RECT.top + INPUT_RECT.height / 2;

    const ndcX = (centerX / window.innerWidth) * 2 - 1;
    const ndcY = -(centerY / window.innerHeight) * 2 + 1;
    targetYaw = ndcX * MAX_YAW;
    targetPitch = -ndcY * MAX_PITCH; // same sign convention you settled on for mouse tracking
  } else if (mouse_tracking_option && mouse_tracking && mouse_x !== undefined) {
    // if mouse tracking option and mouse tracking is enabled, calculate target yaw/pitch based on mouse position
    const ndcX = (mouse_x / window.innerWidth) * 2 - 1;
    const ndcY = -(mouse_y / window.innerHeight) * 2 + 1;
    targetYaw = ndcX * MAX_YAW;
    targetPitch = -ndcY * MAX_PITCH; // inverted because NDC Y is inverted
  }

  const dYaw = targetYaw - _lookState.yaw;
  const dPitch = targetPitch - _lookState.pitch;

  const yawAccel = dYaw * SPRING_STIFFNESS - _lookState.yawVel * SPRING_DAMPING;
  const pitchAccel = dPitch * SPRING_STIFFNESS - _lookState.pitchVel * SPRING_DAMPING;

  _lookState.yawVel += yawAccel * dt;
  _lookState.pitchVel += pitchAccel * dt;
  _lookState.yaw += _lookState.yawVel * dt;
  _lookState.pitch += _lookState.pitchVel * dt;

  vrm.lookAt.autoUpdate = false;
  vrm.lookAt.applier.applyYawPitch(_lookState.yaw, _lookState.pitch);
}

function animate() {
  requestAnimationFrame(animate);
  clock.update();
  const STARTUP_ELAPSED = performance.now() - tracking_startup_time;
  const dt = clock.getDelta();

  if (vrm) {
    if (vrm_loaded && !vrm.scene.visible && STARTUP_ELAPSED > MODEL_ACTIVATION_DELAY) {
      // make the model visible after it's loaded
      if (first_show_head_tag) {
        showHeadTag("Hi, i'm Nika!");
        first_show_head_tag = false;
      }
      vrm.scene.visible = true;
    }

    // Update camera position to follow the model's head
    const head = bone("head");
    const NORMALIZED_FOLLOW_SPEED = 1 - Math.pow(1 - FOLLOW_SPEED, dt * 60); // normalize to ~60fps baseline
    if (head) head.getWorldPosition(head_pos);

    const theta = degToRad(rot_y), phi = degToRad(rot_x);
    desired_pos.set(
      head_pos.x + zoom * Math.cos(theta) * Math.cos(phi),
      head_pos.y + zoom * Math.sin(phi),
      head_pos.z + zoom * Math.sin(theta) * Math.cos(phi)
    );
    camera.position.lerp(desired_pos, NORMALIZED_FOLLOW_SPEED);
    camera.lookAt(head_pos);


    updateEyeTracking(vrm, dt); // update eye tracking based on mouse position and typing state
    updateHeadTouchState(); // update head touch state based on mouse position
    updateLipSync(dt); // update lip sync based on audio input

    if (head_tag_el?.style.display !== "none" && head) {
      // Update the position of the head tag element to follow the model's head in screen space
      const p = head_pos.clone().project(camera);
      head_tag_el.style.left = `${(p.x * 0.5 + 0.5) * window.innerWidth + 60}px`;
      head_tag_el.style.top = `${(-p.y * 0.5 + 0.5) * window.innerHeight - 40}px`;
    }

    vrm.update(dt);
  }

  mixer?.update(dt);
  renderer.render(scene, camera);
}
init();
animate();