import { VRM_FILES } from 'virtual:vrm-models';
import config from "@config/config.json";

export const PATH = { // Base paths for assets
    VRM_BASE: config.base.vrm_base,
    VRMA_BASE: config.base.vrma_base,
    SOUNDS_BASE: config.base.sounds_base
};

export const VRM_MODELS = Object.fromEntries(
  // Create a mapping of VRM model names to their file paths
  VRM_FILES.map(f => [f.replace('.vrm', ''), `${PATH.VRM_BASE}${f}`])
)

export const DEFAULT_MODEL_SETTINGS = {
  VRM_DEFAULT_MODEL: VRM_MODELS[config.default.default_model], // Default VRM model to load on startup.
  VRMA_IDLE: PATH.VRMA_BASE + config.default.default_idle_animation, // Default idle animation for the VRM model.
  VRMA_THINKING: PATH.VRMA_BASE + config.default.default_thinking_animation, // Default thinking animation for the VRM model.
  DEFAULT_EXPRESSION_NAME: "neutral", // default expression to set after loading a model
  DEFAULT_EXPRESSION_VALUE: 0.5, // default expression value to set after loading a model
};

export const DEFAULT_SETTINGS = {
  /*
  Default settings for the options in the settings menu.
  If you want to change the default option value. change the value here.
  Every option in the settings menu must be listed here,
  otherwise it will not be presented with correct default value, and might not work correctly.
  */
  "touch_id": true, // whether to enable model reactions to user touch by default
  "tracking_id": true  // whether to enable mouse tracking by default
};

export const MODEL_ACTIVATION_DELAY = 400; // ms delay before enabling model visibility after load
export const FOLLOW_SPEED = 0.08; // camera follow speed, 0.0-1.0, higher is faster
export const SENSITIVITY = 0.2; // mouse drag sensitivity, 0.0-1.0, higher is more sensitive

export const CAMERA_SETTINGS = {
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
  "Hey!": `${PATH.SOUNDS_BASE}/hey.wav`,
  "Stop it!": `${PATH.SOUNDS_BASE}/stop_it.wav`,
  "That tickles!": `${PATH.SOUNDS_BASE}/that_tickles.wav`,
  "Stop touching my head!": `${PATH.SOUNDS_BASE}/stop_touching_my_head.wav`,
  "Please don't touch my head!": `${PATH.SOUNDS_BASE}/please_dont_touch_my_head.wav`,
  "Don't touch my head!": `${PATH.SOUNDS_BASE}/dont_touch_my_head.wav`
};

export const HAIR_TOUCH_BONES =[ // List of bone names in the VRM model that correspond to hair sections. Used to detect when the user touches the model's hair.
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

export const FACE_TOUCH_BONES = [ // List of bone names in the VRM model that correspond to the face. Used to detect when the user touches the model's face.
"J_Bip_C_Neck",
"J_Bip_C_Head",
"J_Adj_L_FaceEye",
"J_Adj_R_FaceEye"
];