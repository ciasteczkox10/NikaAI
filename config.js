export const PATH = { // Base paths for assets
    VRM_BASE: "./assets/models",
    VRMA_BASE: "./assets/vrma",
    SOUNDS_BASE: "./assets/sounds"
};
export const VRM_MODELS = { // Edit this object to add more VRM models. The key is the model name, and the value is the path to the VRM file. Used in main.js to build the model selection buttons.
  "nika": `${PATH.VRM_BASE}/nika.vrm`,
  "nika_hat_with_cat_ears": `${PATH.VRM_BASE}/nika_hat_with_cat_ears.vrm`
};
export const VRM_DEFAULT_MODEL = VRM_MODELS["nika"]; // Default VRM model to load on startup. Change this to the key of the model you want to load by default.
export const VRMA_IDLE = `${PATH.VRMA_BASE}/idle.vrma`; // Default idle animation for the VRM model. Change this to the path of the VRMA file you want to use as the default idle animation.
export const VRMA_THINKING = `${PATH.VRMA_BASE}/thinking.vrma`; // Default thinking animation for the VRM model. Change this to the path of the VRMA file you want to use as the default thinking animation.

export const VOICE_EFFECT = new Audio(`${PATH.SOUNDS_BASE}/VOICE_EFFECT.ogg`);

export const FOLLOW_SPEED = 0.08; // camera follow speed, 0.0-1.0, higher is faster
export const SENSITIVITY = 0.2; // mouse drag sensitivity, 0.0-1.0, higher is more sensitive

export const MAX_YAW = 90;   // deg, left/right
export const MAX_PITCH = 90; // deg, up/down
export const SPRING_STIFFNESS = 40; // updateLookAt uses this for spring physics
export const SPRING_DAMPING = 20; // updateLookAt uses this for spring physics

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
export const REACTION_MESSAGES = [ // Messages that the model can say when reacting to user interactions, such as touching its head or hair.
  "Hey!",
  "Stop it!",
  "That tickles!",
  "Stop touching my head!",
  "Please don't touch my head!",
  "Don't touch my head!",
];

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