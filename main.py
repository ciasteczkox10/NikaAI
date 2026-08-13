import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
os.environ["OMP_NUM_THREADS"] = "1"
import asyncio, websockets, sys, json
from openai import OpenAI, BadRequestError
from context import load_context, save_context, get_messages_with_system
from config import (
    API_KEY,
    BASE_URL, MODEL,
    SYSTEM_PROMPT,
    ALLOWED_VRM_MODELS,
    VRM_MODELS,
    ALLOWED_VRM_ANIMATIONS,
    VRM_ANIMATIONS,
    VRMA_BASE
)

def print_usage():
    print("Usage: py main.py [--no-tts] [--no-stt]")

use_tts, use_stt = True, True

valid_flags = {"--no-tts", "--no-stt"}
args = sys.argv[1:]

if len(args) > 2 or any(a not in valid_flags for a in args) or len(set(args)) != len(args):
    print(f"Wrong argument(s): {' '.join(args)}")
    print_usage()
    sys.exit(1)

if "--no-tts" in args:
    use_tts = False
if "--no-stt" in args:
    use_stt = False

if use_tts:
    from tts.tts import generate_tts
if use_stt:
    from stt.stt import transcribe

connected_vrm = set()
client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
current_model = None

messages = load_context()

def chat(user_input: str) -> str:
    global messages
    try:
        messages.append({"role": "user", "content": user_input})
        res = client.chat.completions.create(
            model=MODEL,
            messages=get_messages_with_system(messages),
        )
        llm_response = res.choices[0].message.content
        messages.append({"role": "assistant", "content": llm_response})
        save_context(messages)
        for msg in messages:
            print(f"{msg['role']}: {msg['content']}")
        return json.loads(llm_response)
    except BadRequestError:
        return "Bad Request Error"


async def broadcast(msg: str):
    for ws in connected_vrm:
        await ws.send(msg)


async def process_input(current_model: str, user_input: str):
    user_prompt = {
        "current_model": current_model,
        "user_prompt": user_input
        }
    #print(f"user_prompt: {user_prompt}")
    llm_response = animation = model = None

    response = await asyncio.get_event_loop().run_in_executor(None, chat, user_input)

    if response.get("response"):
        llm_response = response["response"]
    if response.get("animation"):
        animation = response["animation"]
    if response.get("model"):
        model = response["model"]


    #print(f"llm_response:\n{response}")
    if use_tts: generate_tts(llm_response)

    await broadcast(f"llm_response:{llm_response}")

    audio_type  = "tts_audio:" if use_tts else "voice_effect:"
    await broadcast(f"{audio_type}{llm_response}")

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
            if msg.startswith("user_prompt:"):
                user_input = msg.replace("user_prompt:", "")
                await process_input(current_model, user_input)

    except Exception as e:
        print("WebSocket disconnected:", e)

    finally:
        connected_vrm.discard(ws)


async def main():
    print("WS → ws://localhost:8766")
    async with websockets.serve(handler_ws,  "0.0.0.0", 8766):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        print(SYSTEM_PROMPT)
        print("MODELS:\n" + ALLOWED_VRM_MODELS)
        print("ANIMATIONS:\n" + ALLOWED_VRM_ANIMATIONS)
        print("TTS Enabled" if use_tts else "TTS Disabled")
        print("STT Enabled" if use_stt else "STT Disabled")
        asyncio.run(main())
    except Exception as e:
        print(e); input()