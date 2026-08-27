import json, os
from config import SYSTEM_PROMPT, CONTEXT_MAX_MESSAGES, CONTEXT_FILE

def load_context():
    if not CONTEXT_FILE or not os.path.exists(CONTEXT_FILE):
        return []
    try:
        with open(CONTEXT_FILE, "r", encoding="utf-8") as f:
            messages = json.load(f)
        if not isinstance(messages, list):
            return []
        return messages
    except (json.JSONDecodeError, OSError):
        return []
def save_context(messages):
    if not CONTEXT_FILE:
        return
    # Never save the system prompt
    messages_to_save = [
        msg for msg in messages
        if msg.get("role") != "system"
    ]
    # Keep only the most recent messages
    messages_to_save = messages_to_save[-CONTEXT_MAX_MESSAGES:]
    with open(CONTEXT_FILE, "w", encoding="utf-8") as f:
        json.dump(
            messages_to_save,
            f,
            ensure_ascii=False,
            indent=2
        )
def get_messages_with_system(messages):
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        *messages
    ]