import asyncio, websockets, re, sys, time
from openai import OpenAI, BadRequestError
from config import (
    API_KEY,
    BASE_URL, MODEL,
    SYSTEM_PROMPT,
    ALLOWED_VRM_MODELS,
    VRM_MODELS,
    ALLOWED_VRM_ANIMATIONS,
    VRM_ANIMATIONS,
    VRMA_BASE,
    PITCH
)

def print_usage():
    print("Usage: py main.py [--no-tts]")

use_tts = True
if len(sys.argv) > 2:
    print(f"Wrong argument(s): {' '.join(sys.argv[1:])}")
    print_usage()
    sys.exit(1)

if len(sys.argv) == 2:
    if sys.argv[1] == "--no-tts":
        use_tts = False
    else:
        print(f"Wrong argument: {sys.argv[1]}")
        print_usage()
        sys.exit(1)
if use_tts:
    from tts.tts import generate_tts

connected_vrm = set()
client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

messages = [{"role": "system", "content": SYSTEM_PROMPT}]

def chat(user_input: str) -> str:
    global messages
    try:
        messages.append({"role": "user", "content": user_input})
        res = client.chat.completions.create(
            model=MODEL,
            messages=messages,
        )
        llm_response = res.choices[0].message.content
        messages.append({"role": "assistant", "content": llm_response})
        return llm_response
    except BadRequestError:
        return "Bad Request Error"


async def broadcast(msg: str):
    for ws in connected_vrm:
        await ws.send(msg)


async def process_input(user_input: str, chat_ws):
    response = await asyncio.get_event_loop().run_in_executor(None, chat, user_input)

    tags = re.findall(r"\[(.*?)\]", response)
    reset = "reset" in tags
    anim = next((VRM_ANIMATIONS[t] for t in tags if t in ALLOWED_VRM_ANIMATIONS), None)

    llm_response_clean = re.sub(r"\[.*?\]", "", response).strip()
    print(f"llm_response:{response}")
    if use_tts:
        generate_tts(llm_response_clean, PITCH)

    await broadcast(f"llm_response:{llm_response_clean}")
    if use_tts:
        await broadcast(f"tts_audio:{llm_response_clean}")
    else:
        await broadcast(f"voice_effect:{llm_response_clean}")

    if reset:
        await broadcast("reset")
    elif anim:
        prefix = "play"
        await broadcast(f"{prefix}:{VRMA_BASE}{anim}")


async def handler_ws(ws):
    print("WebSocket connected")
    connected_vrm.add(ws)
    try:
        async for msg in ws:
            if msg.startswith("user_prompt:"):
                msg = msg.replace("user_prompt:", "")
                print(f"user_prompt:{msg}")
                connected_vrm.discard(ws)
                await process_input(msg, ws)

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
        asyncio.run(main())
    except Exception as e:
        print(e); input()