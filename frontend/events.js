import { loadModel, ws } from "./main.js";
import { onBoneTouch_old } from "./bone_touch.js";
import { sendPrompt, inputTextPlaceholder } from "./utils.js";
import { VRM } from "./vrm.js";
import { startRecording } from "./stt.js";
import {
    DEFAULT_SETTINGS, DEFAULT_MODEL_SETTINGS,
    CAMERA_SETTINGS, SENSITIVITY
} from "@config/config.js";

export let EVENTS = {
  dragging: null,
  is_left_clicking: null,
  is_typing_in_input: null,
  touch_old: true,
  mouse_tracking: null,
  mouse_x: undefined,
  mouse_y: undefined,
};

export function eventListeners(camera, getBodyMeshes, renderer, raycaster) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("pointerdown", (e) => {
    if (e.button === 2) {
      EVENTS.dragging = true;
      e.target.setPointerCapture?.(e.pointerId);
    }
    if (e.button !== 0) return;
    EVENTS.is_left_clicking = true;
    if (DEFAULT_SETTINGS.touch_id) {
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
      if (DEFAULT_SETTINGS.tracking_id && !EVENTS.mouse_tracking) EVENTS.mouse_tracking = true;
      EVENTS.mouse_x = e.clientX;
      EVENTS.mouse_y = e.clientY;
      return;
    }
    CAMERA_SETTINGS.rot_y = Math.max(-180, Math.min(180, CAMERA_SETTINGS.rot_y + e.movementX * SENSITIVITY));
    CAMERA_SETTINGS.rot_x = Math.max(-90, Math.min(90, CAMERA_SETTINGS.rot_x + e.movementY * SENSITIVITY));
  });

  document.addEventListener("wheel", (e) => {
    CAMERA_SETTINGS.zoom = Math.max(1, Math.min(10, CAMERA_SETTINGS.zoom + e.deltaY * 0.0025));
  });

  document.addEventListener("pointerleave", () => {
    if (DEFAULT_SETTINGS.tracking_id) EVENTS.mouse_tracking = false;
  });

  document.addEventListener("pointerenter", () => {
    if (DEFAULT_SETTINGS.tracking_id) EVENTS.mouse_tracking = false;
  });

  const inputEl = document.getElementById("user_prompt");
  if (inputEl) {
    const updateTypingState = (is_typing) => {
      EVENTS.is_typing_in_input = is_typing;
      if (!is_typing) {
        if (DEFAULT_SETTINGS.tracking_id) EVENTS.mouse_tracking = true;
      }
    };
  
    inputEl.addEventListener("focus", () => updateTypingState(true));
    inputEl.addEventListener("blur", () => updateTypingState(false));
    inputEl.addEventListener("input", () => updateTypingState(true));
    inputEl.addEventListener("keydown", () => updateTypingState(true));
  }

  const send_prompt_btn = document.getElementById("send_prompt");
  const prompt_input = document.getElementById("user_prompt");
  if (send_prompt_btn) send_prompt_btn.addEventListener("click", () => sendPrompt(ws, VRM.vrm_path, `{"${DEFAULT_MODEL_SETTINGS.DEFAULT_EXPRESSION_NAME}": ${DEFAULT_MODEL_SETTINGS.DEFAULT_EXPRESSION_VALUE}}`));
  if (prompt_input) prompt_input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendPrompt(ws, VRM.vrm_path, `{"${DEFAULT_MODEL_SETTINGS.DEFAULT_EXPRESSION_NAME}": ${DEFAULT_MODEL_SETTINGS.DEFAULT_EXPRESSION_VALUE}}`);
    }
  });
  const tracking_btn = document.getElementById("tracking");
  if (tracking_btn) {
    tracking_btn.addEventListener("click", () => {
        DEFAULT_SETTINGS.tracking_id = !DEFAULT_SETTINGS.tracking_id;
        document.getElementById("tracking_id").textContent = DEFAULT_SETTINGS.tracking_id ? "ON" : "OFF";
    });
  }
  const react_to_touch_btn = document.getElementById("react_to_touch");
  if (react_to_touch_btn) {
    react_to_touch_btn.addEventListener("click", () => {
      DEFAULT_SETTINGS.touch_id = !DEFAULT_SETTINGS.touch_id;
      document.getElementById("touch_id").textContent = DEFAULT_SETTINGS.touch_id ? "ON" : "OFF";
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
    reload_vrm_btn.addEventListener("click", () => {
      VRM.vrma_action?.stop();
      VRM.vrma_action?.reset();
      loadModel(VRM.vrm_path);
    });
  }
}