import { loadModel, ws } from "./main.js";
import { onBoneTouch_old } from "./bone_touch.js";
import { sendPrompt, inputTextPlaceholder } from "./utils.js";
import { VRM } from "./vrm.js";
import { startRecording } from "./stt.js";
import {
    DEFAULT_MODEL_SETTINGS as DM, DEFAULT_SETTINGS as DS, // default model settings and default settings for the options in the settings menu
    CAMERA_SETTINGS, SENSITIVITY // camera settings for position and rotation, mouse drag sensitivity
} from "@config/config.js";

export let EVENTS = {
  dragging: null,
  is_left_clicking: null,
  is_typing_in_input: null,
  touch_old: true,
  mouse_tracking: null,
  ignore_mouse: null,
  mouse_x: undefined,
  mouse_y: undefined,
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function eventListeners(camera, getBodyMeshes, renderer, raycaster) {
  window.addEventListener("resize", () => {
    // Update camera aspect ratio and renderer size on window resize
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("pointerdown", (e) => {
    if (e.button === 2) {
      EVENTS.dragging = true;
      e.target.setPointerCapture?.(e.pointerId);
    }
    if (e.button !== 0) return;
    EVENTS.is_left_clicking = true;
    if (DS.touch_id) {
      onBoneTouch_old(camera, getBodyMeshes(), renderer.domElement, raycaster, e);
    }
  });

  document.addEventListener("pointerup", (e) => {
    if (e.button === 2) EVENTS.dragging = false;
    if (e.button !== 0) return;
    EVENTS.is_left_clicking = false;
  });

  document.addEventListener("pointermove", (e) => {
    if (!EVENTS.dragging) {
      if (DS.tracking_id && !EVENTS.mouse_tracking) EVENTS.mouse_tracking = true;
      EVENTS.mouse_x = e.clientX;
      EVENTS.mouse_y = e.clientY;
      return;
    }
  CAMERA_SETTINGS.rot_y = clamp(CAMERA_SETTINGS.rot_y + e.movementX * SENSITIVITY, -180, 180);
  CAMERA_SETTINGS.rot_x = clamp(CAMERA_SETTINGS.rot_x + e.movementY * SENSITIVITY, -90, 90);
  });

  document.addEventListener("wheel", (e) => {
    CAMERA_SETTINGS.zoom = clamp(CAMERA_SETTINGS.zoom + e.deltaY * 0.0025, 1, 10);
  });

  document.addEventListener("pointerleave", () => {
    if (DS.tracking_id) EVENTS.mouse_tracking = false;
  });

  document.addEventListener("pointerenter", () => {
    if (DS.tracking_id) EVENTS.mouse_tracking = false;
  });

  const inputEl = document.getElementById("user_prompt");
  if (inputEl) {
    const updateTypingState = (is_typing) => {
      EVENTS.is_typing_in_input = is_typing;
      if (!is_typing) {
        if (DS.tracking_id) EVENTS.mouse_tracking = true;
      }
    };
  
    inputEl.addEventListener("focus", () => updateTypingState(true));
    inputEl.addEventListener("blur", () => updateTypingState(false));
    inputEl.addEventListener("input", () => updateTypingState(true));
    inputEl.addEventListener("keydown", () => updateTypingState(true));
  }

  const send_prompt_btn = document.getElementById("send_prompt");
  const prompt_input = document.getElementById("user_prompt");
  if (send_prompt_btn) send_prompt_btn.addEventListener("click", () => sendPrompt(ws, VRM.vrm_path, `{"${DM.EXPRESSION_NAME}": ${DM.EXPRESSION_VALUE}}`, VRM.playing_music));
  if (prompt_input) prompt_input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendPrompt(ws, VRM.vrm_path, `{"${DM.EXPRESSION_NAME}": ${DM.EXPRESSION_VALUE}}`, VRM.playing_music);
    }
  });
  const music_btn = document.getElementById("music");
  if (music_btn) {
    music_btn.addEventListener("click", () => {
        DS.music_id = !DS.music_id;
        document.getElementById("music_id").textContent = DS.music_id ? "ON" : "OFF";
    });
  }
  const tracking_btn = document.getElementById("tracking");
  if (tracking_btn) {
    tracking_btn.addEventListener("click", () => {
        DS.tracking_id = !DS.tracking_id;
        document.getElementById("tracking_id").textContent = DS.tracking_id ? "ON" : "OFF";
    });
  }
  const react_to_touch_btn = document.getElementById("react_to_touch");
  if (react_to_touch_btn) {
    react_to_touch_btn.addEventListener("click", () => {
      DS.touch_id = !DS.touch_id;
      document.getElementById("touch_id").textContent = DS.touch_id ? "ON" : "OFF";
    });
  }
  const activate_stt_btn = document.getElementById("activate_stt");
  if (activate_stt_btn) {
      let holdTimer = null;
      let stopRecording = null;
      activate_stt_btn.addEventListener("pointerdown", async () => {
          holdTimer = setTimeout(async () => {
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
              stopRecording();
              stopRecording = null;
          }
      };
      activate_stt_btn.addEventListener("pointerup", release);
      activate_stt_btn.addEventListener("pointercancel", release);
      activate_stt_btn.addEventListener("pointerleave", release);
  }
  const reload_vrm_btn = document.getElementById("reload_vrm");
  if (reload_vrm_btn) {
    reload_vrm_btn.addEventListener("click", () => loadModel(VRM.vrm_path));
  }
}