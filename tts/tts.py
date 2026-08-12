import logging, warnings, os, sys
logging.getLogger("huggingface_hub").setLevel(logging.ERROR)
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

from kokoro import KPipeline #type: ignore
import soundfile as sf
import subprocess
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import TTS_VOICE, TTS_PITCH #type: ignore

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

def generate_tts(text: str):
    generator = pipeline(text, voice=TTS_VOICE)
    for _, _, audio in generator:
        sf.write("./tts/output.wav", audio, 24000)
    pitch_audio("./tts/output.wav", TTS_PITCH)