import scipy.io.wavfile
print("Loading pocket_tts...")
from pocket_tts import TTSModel
from config import TTS_VOICE, TTS_OUTPUT

tts = TTSModel.load_model()
voice = tts.get_state_for_audio_prompt(TTS_VOICE)

def generate_tts(text: str):
    audio = tts.generate_audio(voice, text)
    scipy.io.wavfile.write(TTS_OUTPUT, tts.sample_rate, audio.numpy())