import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
print("Loading config...")
import asyncio, websockets, sys, json
from .ai import chat
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

async def process_input(current_model: str, current_expression: dict, user_input: str):
    user_prompt = {
        "current_model": current_model,
        "current_expression": current_expression,
        "user_prompt": user_input
    }
    print(f"user_prompt:\n{user_prompt}")

    response = await asyncio.get_event_loop().run_in_executor(None, chat, json.dumps(user_prompt))

    print(f"llm_response:\n{response}")

    llm_response = response.get("response", "")

    expression = response.get("expression") or {}
    name = expression.get("expression_name", "")
    value = expression.get("expression_value", 0)
    duration = expression.get("expression_duration", 0)

    animation = response.get("animation")
    model = response.get("model")
    
    if use_tts:
        generate_tts(llm_response)

    await broadcast(f"llm_response:{llm_response}")

    audio_type  = "tts_audio:" if use_tts else "no_tts_audio:"
    await broadcast(f"{audio_type}{llm_response}")
    if expression: await broadcast(f"expression:{name}:{value}:{duration}")
    if animation: await broadcast(f"animation:{animation}")
    if model: await broadcast(f"model:{model}")

async def handler_ws(ws):
    print("WebSocket connected")
    connected_vrm.add(ws)
    try:
        async for msg in ws:
            if isinstance(msg, bytes):
                result = transcribe(msg)
                await broadcast(f"stt_result:{result['text']}")
                continue
            if msg.startswith("current_model:"):
                current_model = msg.replace("current_model:", "")
            if msg.startswith("current_expression:"):
                current_expression = json.loads(msg.replace("current_expression:", ""))
            if msg.startswith("user_prompt:"):
                user_input = msg.replace("user_prompt:", "")
                await process_input(current_model, current_expression, user_input)

    except Exception as e:
        print("WebSocket disconnected:", e)

    finally:
        connected_vrm.discard(ws)

async def main():
    async with websockets.serve(handler_ws,  "0.0.0.0", 8766):
        await asyncio.Future()

if __name__ == "__main__":
    try:
        print("TTS Enabled" if use_tts else "TTS Disabled")
        print("STT Enabled" if use_stt else "STT Disabled")
        print(SYSTEM_PROMPT)
        asyncio.run(main())
    except Exception as e:
        print(e); input()