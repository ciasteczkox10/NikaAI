const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function buildModelButtons(VRM_MODELS, loadVRM) {
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
        button.addEventListener("click", () => loadVRM(modelPath));

        item.appendChild(button);

        fragment.appendChild(item);
    });

    if (fragment.childNodes.length) {
        list.insertBefore(fragment, list.firstElementChild);
    }
}
export function sendPrompt(ws, current_model_name) {
    // Send the user's prompt to the server via WebSocket, if the WebSocket is open and the input field has a value
    const input = document.getElementById("user_prompt");
    if (!input.value || !ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }
    ws.send("current_model:" + current_model_name);
    ws.send("user_prompt:" + input.value);
    window.dispatchEvent(new Event("thinking"));
    console.log("User:", input.value);
    input.value = "";
}
export function resetLookAt(vrm, look_at_velocity) {
    // Reset the VRM model's look-at behavior and velocity
    if (!vrm?.lookAt?.reset) return;
    vrm?.lookAt?.reset();
    look_at_velocity.set(0, 0, 0);
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
export async function autoBlink(vrm) {
    // Automatically animate the VRM model's blink expression at random intervals, creating a natural blinking effect
    if (!vrm) return;
    while (true) {
        await sleep(2500 + Math.random() * 3000);
        if (vrm) await expressionAnimate(vrm, "blink", 1.0);
    }
}
export function inputTextPlaceholder(inputEl, placeholderText) {
    // Set the placeholder text for an input bar element, if it exists
    if (!inputEl) return;
    inputEl.placeholder = placeholderText;
}