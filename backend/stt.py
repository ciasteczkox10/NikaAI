import tempfile, uvicorn, os
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
print("Loading Whisper...")
from faster_whisper import WhisperModel
from config import STT_LANGUAGE

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

model = WhisperModel("base", device="auto", compute_type="auto")


def transcribe(audio_bytes: bytes, suffix: str = ".webm") -> dict:
    """Transcribe raw audio bytes. Importable from main.py."""
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp:
        temp.write(audio_bytes)
        path = temp.name

    try:
        segments, info = model.transcribe(
            path, beam_size=5, vad_filter=True, language=STT_LANGUAGE,
            vad_parameters={"min_silence_duration_ms": 500}
        )
        text = " ".join(s.text.strip() for s in segments).strip()
        return {"text": text, "language": info.language}
    finally:
        os.remove(path)


@app.post("/transcribe")
async def transcribe_endpoint(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or ".webm")[1]
    return transcribe(await file.read(), suffix)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)