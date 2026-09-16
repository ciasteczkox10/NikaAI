# NikaAI

![Python](https://img.shields.io/badge/Python-3.10-blue)
![Node.js](https://img.shields.io/badge/Node.js-required-green)
![License](https://img.shields.io/badge/License-MIT-lightgrey)
![Preview](preview.png)

NikaAI is a virtual anime character you can talk to via text or voice. She responds in real time with a tsundere personality, synced speech, and reactive 3D animations rendered in the browser.

## Features

- **Text & voice input** — chat via a text box, or hold the mic button to speak
- **Speech-to-text** — hold-to-record; audio is transcribed server-side with `faster-whisper` (Whisper base model) and sent back to the frontend input bar
- **Text-to-speech** — spoken responses with mouth sync (viseme-based lip sync); custom voice (`voice.safetensors`); disable with `--no-tts` for voice effects only
- **Tsundere personality** — short, dismissive, sarcastic replies defined via system prompt, fully customizable
- **Word-triggered animations & expressions** — the AI returns a per-word JSON structure (`{"response": [["word", {expression, animation, model}]]}`) so the character animates / changes expression exactly when a given word is spoken
- **AI-driven VRM model switching** — the AI can request a VRM avatar switch via the `model` field in its JSON response, in addition to manual switching
- **Music-reactive head bobbing** — when the OS reports music playing, Nika bobs her head to the beat
- **Cursor-tracking eyes and head** — gaze follows the mouse in real time with spring physics; head naturally follows eye movement; eyes look at the input bar when typing
- **Head-locked camera** — camera aims at the head bone so it stays centered as the character moves; right-drag to orbit, scroll to zoom in/out
- **Settings panel** — toggle in the bottom-left corner for manual model switching, mouse-tracking on/off, reaction to touch on/off, music bobbing, and VRM reload
- **Touch reactions** — click/tap the model's hair or face to trigger random voiced reactions with audio and angry expression
- **Auto-blinking** — natural random blink intervals
- **Thinking & idle animations** — plays `thinking.vrma` while AI processes; loops `idle.vrma` by default
- **Plug-and-play models & animations** — VRM models are auto-detected from `assets/models/<name>/model.vrm` with optional `metadata.json`; VRMA animations from `assets/vrma/` at startup; no manual registration required for models to appear in the selection menu
- **Session memory** — conversation context persists server-side in `backend/context.json` (max 50 messages)
- **Response cloud** — speech bubble next to the character's head showing: greeting on load ("Hi, I'm Nika"), "Nika is thinking..." while AI processes, AI responses, and voiced reactions when touching hair/face
- **Stack** — Python backend (WebSocket on `:8766`; TTS and STT run **in-process**, not as separate servers), Three.js + `@pixiv/three-vrm` frontend, `Pocket-tts` for TTS, `faster-whisper` for STT

## Architecture

```
NikaAI/
├── backend/
│   ├── main.py          # WebSocket server (8766), orchestration, flags
│   ├── ai.py            # LLM client (OpenAI-compatible)
│   ├── tts.py           # Text-to-speech (pocket_tts_timestamped), in-process
│   ├── stt.py           # Speech-to-text (faster-whisper), in-process
│   ├── music.py         # Music detection (cross-platform: winsdk/dbus/MediaRemote)
│   ├── context.py       # Session memory (max 50 messages)
│   ├── context.json     # persisted session memory
│   └── voices/voice.safetensors   # TTS voice
├── config/
│   ├── config.py        # env vars, VRM/VRMA auto-discovery, SYSTEM_PROMPT
│   ├── config.js        # JS-side config loader
│   └── config.json      # user-editable defaults (model, idle/greeting/thinking, settings, expressions)
├── assets/
│   ├── models/<name>/model.vrm   # VRM avatars, auto-detected
│   ├── vrma/            # animations
│   └── sounds/          # pre-generated touch-reaction audio
├── frontend/
│   ├── main.js          # WS client, scene setup, animation loop
│   ├── vrm.js           # VRM loading, expressions, animations, look-at, head bobbing
│   ├── audio.js         # TTS/effect playback, lip sync
│   ├── bone_touch.js    # hair/face touch detection (colliders)
│   ├── events.js        # mouse/keyboard/UI event listeners
│   ├── stt.js           # mic recording
│   ├── utils.js         # model buttons, prompt sending
│   └── index.html
├── run.bat / run.sh
└── .env
```

**Flow:** frontend records mic audio → binary bytes sent over the WebSocket (`:8766`) → transcribed in-process by `faster-whisper` → text returned to the input bar → user sends text over the WebSocket → backend queries the LLM → LLM returns `{"response": [["word", {expression, animation, model}], ...]}` JSON → backend TTS-synthesizes the reply and broadcasts the response with per-word timestamps → frontend plays audio + drives lip sync/animation → response text shown in the cloud.

**Communication:** a single WebSocket at `:8766` carries JSON text messages, binary audio (STT), and prefixed strings. There is no `cmd:arg` protocol and no Flask server. TTS and STT run inside the backend process (the FastAPI STT app in `stt.py` is only used if you run that file directly; the main flow imports `transcribe` in-process).

## Configuration

`config/config.json` holds user-editable defaults so you don't have to touch code:
- `model` — default model name, idle/greeting/thinking animation, text, expression, and `ignored_animations` (animations hidden from the AI's allowed list, e.g. `idle`/`thinking`)
- `settings` — toggles for music bobbing, touch reactions, mouse tracking
- `base` — asset folder paths (vrm/vrma/sounds)
- `custom_expressions` — named blends of base expression weights (e.g. `annoyed`)

`config/config.py` handles env vars, VRM/VRMA auto-discovery, and `SYSTEM_PROMPT`.

## Requirements

- Python 3.10 (required for torch/onnxruntime compatibility)
- Node.js / npm
- CPU-only — no GPU required

## Installation

### Windows

```bash
npm install
py -3.10 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### Linux/macOS

```bash
npm install
python3.10 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Create a `.env` file in the project root:

```env
API_KEY=your_api_key
BASE_URL=your_base_url
MODEL=your_model
```

Works with any OpenAI-compatible API, including local LLMs.

### Add models:

Place VRM files in `assets/models/<name>/model.vrm` (e.g. `assets/models/nika/model.vrm`). Optional `metadata.json` in the same folder can provide additional info.

### Add animations:

Drop `.vrma` files into `assets/vrma/` (e.g. `assets/vrma/idle.vrma`).

### Launch the app:

**Recommended:**

```bash
run.bat     # Windows
./run.sh    # Linux/macOS
```

**Or launch manually** — the backend MUST be invoked as a module (it uses relative imports, so running `backend/main.py` as a plain script will fail):

#### Windows

```bash
npx vite
.venv\Scripts\python.exe -m backend.main
```

#### Linux/macOS

```bash
npx vite
.venv/bin/python -m backend.main
```

## Common Flags

```bash
python -m backend.main --no-tts   # Disable TTS (voice effects only)
python -m backend.main --no-stt   # Disable speech-to-text
```

## License

MIT — do whatever you want with it.