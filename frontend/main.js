import * as THREE from "three";
import {
  PATH, // base paths for assets
  VRM_MODELS, // VRM models list and the default VRM model to load on startup
  updateLookAt_SETTINGS, // look-at behavior settings for the model's eyes
  DEFAULT_MODEL_SETTINGS as DM, DEFAULT_SETTINGS as DS // default model settings and default settings for the options in the settings menu
} from "@config/config.js";
import { 
  buildModelButtons, // Build settings menu and model selection buttons
  inputTextPlaceholder // Set placeholder text for input bar
} from "./utils.js";
import {
  EVENTS,
  eventListeners // event listeners for interactions
} from "./events.js";
import {
  initThree, // initialize Three.js scene, camera, renderer, and clock
  look_at_target, // Three.js object camera look-at target
  scene, camera, renderer, clock, mixer, // Three.js core objects
  VRM, loadVRM, playVRMA, // VRM model management functions
  updateHeadTagElementFollow, // Update the position of the head tag element to follow the model's head in screen space
  updateCameraFollow, // update camera position and rotation based on mouse movement and model's head position
  setThinkingLook, // set the target yaw and pitch for the model's look-at behavior when thinking
  updateLookTracking, // update eye and head tracking based on multiple factors
  updateHeadBobbing, // update head bobbing animation based on if music is playing or not
  updateHeadTag, // update message in the head tag
  showHeadTag, // show a message in the head tag
  showExpressionForDuration // animate an expression to a target value over a specified duration
} from "./vrm.js";
import {
  updateLipSync // update lip sync based on audio
} from "./audio.js";
import {
  createBoneColliders // create colliders for model bones to detect user touch interactions
} from "./bone_touch.js";

let ws_con = true;
let background_color = 0x222222;
let last_message; // store the last message displayed in the head tag
const raycaster = new THREE.Raycaster();

export let ws;

let colliders;
function onModelLoaded() {
  if (EVENTS.touch_old) {
    colliders = createBoneColliders(VRM.vrm, { debug: false });
  }
}
export function loadModel(model_path) {
  document.getElementById('loading_spinner').classList.add('show');
  if (VRM.vrm) VRM.vrm.scene.visible = false;
  updateHeadTag("");
  loadVRM(model_path, (vrm) => {
    onModelLoaded(vrm);
    if (VRM.vrm) VRM.vrm.scene.visible = true;
    if (last_message) updateHeadTag(last_message);
    else updateHeadTag(DM.GREETING.text);
    document.getElementById('loading_spinner').classList.remove('show');
  });
}

const ATTRIBUTES = [
  "stt_transcription",
  "response",
  "expression",
  "animation",
  "model",
  "audio",
  "playing_music",
  "error",
];
class Get_Responses {
  constructor() {
    for (const attribute of ATTRIBUTES) {
        this[attribute] = null;
    }
  }
  call(data) {
    for (const [k, v] of Object.entries(data)) {
        if (ATTRIBUTES.includes(k)) this[k] = v;
    }
    return this;
  }
}
const inputEl = document.getElementById("user_prompt");
export function ResponseHandler(data) {
  const responses = new Get_Responses;
  responses.call(data)
  console.log(responses)
  const stt_transcription = responses.stt_transcription ?? ""
  const llm_response = responses.response ?? ""
  const expression = responses.expression ?? {}
  const animation = responses.animation ?? ""
  const model = responses.model ?? ""
  const audio = responses.audio ?? {}
  const audio_type = audio.type ?? "no_tts_audio"
  const audio_timestamps = audio.timestamps ?? []
  if (typeof responses.playing_music === "boolean") {
    VRM.playing_music = responses.playing_music;
  }
  const error = responses.error ?? null
  if (error) {
    console.error("Backend Error:", error);
    updateHeadTag(`Error: ${error}`);
    return;
  }
  if (stt_transcription) {
    // Display the STT transcription.
    inputTextPlaceholder(inputEl, "Send a message");
    inputEl.value = stt_transcription;
  }
  if (llm_response && audio_type) {
    // Store the last message, log it, display the response, and play the audio
    last_message = llm_response
    window.dispatchEvent(new Event("thinking_end"));
    console.log("LLM Response:", llm_response);
    showHeadTag(llm_response, audio_type, audio_timestamps)
  }
  if (model && VRM_MODELS[model]) loadModel(VRM_MODELS[model])
  if (animation) {
    if (animation !== "reset") {
      // Play the specified animation
      playVRMA(`${PATH.VRMA_BASE}${animation}.vrma`);
    }
    else if (animation === "reset") {
      // Reset to idle animation
      playVRMA(DM.IDLE.animation, true);
    }
  }
  if (expression && VRM.vrm?.expressionManager) {
    // Reset all expressions to 0 before setting the new expression to avoid conflicts
    Object.keys(VRM.vrm.expressionManager.expressionMap).forEach((name) =>
      VRM.vrm.expressionManager.setValue(name, 0)
    );
    showExpressionForDuration(
      // Animate the expression to the target value over the specified duration
      VRM.vrm, 
      expression.expression_name, 
      expression.expression_value, 
      expression.expression_duration,
    );
  }
}
function init() {
  /* 
  scene/camera/renderer/clock are imported bindings owned by vrm.js —
  build them locally, then hand them to vrm.js via initThree() rather
  than assigning the imports directly.
  */
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
  loadModel(DM.MODEL);

  function connectWS() {
    // Connect to the WebSocket server and set up event handlers
    ws = new WebSocket("ws://localhost:8766");
    ws.onopen = () => setWsStatus("connected");
    ws.onclose = () => {
      setWsStatus("not_connected");
      VRM.playing_music = false;
      setTimeout(connectWS, 1000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (event) =>  {
      try {
        ResponseHandler(JSON.parse(event.data));
      } catch (e) {
        console.error("Error parsing response:", e);
      }
    }
  }
  if (ws_con) connectWS();

  window.addEventListener("thinking_start", () => {
    EVENTS.ignore_mouse = true;
    let x, y;
    do {
      x = Math.floor(Math.random() * 3) - 1;
      y = Math.floor(Math.random() * 3) - 1;
    } while (x === 0 && y === 0);

    const targetYaw = x * updateLookAt_SETTINGS.MAX_YAW * 0.75;
    const targetPitch = y * updateLookAt_SETTINGS.MAX_PITCH * 0.75;

    setThinkingLook(targetYaw, targetPitch);

    updateHeadTag(DM.THINKING.text);
    playVRMA(DM.THINKING.animation, false);
  });
  window.addEventListener("thinking_end", () => {
    EVENTS.ignore_mouse = false;
  });

}
let fps = 60;
function animate() {
  requestAnimationFrame(animate);
  clock.update();
  const dt = clock.getDelta();

  if (VRM.vrm) {
    if (VRM.vrm_loaded && VRM.vrm_pose_ready && !VRM.vrm.scene.visible) {
      // Make the VRM model visible once it is fully loaded and ready
      VRM.vrm.scene.visible = true;
    }
    updateCameraFollow(dt); // update camera position and rotation based on mouse movement and model's head position
    updateHeadTagElementFollow(); // update the position of the head tag element to follow the model's head in screen space
    updateLookTracking(dt); // update eye and head tracking based on mouse position and typing state
    updateLipSync(VRM.vrm); // update lip sync based on word input
    updateHeadBobbing(VRM, dt, 60); // update head bobbing animation based on if music is playing or not

    VRM.vrm.update(dt, fps);
  }

  mixer?.update(dt);
  renderer.render(scene, camera);
}
init();
animate();