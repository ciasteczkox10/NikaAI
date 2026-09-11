import scipy.io.wavfile
print("Loading pocket_tts...")
#from pocket_tts import TTSModel
from pocket_tts_timestamped import TTSModel
import sys
from config import TTS_VOICE, TTS_OUTPUT

tts = TTSModel.load_model()
voice = tts.get_state_for_audio_prompt(TTS_VOICE)

def generate_tts(text: str):
    words = ""
    result = tts.generate_audio_with_timestamps(voice, text)
    scipy.io.wavfile.write(TTS_OUTPUT, tts.sample_rate, result.audio.numpy())
    return result.words
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python tts.py 'Text to synthesize'")
        sys.exit(1)
    text = " ".join(sys.argv[1:])
    words, timestamps = generate_tts(text)
    print(words)