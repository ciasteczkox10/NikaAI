import os, time
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
START = time.perf_counter()
print("Loading config...")
import asyncio, websockets, sys, json
from .ai import chat
from .music import detect_music, playing
from config import SYSTEM_PROMPT
use_tts, use_stt = True, True

valid_flags = {"--no-tts", "--no-stt"}
args = sys.argv[1:]

if len(args) > 2 or any(a not in valid_flags for a in args) or len(set(args)) != len(args):
    print(f"Wrong argument(s): {' '.join(args)}")
    print("Usage: py main.py [--no-tts] [--no-stt]")
    sys.exit(1)

if "--no-tts" in args:
    use_tts = False
if "--no-stt" in args:
    use_stt = False

if use_stt:
    from .stt import transcribe
if use_tts:
    from .tts import generate_tts

connected_vrm = set()

async def broadcast(msg: str):
    for ws in connected_vrm:
        await ws.send(msg)

async def process_input(data):
    user_prompt = {
        "current_model": data.model,
        "current_expression": data.expression,
        "playing_music": data.music,
        "user_prompt": data.message
    }
    print(f"user_prompt:\n{user_prompt}")
    
    response = await asyncio.get_event_loop().run_in_executor(None, chat, json.dumps(user_prompt))
    word_actions = response.get("response", [])
    clean_text = " ".join(word for word, action in word_actions)

    timestamps = generate_tts(clean_text) if use_tts else []

    audio_type = "tts_audio" if use_tts else "no_tts_audio"
    response["audio"] = {
        "type": audio_type,
        "timestamps": [
            {
                "word": w.word,
                "start_time": w.start_time,
                "end_time": w.end_time,
                "action": word_actions[i][1] if i < len(word_actions) else None,
            }
            for i, w in enumerate(timestamps)
        ],
    }
    response["response"] = clean_text
    print(f"llm_response:\n{response}")


    await broadcast(json.dumps(response))

ATTRIBUTES = [
    "model",
    "expression",
    "music",
    "message"
]
class AI_Inputs:
    def __init__(self):
        for attribute in ATTRIBUTES:
            setattr(self, attribute, None)
    def __call__(self, data):
        for k, v in data.items():
            if k in ATTRIBUTES:
                try: v = json.loads(v)
                except json.JSONDecodeError: pass
                setattr(self, k, v)
        return self

async def handler_ws(ws):
    print("WebSocket connected")
    connected_vrm.add(ws)
    await broadcast(json.dumps(playing))
    try:
        async for msg in ws:
            if isinstance(msg, bytes):
                result = transcribe(msg)
                await broadcast(json.dumps({"stt_result": result['text']}))
                continue
            try:
                data = json.loads(msg)
            except json.JSONDecodeError:
                print("Error parsing JSON:")
                await broadcast(json.dumps({"error": "Invalid JSON"}))
                continue

            class_data = AI_Inputs()
            await process_input(class_data(data))

    except Exception as e:
        print("WebSocket disconnected:", e)

    finally:
        connected_vrm.discard(ws)

async def main():
    music = asyncio.create_task(detect_music(broadcast))
    try:
        async with websockets.serve(handler_ws, "0.0.0.0", 8766):
            await asyncio.Future()
    except asyncio.CancelledError:
        pass
    finally:
        music.cancel()
        try:
            await music
        except asyncio.CancelledError:
            pass

if __name__ == "__main__":
    print("TTS Enabled" if use_tts else "TTS Disabled")
    print("STT Enabled" if use_stt else "STT Disabled")
    print(SYSTEM_PROMPT)
    print(f"Startup time: {time.perf_counter() - START:.2f}s")
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Saving context and Quitting...")
        chat("", save=True)