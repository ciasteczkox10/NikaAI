import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { createVRMAnimationClip, VRMAnimationLoaderPlugin } from "@pixiv/three-vrm-animation";
import { 
    DEFAULT_MODEL_SETTINGS as DM, DEFAULT_SETTINGS as DS, // default model settings and default settings for the options in the settings menu
    FOLLOW_SPEED, CAMERA_SETTINGS, // camera follow speed and settings for position and rotation.
    setLookAtLimits, // output scale for look-at behavior
    updateLookAt_SETTINGS, // max yaw/pitch and spring stiffness/damping for look-at behavior
    CUSTOM_EXPRESSIONS,
} from "@config/config.js";
import { ResponseHandler } from "./main.js"
import { EVENTS } from "./events.js";
import { playAudio } from "./audio.js";

const degToRad = (d) => d * (Math.PI / 180);
const bone = (name) => VRM.vrm?.humanoid?.getNormalizedBoneNode(name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const look_at_target = new THREE.Object3D();
export let scene, camera, renderer, clock, mixer;
export let VRM = {
    vrm: null,
    vrma_action: null,
    vrm_loaded: null,
    vrm_pose_ready: null,
    vrm_path: null,
    cached_meshes: [],
    first_load: true,
    playing_music: false,
    head_bob_degrees: 10
}

export function initThree(_scene, _camera, _renderer, _clock) {
  /*
  main.js owns scene/camera/renderer/clock (it creates the WebGL context),
  so it must call this once after creating them instead of assigning the imported bindings directly.
  */
  scene = _scene;
  camera = _camera;
  renderer = _renderer;
  clock = _clock;
}

function unloadVRM() {
  if (!VRM.vrm) return;
  mixer?.stopAllAction();
  mixer?.uncacheRoot(VRM.vrm.scene);
  VRM.vrma_action = null;
  scene.remove(VRM.vrm.scene);
  VRM.vrm.scene.traverse((obj) => {
    obj.geometry?.dispose?.();
    [obj.material].flat().forEach((m) => m?.dispose?.());
  });
  VRM.vrm = null;
  VRM.vrm_loaded = false;
  VRM.vrm_pose_ready = false;
  VRM.cached_meshes = [];
}

export function loadVRM(path, onLoaded) {
  /*
  Load a VRM model from the specified path, unload the previous model, and set up the new model's look-at behavior, animations, and expressions.
  onLoaded(vrm) is an optional callback fired after setup completes, for
  main.js-specific post-load work (e.g. rebuilding touch colliders).
  */
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  loader.load(path, (gltf) => {
    unloadVRM();
    VRM.vrm = gltf.userData.vrm;
    if (!VRM.vrm) return;
    VRM.vrm.scene.visible = false; // hide the model until vrm_loaded is true
    VRM.cached_meshes = [];
    VRM.vrm.scene.traverse((obj) => { if (obj.isMesh) VRM.cached_meshes.push(obj); });
    if (VRM.vrm.lookAt) VRM.vrm.lookAt.target = look_at_target;
    scene.add(VRM.vrm.scene);
    mixer = new THREE.AnimationMixer(VRM.vrm.scene);
    VRM.vrm.scene.rotation.y = degToRad(90);
    VRM.vrm.update(1 / 60);
    greeting(VRM.vrm, onLoaded); // show greeting animation and expression
    setExpression(VRM.vrm, DM.IDLE.expression.name, DM.IDLE.expression.value); // set default expression
    autoBlink(VRM.vrm); // start auto-blinking
    setLookAtLimits(VRM.vrm); // set look-at limits for the model's eyes
    VRM.vrm_path = path;
    VRM.vrm_loaded = true;
  }, undefined, (error) => {
    console.error("Failed to load VRM:", error);
  });
}

function greeting(vrm, onLoaded) {
  if (!vrm) return;
  const animation = DM.GREETING.animation ?? null;
  const text = DM.GREETING.text ?? null;
  const expression = DM.GREETING.expression ?? null;
  const audio = DM.GREETING.audio ?? null;
  if (animation && VRM.first_load) {
    // play greeting animation
    playVRMA(DM.GREETING.animation, false, () => {
      onLoaded?.(VRM.vrm);
      if (expression) {
        // show greeting expression
        setExpression(vrm, expression?.name, expression?.value);
        EVENTS.ignore_blinking = true;
        EVENTS.ignore_head_bobbing = true;
        EVENTS.ignore_tracking = true;
        EVENTS.ignore_touch = true;
      }
      // updateHeadTag(text); // show greeting text in head tag
      showHeadTag(text, audio); // show greeting text in head tag and optionally play audio
    }, () => {
      // reset expression and set pose ready
      setExpression(vrm, expression?.name, 0);
      updateHeadTag(DM.IDLE.text ?? null);
      EVENTS.ignore_blinking = false;
      EVENTS.ignore_head_bobbing = false;
      EVENTS.ignore_tracking = false;
      EVENTS.ignore_touch = false;
      VRM.first_load = false;
      VRM.vrm_pose_ready = true;
    });
  } else {
    // play idle animation
    playVRMA(DM.IDLE.animation, true, () => {
      onLoaded?.(VRM.vrm);
      updateHeadTag(DM.IDLE.text ?? null);
      VRM.first_load = false;
      VRM.vrm_pose_ready = true;
    });
  }
}

export function playVRMA(path, loop = false, onReady = null, onFinish = null) {
  // Play a VRMA animation on the current VRM model, optionally looping it and calling callbacks when ready and finished.
  if (!VRM.vrm || !mixer) return;
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  loader.register((p) => new VRMAnimationLoaderPlugin(p));

  loader.load(path, (gltf) => {
    const vrma = gltf.userData.vrmAnimations?.[0];
    if (!vrma) return;

    const clip = createVRMAnimationClip(vrma, VRM.vrm);
    if (!clip || !clip.tracks?.length) return;

    const action = mixer.clipAction(clip);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;

    if (VRM.vrma_action) action.crossFadeFrom(VRM.vrma_action, 0.5, true);
    action.play();
    VRM.vrma_action = action;
    mixer.update(0);
    onReady?.();

    if (!loop) {
      const onFinishInternal = (e) => {
        if (e.action !== VRM.vrma_action) return;
        mixer.removeEventListener("finished", onFinishInternal);
        onFinish?.();
        playVRMA(DM.IDLE.animation, true);
      };
      mixer.addEventListener("finished", onFinishInternal);
    }
  }, undefined, (error) => {
    console.error("Failed to load VRMA:", path, error);
  });
}
const tag_offset = new THREE.Vector3(0.05, 0.0, 0.08);
export function updateHeadTagElementFollow() {
  const head = bone("head");
  if (!head) return;
  if (head_tag_el?.style.display !== "none") {
    const world_offset = tag_offset.clone().applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
    const p = head_pos.clone().add(world_offset).project(camera);
    head_tag_el.style.left = `${(p.x * 0.5 + 0.5) * window.innerWidth}px`;
    head_tag_el.style.top = `${(-p.y * 0.5 + 0.5) * window.innerHeight}px`;
  }
}
const head_pos = new THREE.Vector3();
const desired_pos = new THREE.Vector3();
export function updateCameraFollow(dt) {
  // update camera position and rotation based on mouse movement and model's head position
  const head = bone("head");
  if (!head) return;
  const NORMALIZED_FOLLOW_SPEED = 1 - Math.pow(1 - FOLLOW_SPEED, dt * 60);
  if (head) head.getWorldPosition(head_pos);

  const theta = degToRad(CAMERA_SETTINGS.rot_y), phi = degToRad(CAMERA_SETTINGS.rot_x);
  desired_pos.set(
    head_pos.x + CAMERA_SETTINGS.zoom * Math.cos(theta) * Math.cos(phi),
    head_pos.y + CAMERA_SETTINGS.zoom * Math.sin(phi),
    head_pos.z + CAMERA_SETTINGS.zoom * Math.sin(theta) * Math.cos(phi)
  );
  camera.position.lerp(desired_pos, NORMALIZED_FOLLOW_SPEED);
  camera.lookAt(head_pos);
}
let _thinkingYaw = 0;
let _thinkingPitch = 0;
export function setThinkingLook(yaw, pitch) {
  _thinkingYaw = yaw;
  _thinkingPitch = pitch;
}

const _lookState = { yaw: 0, pitch: 0, yawVel: 0, pitchVel: 0 };
export function updateLookTracking(dt) {
  /*
  Update the VRM model's eye and head tracking based on the current mouse position, typing state, and any "thinking" state.
  The head and eyes will smoothly follow the target yaw and pitch angles, with spring-like behavior.
  */
  if (!VRM.vrm?.lookAt) return;
  const head = bone("head");
  if (!head) return;
  if (!head.userData.baseRotation) {
      head.userData.baseRotation = head.rotation.clone();
  }
  dt = Math.min(dt, 1 / 30); // clamped to avoid spring blowup after tab switch/alt-tab
  let targetYaw = 0;
  let targetPitch = 0;
  if (EVENTS.ignore_mouse) {
    // if the model is thinking, look at the thinking target
    targetYaw = _thinkingYaw;
    targetPitch = _thinkingPitch;
  } else if (!DS.tracking_id || EVENTS.ignore_tracking || !EVENTS.mouse_tracking || EVENTS.dragging) {
    // if mouse tracking is disabled, look at the camera
    const headWorldPos = new THREE.Vector3();
    const headWorldQuat = new THREE.Quaternion();
    head.getWorldPosition(headWorldPos);
    head.getWorldQuaternion(headWorldQuat);

    const dir = camera.position.clone().sub(headWorldPos).normalize();
    const localDir = dir.applyQuaternion(headWorldQuat.clone().invert());

    targetYaw = Math.atan2(localDir.x, localDir.z) * (180 / Math.PI);
    targetPitch = Math.asin(-localDir.y) * (180 / Math.PI);
} else if (EVENTS.is_typing_in_input) {
    // if typing in input, look on input bar
    const inputEl = document.getElementById("user_prompt");
    const INPUT_RECT = inputEl.getBoundingClientRect();
    const centerX = INPUT_RECT.left + INPUT_RECT.width / 2;
    const centerY = INPUT_RECT.top + INPUT_RECT.height / 2;

    const ndcX = (centerX / window.innerWidth) * 2 - 1;
    const ndcY = -(centerY / window.innerHeight) * 2 + 1;
    targetYaw = ndcX * updateLookAt_SETTINGS.MAX_YAW;
    targetPitch = -ndcY * updateLookAt_SETTINGS.MAX_PITCH;
  } else if (DS.tracking_id && !EVENTS.ignore_tracking && EVENTS.mouse_tracking && !EVENTS.ignore_mouse && EVENTS.mouse_x !== undefined) {
    // if mouse tracking option and mouse tracking is enabled, calculate target yaw/pitch based on mouse position
    const ndcX = (EVENTS.mouse_x / window.innerWidth) * 2 - 1;
    const ndcY = -(EVENTS.mouse_y / window.innerHeight) * 2 + 1;
    targetYaw = ndcX * updateLookAt_SETTINGS.MAX_YAW;
    targetPitch = -ndcY * updateLookAt_SETTINGS.MAX_PITCH; // inverted because NDC Y is inverted
  }

  const dYaw = targetYaw - _lookState.yaw;
  const dPitch = targetPitch - _lookState.pitch;

  const yawAccel = dYaw * updateLookAt_SETTINGS.SPRING_STIFFNESS - _lookState.yawVel * updateLookAt_SETTINGS.SPRING_DAMPING;
  const pitchAccel = dPitch * updateLookAt_SETTINGS.SPRING_STIFFNESS - _lookState.pitchVel * updateLookAt_SETTINGS.SPRING_DAMPING;

  _lookState.yawVel += yawAccel * dt;
  _lookState.pitchVel += pitchAccel * dt;
  _lookState.yaw += _lookState.yawVel * dt;
  _lookState.pitch += _lookState.pitchVel * dt;
  
  // apply to eyes and head bones
  VRM.vrm.lookAt.autoUpdate = false;
  VRM.vrm.lookAt.applier.applyYawPitch(_lookState.yaw, _lookState.pitch);

  const base = head.userData.baseRotation;
  const eyes_to_head_ratio = 0.1;
  const headYaw = _lookState.yaw * eyes_to_head_ratio;
  const headPitch = _lookState.pitch * eyes_to_head_ratio;

  head.rotation.order = "YXZ";
  head.rotation.y = base.y + THREE.MathUtils.degToRad(headYaw);
  head.rotation.x = base.x + THREE.MathUtils.degToRad(headPitch);
}

let frame = 0;
let bobWeight = 0;
let count = 0;
let musicTimer = 0;
const bobSpeed = 0.05;
let blink_min = 0.0;
let blinkMinCurrent = 0.0;
const blinkMinSpeed = 0.05;
let isBlinking = false;
let bobDegreesCurrent = 0;
const bobDegreesSpeed = 0.05;
const music_el = document.getElementById("music-tag");
const squint_eyes = false;

export function updateHeadBobbing(VRM, dt, total_frames = null) {
  if (EVENTS.ignore_head_bobbing) return;
  if (!VRM.vrm?.lookAt) return;
  const head = bone("head");
  if (!head) return;

  const k = (speed) => 1 - Math.pow(1 - speed, dt * 60);

  if (squint_eyes) {
    blink_min = VRM.playing_music && DS.music_id ? 0.25 : 0.0;
    blinkMinCurrent += (blink_min - blinkMinCurrent) * k(blinkMinSpeed);
    if (!isBlinking) {
      VRM.vrm.expressionManager.setValue("blink", blinkMinCurrent);
    }
  }

  musicTimer += dt;
  if (musicTimer >= 0.5) {
    musicTimer = 0;
    let normal = "♪", unique = "♫";
    if (count === 3) count = 0;

    if (VRM.playing_music && DS.music_id) {
      const syms = [normal, normal, normal];
      syms[count] = unique;
      music_el.classList.add("show");
      music_el.textContent = syms.join("   ");
      count++;
    } else {
      music_el.classList.remove("show");
    }
  }

  const targetWeight = VRM.playing_music && DS.music_id ? 1 : 0;
  bobWeight += (targetWeight - bobWeight) * k(bobSpeed);

  bobDegreesCurrent += (VRM.head_bob_degrees - bobDegreesCurrent) * k(bobDegreesSpeed);

  let angle = 0;
  if (total_frames) {
    frame += dt * 60;
    const t = (frame % total_frames) / total_frames;
    angle = Math.sin(t * Math.PI * 2) * THREE.MathUtils.degToRad(bobDegreesCurrent);
  }

  if (bobWeight < 0.001) return;
  head.rotation.x += angle * bobWeight;
}
// Additional functions
let valid_audio_types = ["tts_audio", "no_tts_audio"]
export let head_tag_el = document.getElementById("head-tag");
export function showHeadTag(text, audio_type, timestamps = null, ignore_hide = false) {
  // Display a message in the head tag element and optionally play an audio.
  if (!head_tag_el) return;
  VRM.head_bob_degrees = 5;
  if (valid_audio_types.includes(audio_type)) {
    playAudio({
      type: audio_type,
      path: null,
      timestamps,
      response: text,
      ignore_hide: ignore_hide,
      updateHeadTag,
      ResponseHandler
    }).then(() => {
      VRM.head_bob_degrees = 10;
    });
  } else {
    updateHeadTag(text);
    playAudio({
      type: "no_tts_audio",
      path: audio_type,
      ignore_hide: ignore_hide,
      updateHeadTag,
      ResponseHandler
    }).then(() => {
      VRM.head_bob_degrees = 10;
    });
  }
}
export function updateHeadTag(text) {
  // Update the text content of the head tag element and show/hide it based on whether there is text to display.
  if (!head_tag_el) return;
  head_tag_el.textContent = text;
  head_tag_el.style.display = text ? "block" : "none";
}

export async function setExpression(vrm, name, target = 1.0, duration = 400) {
  // Animate the VRM model's expression to a target value over a specified duration
  if (!vrm?.expressionManager) return;
  const steps = 30;
  const delay = duration / steps;

  if (name in CUSTOM_EXPRESSIONS) {
    const entries = Object.entries(CUSTOM_EXPRESSIONS[name]).map(([custom_name, custom_target]) => ({
      custom_name,
      custom_target: custom_target * target,
      current: vrm.expressionManager.getValue(custom_name) ?? 0,
    }));

    for (let i = 1; i <= steps; i++) {
      for (const { custom_name, custom_target, current } of entries) {
        vrm.expressionManager.setValue(custom_name, current + (custom_target - current) * (i / steps));
      }
      await sleep(delay);
    }
  } else {
    const current = vrm.expressionManager.getValue(name) ?? 0;
    for (let i = 1; i <= steps; i++) {
      vrm.expressionManager.setValue(name, current + (target - current) * (i / steps));
      await sleep(delay);
    }
  }
}
async function expressionAnimate(vrm, name, value, min = 0) {
  // Animate the VRM model's expression to a target value and back to min, creating a smooth transition effect
  if (!vrm) return;
  isBlinking = true;
  for (const s of [0.1, 0.25, 0.4, 0.6, 0.8, 0.95, 1.0, 0.95, 0.8, 0.6, 0.4, 0.25, 0.1, 0]) {
      vrm.expressionManager.setValue(name, min + (value - min) * s);
      await sleep(25);
  }
  isBlinking = false;
}

async function autoBlink(vrm) {
  // Automatically animate the VRM model's blink expression at random intervals, creating a natural blinking effect
  if (!vrm) return;
  while (true) {
    await sleep(2500 + Math.random() * 3000);
    if (vrm && !EVENTS.ignore_blinking) await expressionAnimate(vrm, "blink", 1.0, blinkMinCurrent);
  }
}
export async function showExpressionForDuration(vrm, name, target, duration) {
  // Show an expression for a specified duration, then fall back to default expression
  if (!vrm?.expressionManager) return;
  EVENTS.ignore_blinking = true;
  await setExpression(vrm, name, target, 200);
  await sleep(duration);

  await Promise.all([
      setExpression(vrm, name, 0, 400),
      setExpression(vrm, DM.IDLE.expression.name, DM.IDLE.expression.value, 400),
  ]);
  EVENTS.ignore_blinking = false;
}