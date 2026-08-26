# NikaAI

![Python](https://img.shields.io/badge/Python-3.10-blue)
![Node.js](https://img.shields.io/badge/Node.js-required-green)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

NikaAI is a virtual anime character you can talk to via text or voice. She responds in real time with a tsundere personality, synced speech, and reactive 3D animations rendered in the browser.

## Features

- **Text & voice input** — chat via a text box, or hold the mic button to speak
- **Speech-to-text** — hold-to-record; audio is transcribed server-side with `faster-whisper` and the text is sent back to the frontend input bar
- **Text-to-speech** — spoken responses with mouth sync; disable with `--no-tts` for voice effects only
- **Tsundere personality** — short, dismissive, sarcastic replies defined via system prompt, fully customizable
- **JSON-driven animations & expressions** — the AI responds with structured JSON (`{"response", "animation", "expression", "model"}`) that drives character animations and facial expressions directly, with current expression status tracked and passed back to the AI each turn
- **AI-driven VRM model switching** — the AI can request a VRM avatar switch via the `model` field in its JSON response, in addition to manual switching
- **Cursor-tracking eyes and head** — gaze follows the mouse in real time, with the head naturally following the eye movement
- **Head-locked camera** — camera aims at the head bone, so it stays centered as the character moves; drag to orbit, scroll to zoom in/out
- **Settings panel** — toggle in the bottom-left corner for manual model switching, mouse-tracking on/off, reaction to touch on/off and VRM reload
- **Plug-and-play models** — VRM/VRMA files are auto-detected for the AI; register a model in `VRM_MODELS` (name → path) to also make it manually selectable from the settings panel
- **Session memory** — conversation context persists server-side for the session
- **Stack** — Python backend, Three.js + three-vrm frontend, `Pocket-tts` for TTS, `faster-whisper` STT

## Requirements
- Python 3.10
- Node.js / npm

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

### Launch the app:

**Recommended:**

```bash
run.bat     # Windows
./run.sh    # Linux/macOS
```

**Or launch manually**

#### Windows
```bash
npx vite
.venv\Scripts\python.exe main.py
```

#### Linux/macOS
```bash
npx vite
.venv/bin/python main.py
```

## License

MIT — do whatever you want with it.