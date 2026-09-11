import { VRM_MODELS, VRM_METADATA } from "@config/config.js";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function buildModelButtons(VRM_MODELS, loadModel, default_settings) {
    Object.entries(default_settings).forEach(([key, value]) => {
        const el = document.getElementById(key);
        if (el) el.textContent = (value === true ? "ON" : value === false ? "OFF" : value);
    });
    // Build a list of buttons for each VRM model in the VRM_MODELS object and attach click event listeners to load the corresponding model
    const list = document.getElementById("myList");
    if (!list) return;

    const fragment = document.createDocumentFragment();

    Object.entries(VRM_MODELS).forEach(([modelName, modelPath]) => {
        const buttonId = modelName.toLowerCase();
        if (document.getElementById(buttonId)) return;

        const item = document.createElement("li");
        const button = document.createElement("button");
        button.id = buttonId;
        button.textContent = modelName;
        button.addEventListener("click", () => loadModel(modelPath));

        item.appendChild(button);

        fragment.appendChild(item);
    });

    if (fragment.childNodes.length) {
        list.insertBefore(fragment, list.firstElementChild);
    }
}
export function sendPrompt(ws, model_path, expression, playing_music) {
    // Send the user's prompt to the server via WebSocket, if the WebSocket is open and the input field has a value
    const input = document.getElementById("user_prompt");
    if (!input.value || !ws || ws.readyState !== WebSocket.OPEN) return;
    const model_name = Object.keys(VRM_MODELS).find(k => VRM_MODELS[k] === model_path);
    const model_info = {
        "name": VRM_METADATA[model_name].name || ""
    }
    const data = {
        "model": JSON.stringify(model_info),
        "expression": expression,
        "music": JSON.stringify(playing_music),
        "message": input.value
    }
    window.dispatchEvent(new Event("thinking_start"));
    ws.send(JSON.stringify(data))
    console.log("User:", input.value);
    input.value = "";
}

export function inputTextPlaceholder(inputEl, placeholderText) {
    // Set the placeholder text for an input bar element, if it exists
    if (!inputEl) return;
    inputEl.placeholder = placeholderText;
}