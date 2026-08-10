import logging

logging.getLogger("huggingface_hub").setLevel(logging.ERROR)

import warnings
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

from kokoro import KPipeline #type: ignore
import soundfile as sf
import subprocess

pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")

def pitch_audio(input_file: str, pitch: float):
    subprocess.run([
        "ffmpeg",
        "-y",
        "-loglevel", "quiet",
        "-i", input_file,
        "-filter:a", f"asetrate=24000*{pitch},aresample=24000,atempo={1/pitch}",
        "./tts/output.wav"
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def generate_tts(text: str, pitch: float):
    generator = pipeline(text, voice="af_sarah")
    for _, _, audio in generator:
        sf.write("./tts/output.wav", audio, 24000)
    pitch_audio("./tts/output.wav", pitch)