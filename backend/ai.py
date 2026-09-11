import json
print("Loading OpenAI...")
from openai import OpenAI, BadRequestError
from .context import load_context, save_context, get_messages_with_system
from config import API_KEY, BASE_URL, MODEL

messages = load_context()

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
def chat(user_prompt: str, save: bool = False) -> str:
    global messages
    if save:
        try:
            save_context(messages)
        except Exception as e:
            print(f"Error saving context: {e}")
        return
    else:
        try:
            messages.append({"role": "user", "content": user_prompt})
            res = client.chat.completions.create(
                model=MODEL,
                messages=get_messages_with_system(messages),
            )
            llm_response = res.choices[0].message.content
            messages.append({"role": "assistant", "content": llm_response})
            save_context(messages)
            return json.loads(llm_response)
        except BadRequestError:
            return "Bad Request Error"