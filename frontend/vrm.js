import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { createVRMAnimationClip, VRMAnimationLoaderPlugin } from "@pixiv/three-vrm-animation";
import { 
    DEFAULT_MODEL_SETTINGS as DM, DEFAULT_SETTINGS as DS, // default model settings and general settings
    setLookAtLimits, // output scale for look-at behavior
    updateLookAt_SETTINGS, // max yaw/pitch and spring stiffness/damping for look-at behavior
} from "@config/config.js";
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
    vrm_path: null,
    cached_meshes: []
}

// main.js owns scene/camera/renderer/clock (it creates the WebGL context),
// so it must call this once after creating them instead of assigning the
// imported bindings directly (assigning an imported `let` from another
// module throws).
export function initThree(_scene, _camera, _renderer, _clock) {
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
  VRM.cached_meshes = [];
}

export function loadVRM(model_path, onLoaded) {
  // Load a VRM model from the specified path, unload the previous model, and set up the new model's look-at behavior, animations, and expressions.
  // onLoaded(vrm) is an optional callback fired after setup completes, for
  // main.js-specific post-load work (e.g. rebuilding touch colliders).
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  loader.load(model_path, (gltf) => {
    unloadVRM();
    VRM.vrm = gltf.userData.vrm;
    if (!VRM.vrm) return;
    VRM.vrm.scene.visible = false; // hide the model until vrm_loaded is true after delay
    VRM.cached_meshes = [];
    VRM.vrm.scene.traverse((obj) => { if (obj.isMesh) VRM.cached_meshes.push(obj); });
    if (VRM.vrm.lookAt) VRM.vrm.lookAt.target = look_at_target;
    scene.add(VRM.vrm.scene);
    mixer = new THREE.AnimationMixer(VRM.vrm.scene);
    VRM.vrm.scene.rotation.y = degToRad(90);
    VRM.vrm.update(1 / 60);
    playVRMA(DM.VRMA_IDLE, true); // play idle animation
    setExpression(VRM.vrm, DM.DEFAULT_EXPRESSION_NAME, DM.DEFAULT_EXPRESSION_VALUE); // set default smile expression
    autoBlink(VRM.vrm); // start auto-blinking
    setLookAtLimits(VRM.vrm); // set look-at limits for the model's eyes
    VRM.vrm_path = model_path;
    VRM.vrm_loaded = true;
    onLoaded?.(VRM.vrm);
  }, undefined, (error) => {
    console.error("Failed to load VRM:", error);  });
}

export function playVRMA(animation_path, loop = false) {
  /*
  Play a VRMA animation on the currently loaded VRM model, optionally looping it.
  If another animation is already playing, crossfade to the new animation.
  */
  if (!VRM.vrm || !mixer) return;
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  loader.register((p) => new VRMAnimationLoaderPlugin(p));

  loader.load(animation_path, (gltf) => {
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

    if (!loop) {
      const onFinish = (e) => {
        if (e.action !== VRM.vrma_action) return;
        mixer.removeEventListener("finished", onFinish);
        playVRMA(DM.VRMA_IDLE, true);
      };
      mixer.addEventListener("finished", onFinish);
    }
  }, undefined, (error) => {
    console.error("Failed to load VRMA:", animation_path, error);
  });
}
const _lookState = { yaw: 0, pitch: 0, yawVel: 0, pitchVel: 0 };
function updateHeadTracking(yawDeg, pitchDeg) {
  /*
  Update the head bone's rotation based on the provided yaw and pitch angles in degrees,
  applying a base rotation offset to maintain the original orientation of the head.
  The yaw and pitch effects are reduced to avoid excessive head movement.
  */
    if (!VRM.vrm?.lookAt) return;
    const head = bone("head");
    if (!head) return;

    if (!head.userData.baseRotation) {
        head.userData.baseRotation = head.rotation.clone();
    }
    const base = head.userData.baseRotation;
    const eyes_to_head_ratio = 0.1; // reduce head rotation effect compared to eyes
    yawDeg *= eyes_to_head_ratio;
    pitchDeg *= eyes_to_head_ratio;
    head.rotation.order = "YXZ";
    head.rotation.y = base.y + THREE.MathUtils.degToRad(yawDeg);
    head.rotation.x = base.x + THREE.MathUtils.degToRad(pitchDeg);
}
export function updateEyeTracking(dt) {
  if (!VRM.vrm?.lookAt) return;

  dt = Math.min(dt, 1 / 30); // clamped to avoid spring blowup after tab switch/alt-tab

  let targetYaw = 0;
  let targetPitch = 0;
  if (!DS.tracking_id || !EVENTS.mouse_tracking) {
    // if mouse tracking option or mouse tracking is disabled, reset to neutral
    targetYaw = 0;
    targetPitch = 0;
  } else if (EVENTS.is_typing_in_input) {
    // if typing in input, look on input bar
    const inputEl = document.getElementById("user_prompt");
    const INPUT_RECT = inputEl.getBoundingClientRect();
    const centerX = INPUT_RECT.left + INPUT_RECT.width / 2;
    const centerY = INPUT_RECT.top + INPUT_RECT.height / 2;

    const ndcX = (centerX / window.innerWidth) * 2 - 1;
    const ndcY = -(centerY / window.innerHeight) * 2 + 1;
    targetYaw = ndcX * updateLookAt_SETTINGS.MAX_YAW;
    targetPitch = -ndcY * updateLookAt_SETTINGS.MAX_PITCH; // same sign convention you settled on for mouse tracking
  } else if (DS.tracking_id && EVENTS.mouse_tracking && EVENTS.mouse_x !== undefined) {
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

  VRM.vrm.lookAt.autoUpdate = false;
  VRM.vrm.lookAt.applier.applyYawPitch(_lookState.yaw, _lookState.pitch);
  updateHeadTracking(_lookState.yaw, _lookState.pitch);
}

// Additional functions
export let head_tag_el = document.getElementById("head-tag");
export function showHeadTag(text, play_effect_or_audio = null, audio_path = null) {
  // Display a message next to the model's head and optionally play an audio effect or TTS audio.
  if (!head_tag_el) return;
  head_tag_el.textContent = text;
  head_tag_el.style.display = text ? "block" : "none";
  if (play_effect_or_audio === null) return;
  else if (play_effect_or_audio === "TTS") {
    playAudio("TTS", audio_path);
  } else if (play_effect_or_audio === "Effect") {
    playAudio("Effect", audio_path);
  }

}
export async function setExpression(vrm, name, target = 1.0, duration = 400) {
    // Animate the VRM model's expression to a target value over a specified duration
    if (!vrm?.expressionManager) return;
    const steps = 30;
    const delay = duration / steps;
    const current = vrm.expressionManager.getValue(name) ?? 0;

    for (let i = 1; i <= steps; i++) {
        vrm.expressionManager.setValue(name, current + (target - current) * (i / steps));
        await sleep(delay);
    }
}
async function expressionAnimate(vrm, name, value) {
    // Animate the VRM model's expression to a target value and back to 0, creating a smooth transition effect
    if (!vrm) return;
    for (const s of [0.1, 0.25, 0.4, 0.6, 0.8, 0.95, 1.0, 0.95, 0.8, 0.6, 0.4, 0.25, 0.1, 0]) {
        vrm.expressionManager.setValue(name, value * s);
        await sleep(25);
    }
}
async function autoBlink(vrm) {
    // Automatically animate the VRM model's blink expression at random intervals, creating a natural blinking effect
    if (!vrm) return;
    while (true) {
        await sleep(2500 + Math.random() * 3000);
        if (vrm) await expressionAnimate(vrm, "blink", 1.0);
    }
}

export async function showExpressionForDuration(vrm, name, target, duration) {
    // Show an expression for a specified duration, then fall back to default expression
    if (!vrm?.expressionManager) return;

    await setExpression(vrm, name, target, 200);
    await sleep(duration);

    await Promise.all([
        setExpression(vrm, name, 0, 400),
        setExpression(vrm, DM.DEFAULT_EXPRESSION_NAME, DM.DEFAULT_EXPRESSION_VALUE, 400),
    ]);
}