import * as THREE from "three";
import { VRM, showHeadTag, setExpression } from "./vrm.js";
import { FACE_TOUCH_BONES, REACTION_MESSAGES, DEFAULT_MODEL_SETTINGS as DM } from "@config/config.js";

const pointer = new THREE.Vector2();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 
Hair bones are auto-detected: any node whose name contains "hair"
(case-insensitive) is treated as a hair bone. Filled in dynamically the
first time createBoneColliders runs. Matching is by name only (not
obj.isBone) because some VRM secondary-chain nodes import as plain
Object3D rather than THREE.Bone, and requiring isBone silently skipped
them, leaving half the strands without colliders.
*/ 
export let HAIR_TOUCH_BONES = [];
const HAIR_NAME_RE = /^J_Sec_Hair\d+_\d+(_end)?$/i;

const TOUCH_BONE_NAMES = new Set(); // hair + face, rebuilt per model load

let activeColliders = [];
export function createBoneColliders(vrm, {
  radius = 0.018,
  debug = false,
  headBlockerRadius = 0.09,
  headBlockerOffset = new THREE.Vector3(0, 0.02, 0.01),
} = {}) {
  // remove any colliders from a previous call before building new ones
  activeColliders.forEach((c) => {
    c.parent?.remove(c);
    c.geometry?.dispose();
  });
  activeColliders = [];

  const colliders = [];
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    wireframe: true,
    visible: debug, // set true temporarily to see collider placement on the model
  });

  // Rebuild HAIR_TOUCH_BONES / TOUCH_BONE_NAMES from the actual model.
  HAIR_TOUCH_BONES = [];
  TOUCH_BONE_NAMES.clear();
  vrm.scene.traverse((obj) => {
    if (HAIR_NAME_RE.test(obj.name)) HAIR_TOUCH_BONES.push(obj.name);
  });
  HAIR_TOUCH_BONES.forEach((n) => TOUCH_BONE_NAMES.add(n));
  (FACE_TOUCH_BONES || []).forEach((n) => TOUCH_BONE_NAMES.add(n));

  vrm.scene.traverse((obj) => {
    if (!TOUCH_BONE_NAMES.has(obj.name)) return;

    const isEndNode = /_end$/i.test(obj.name);
    const childBone = obj.children.find((c) => TOUCH_BONE_NAMES.has(c.name) || c.isBone);
    let length, direction;

    if (childBone && childBone.position.lengthSq() > 1e-12) {
      length = childBone.position.length();
      direction = childBone.position.clone().normalize();
    } else if (isEndNode && obj.parent && obj.position.lengthSq() > 1e-12) {
      length = radius * 2;
      direction = obj.position.clone().normalize();
    } else if (obj.parent && obj.position.lengthSq() > 1e-12) {
      length = obj.position.length();
      direction = obj.position.clone().normalize();
    } else {
      length = radius * 2;
      direction = new THREE.Vector3(0, 1, 0);
    }

    const geo = new THREE.CapsuleGeometry(radius, Math.max(length - radius * 2, 0.001), 4, 6);
    const collider = new THREE.Mesh(geo, mat);
    collider.userData.bone = obj;

    if (childBone && childBone.position.lengthSq() > 1e-12) {
      collider.position.copy(childBone.position).multiplyScalar(0.5);
    }
    collider.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

    obj.add(collider);
    colliders.push(collider);
  });

  addBlocker(vrm, 'head', headBlockerRadius, headBlockerOffset, mat, colliders);
  addTorsoBlocker(vrm, mat, colliders);

  activeColliders = colliders;
  return colliders;
}

function addTorsoBlocker(vrm, mat, colliders, { radius = 0.13 } = {}) {
  const chest = vrm.humanoid?.getRawBoneNode?.('chest') ?? vrm.scene.getObjectByName('chest');
  const hips = vrm.humanoid?.getRawBoneNode?.('hips') ?? vrm.scene.getObjectByName('hips');
  if (!chest || !hips) return;

  vrm.scene.updateMatrixWorld(true); // force fresh world matrices before reading positions

  const hipsWorld = new THREE.Vector3();
  hips.getWorldPosition(hipsWorld);
  const hipsLocal = chest.worldToLocal(hipsWorld.clone());

  const length = hipsLocal.length();
  const direction = hipsLocal.clone().normalize();

  const geo = new THREE.CapsuleGeometry(radius, Math.max(length - radius * 2, 0.001), 4, 6);
  const blocker = new THREE.Mesh(geo, mat);
  blocker.position.copy(direction).multiplyScalar(length * 0.5);
  blocker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  blocker.scale.set(1.25, 1, 0.75); // oval: wide, shallow — not round
  blocker.userData.bone = chest;
  blocker.userData.isBlocker = true;
  chest.add(blocker);
  colliders.push(blocker);
}

function addBlocker(vrm, humanoidName, radius, offset, mat, colliders) {
  const bone = vrm.humanoid?.getRawBoneNode?.(humanoidName) ?? vrm.scene.getObjectByName(humanoidName);
  if (!bone) return;
  const geo = new THREE.SphereGeometry(radius, 8, 8);
  const blocker = new THREE.Mesh(geo, mat);
  blocker.position.copy(offset);
  blocker.userData.bone = bone;
  blocker.userData.isBlocker = true; // absorbs the ray, never counts as a hair hit
  bone.add(blocker);
  colliders.push(blocker);
}

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
      DM.EXPRESSION_NAME,
      DM.EXPRESSION_VALUE,
      250
    );
}

/*
Only ever raycasts the lightweight primitive colliders array (hair
capsules + head/chest/hips blockers) — never real skinned mesh geometry.
That's what keeps this fast; a torso/face click hits its blocker sphere
first (closest along the ray) and is ignored, with no lag, instead of
falling through to whatever hair capsule sits behind it.
*/
export function onBoneTouch_old(camera, colliders, domElement, raycaster, event) {
  const rect = domElement.getBoundingClientRect();
  const x = event.touches ? event.touches[0].clientX : event.clientX;
  const y = event.touches ? event.touches[0].clientY : event.clientY;

  pointer.x = ((x - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((y - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(colliders, false);
  if (hits.length === 0) return;

  const nearest = hits[0]; // intersectObjects returns hits sorted by distance
  if (nearest.object.userData.isBlocker) return; // torso/head absorbed the click

  const bone = nearest.object.userData.bone;
  if (HAIR_TOUCH_BONES.includes(bone.name)) {
    console.log('Touched hair bone:', bone.name);
    reactToTouch();
  }
}