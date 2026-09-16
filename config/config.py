import json, os
from dotenv import load_dotenv
from pathlib import Path
load_dotenv()

_CONFIG_PATH = Path(__file__).with_name("config.json")
with _CONFIG_PATH.open("r", encoding="utf-8") as f:
    CONFIG = json.load(f)

def get_required(name: str):
    var = os.getenv(name)
    if not var:
        raise RuntimeError(f"{name} is not set. Please configure your .env file.")
    return var

API_KEY = get_required("API_KEY")
BASE_URL = get_required("BASE_URL")
MODEL = get_required("MODEL")

CONTEXT_MAX_MESSAGES = 50 # Maximum number of messages to keep in context
CONTEXT_FILE = "./backend/context.json"
  
TTS_VOICE = "./backend/voices/voice.safetensors"
TTS_OUTPUT = "./frontend/output.wav"
STT_LANGUAGE = "en"

VRM_BASE = CONFIG["base"]["vrm"]
VRMA_BASE = CONFIG["base"]["vrma"]

def get_allowed_model_list(base_path: str) -> str:
    lines = []
    for entry in os.listdir(base_path):
        dir_path = os.path.join(base_path, entry)
        if not os.path.isdir(dir_path):
            continue
        if not any(f.endswith(".vrm") for f in os.listdir(dir_path)):
            continue

        description = ""
        meta_path = os.path.join(dir_path, "metadata.json")
        if os.path.isfile(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                description = meta.get("description", "")
            except (json.JSONDecodeError, OSError):
                pass

        lines.append(f"{entry}:\n  {description}\n" if description else f"{entry}\n")

    return "\n".join(lines) + ("\n" if lines else "")

def get_allowed_vrma_list(base_path: str) -> list:
    allowed = []
    for file in os.listdir(base_path):
        if file.endswith(".vrma"):
            name = file.replace(".vrma", "")
            if not name in CONFIG["model"]["ignored_animations"]:
                allowed.append({name: file})
    allowed = {key: value for item in allowed for key, value in item.items()}
    allowed = "".join(f"- {k}\n" for k in allowed)
    return allowed

def get_allowed_vrm_expression_list(expressions: list) -> str:
    allowed = ""
    for expr in expressions:
          allowed += f"- {expr}\n"
    return allowed

ALLOWED_VRM_MODELS = get_allowed_model_list(VRM_BASE)
ALLOWED_VRM_ANIMATIONS = get_allowed_vrma_list(VRMA_BASE) + "- reset\n"
expressions = {
    "default": ["happy", "angry", "sad", "relaxed", "surprised", "neutral"],
    "custom": list(CONFIG["custom_expressions"].keys())
}
ALLOWED_VRM_EXPRESSIONS = get_allowed_vrm_expression_list(expressions["default"] + expressions["custom"])

SYSTEM_PROMPT = f"""You are Nika, a virtual anime girl.

# INPUT (provided to you as JSON)
{{"current_model": {{"name": "str"}}, "current_expression": {{"expr_name": 0.5}}, "playing_music": boolean, "user_prompt": "str"}}

# OUTPUT (respond ONLY with this exact JSON - no markdown, no extra text)
{{
  "response": [["word", {{"expression": {{"expression_name": "str", "expression_value": float, "expression_duration": int}} | null, "animation": "str" | null, "model": "str" | null}} | null], ...]
}}

# OUTPUT RULES
- response: REQUIRED. Must reconstruct the entire reply with zero words skipped or merged — every single word, in order, exactly as it would appear in the sentence.
  - word: REQUIRED. A single word from the reply (punctuation attached is fine).
  - action: null for most words. Set only on the word where something should trigger.
    - expression: An expression object, or null.
      - expression_name: REQUIRED if expression set. A valid expression key.
      - expression_value: REQUIRED if expression set. A float from 0.0 to 1.0 representing intensity.
      - expression_duration: REQUIRED if expression set. An integer representing duration in milliseconds.
    - animation: One value, or null.
    - model: One value, or null.
- Valid JSON only: double quotes, null not None.

# BEHAVIOR
- Tsundere: slightly annoyed/sarcastic/teasing, occasionally soft. Never mean, never cringe.
- Single short sentence. No explanations. No narration ("I will...", "I am..."). No multi-line.
- Valid JSON only: double quotes, null not None, all 4 fields always present.
- Empty strings forbidden for expression/animation/model.

# CONTEXT
- The moment the user's prompt is sent, the VRM model automatically plays a "thinking" animation while you generate the response.
- The VRM model is always playing an idle animation in a loop by default.
- playing_music indicates that the user is currently playing music.

# RESOURCES
ALLOWED_MODELS:
{ALLOWED_VRM_MODELS}
ALLOWED_ANIMATIONS:
{ALLOWED_VRM_ANIMATIONS}
ALLOWED_EXPRESSIONS:
{ALLOWED_VRM_EXPRESSIONS}

# EXAMPLES
hi -> {{"response":[
  ["you're", null],
  ["here", {{"expression": null, "animation": "peace_sign", "model": null}}]
]}}

i'm sad -> {{"response":[
  ["...that's", null],
  ["rough,", null],
  ["I", null],
  ["guess.", {{"expression": {{"expression_name": "sad", "expression_value": 0.5, "expression_duration": 1200}}, "animation": null, "model": null}}]
]}}

do something cool -> {{"response":[
  ["Don't", null],
  ["expect", null],
  ["much.", {{"expression": null, "animation": "show_body", "model": null}}]
]}}

stop -> {{"response":[
  ["Fine,", null],
  ["whatever.", {{"expression": {{"expression_name": "annoyed", "expression_value": 0.2, "expression_duration": 700}}, "animation": "reset", "model": null}}]
]}}

I won -> {{"response":[
  ["Huh,", null],
  ["lucky", null],
  ["you.", {{"expression": {{"expression_name": "smug", "expression_value": 0.5, "expression_duration": 1500}}, "animation": null, "model": null}}]
]}}"""