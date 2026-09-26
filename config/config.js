import { VRM_FILES, VRM_METADATA } from 'virtual:vrm-models';
import config from "@config/config.json"; // Default settings

export const PATH = { // Base paths for assets
    VRM_BASE: config.base.vrm,
    VRMA_BASE: config.base.vrma,
    SOUNDS_BASE: config.base.sounds
};

export const VRM_MODELS = Object.fromEntries( // Create an object mapping VRM model names to their file paths
  VRM_FILES.map(name => [name, `${PATH.VRM_BASE}${name}/model.vrm`]),
)
export { VRM_METADATA };

export const CUSTOM_EXPRESSIONS = config.custom_expressions // Custom expression presets from config.js: preset: { name: weight }
  

export const DEFAULT_MODEL_SETTINGS = {
  // Default settings for the VRM model.
  MODEL: VRM_MODELS[config.model.model], // default VRM model to load on startup.
  IDLE: {
    animation: PATH.VRMA_BASE + config.model.idle.animation, // default idle animation for the VRM model.
    text: config.model.idle.text, // default message to display when the model is idle
    expression: config.model.idle.expression // default expression to set when the model is idle
  },
  GREETING: {
    animation: PATH.VRMA_BASE + config.model.greeting.animation, // default greeting animation for the VRM model. 
    text: config.model.greeting.text, // default message to display when the model is loaded
    expression: config.model.greeting.expression, // default expression to set when the model is loaded
    audio: config.model.greeting.audio ? PATH.SOUNDS_BASE + config.model.greeting.audio : null, // default audio to play when the model is loaded
    // TODO for audio: Find a way to bypass requirement of interaction with the page before audio can be played.
  },
  THINKING: {
    animation: PATH.VRMA_BASE + config.model.thinking.animation, // Default thinking animation for the VRM model.
    text: config.model.thinking.text, // default message to display when the model is thinking
    expression: config.model.thinking.expression, // default expression to set when the model is thinking
    audio: config.model.thinking.audio ? PATH.SOUNDS_BASE + config.model.thinking.audio : null // default audio to play when the model is thinking
  }
};

export const DEFAULT_SETTINGS = {
  /*
  Default settings for the options in the settings menu.
  If you want to change the default option value. change the value here.
  Every option in the settings menu must be listed here,
  otherwise it will not be presented with correct default value, and might not work correctly.
  */
  music_id: config.settings.music_id, // whether to enable music detection and head bobbing by default
  touch_id: config.settings.touch_id, // whether to enable model reactions to user touch by default
  tracking_id: config.settings.tracking_id  // whether to enable mouse tracking by default
};

export const FOLLOW_SPEED = 0.08; // camera follow speed, 0.0-1.0, higher is faster
export const SENSITIVITY = 0.2; // mouse drag sensitivity, 0.0-1.0, higher is more sensitive

export const CAMERA_SETTINGS = {
  // Default camera settings for zoom and rotation
  zoom: 1.5,
  rot_x: 0,
  rot_y: 0
};

export const updateLookAt_SETTINGS = {
  MAX_YAW: 90, // max yaw for look-at behavior
  MAX_PITCH: 90, // max pitch for look-at behavior
  SPRING_STIFFNESS: 40, // spring stiffness for look-at behavior
  SPRING_DAMPING: 20 // spring damping for look-at behavior
};

const outputScale = {
  /*
  LookAt output scale for each direction.
  Output scale is actual rotation in degrees that the model's eyes will rotate when looking in a given direction.
  Adjust these values to change how much the model's eyes move in each direction.
  */
  horizontalInner: 12,
  horizontalOuter: 12,
  verticalDown: 12,
  verticalUp: 8
};

export function setLookAtLimits(vrm) {
  /*
  Set the maximum yaw and pitch output scale for the VRM model's look-at behavior
  inside the applier's range maps. This function modifies the outputScale values of the
  rangeMapHorizontalInner, rangeMapHorizontalOuter, rangeMapVerticalDown, and
  rangeMapVerticalUp properties of the vrm.lookAt.applier object
  */
    if (!vrm?.lookAt?.applier) return;
    vrm.lookAt.applier.rangeMapHorizontalInner.outputScale = outputScale.horizontalInner;
    vrm.lookAt.applier.rangeMapHorizontalOuter.outputScale = outputScale.horizontalOuter;
    vrm.lookAt.applier.rangeMapVerticalDown.outputScale = outputScale.verticalUp; // inverted because the model's eyes move up when looking down
    vrm.lookAt.applier.rangeMapVerticalUp.outputScale = outputScale.verticalDown; // inverted because the model's eyes move down when looking up
}

export const REACTION_MESSAGES = {
  /*
  Pre-generated messages that the model can say when reacting to user interactions, such as touching its head or hair.
  If you want to add more reactions, add them here as key-value pairs, where the key is the message and the value is the path to the corresponding audio file.
  If you want to use another TTS voice for the reaction, you must generate the audio file and add it to the assets/sounds folder, then reference it here.
  */
  "Hey!": `${PATH.SOUNDS_BASE}hey.wav`,
  "Stop it!": `${PATH.SOUNDS_BASE}stop_it.wav`,
  "That tickles!": `${PATH.SOUNDS_BASE}that_tickles.wav`,
  "Stop touching my head!": `${PATH.SOUNDS_BASE}stop_touching_my_head.wav`,
  "Please don't touch my head!": `${PATH.SOUNDS_BASE}please_dont_touch_my_head.wav`,
  "Don't touch my head!": `${PATH.SOUNDS_BASE}dont_touch_my_head.wav`
};

export const FACE_TOUCH_BONES = [
  // List of bone names in the VRM model that correspond to the face. Used to detect when the user touches the model's face.
"J_Bip_C_Neck",
"J_Bip_C_Head",
"J_Adj_L_FaceEye",
"J_Adj_R_FaceEye"
];