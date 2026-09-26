let audio_ctx;
let analyser;
let freq_data;
function getaudio_ctx() {
  if (!audio_ctx) {
    audio_ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audio_ctx.createAnalyser();
    analyser.fftSize = 256;
    freq_data = new Uint8Array(analyser.frequencyBinCount);
  }
  if (audio_ctx.state === "suspended") audio_ctx.resume();
  return audio_ctx;
}

let playing_voice_effect;
let current_voice_audio;
let current_voice_playback_id = 0;
let displayedText = "";

const VISEMES = ["aa", "ih", "ou", "ee", "oh"];
const VOWEL_TO_VISEME = { a: "aa", e: "ee", i: "ih", o: "oh", u: "ou" };
let currentViseme = "aa";

function pickViseme(word) {
  const vowels = (word || "").toLowerCase().match(/[aeiou]/g);
  if (!vowels) return "aa";
  return VOWEL_TO_VISEME[vowels[0]] || "aa";
}

export async function playAudio({ type, path = null, timestamps = null, response = null, ignore_hide = false, updateHeadTag, ResponseHandler }) {
  const src = type === "tts_audio" ? `./output.wav?t=${Date.now()}`
            : type === "no_tts_audio" ? path
            : null;
  if (!src) return;
  displayedText = "";

  if (current_voice_audio) {
    current_voice_audio.pause();
    current_voice_audio.currentTime = 0;
    current_voice_audio = null;
  }

  const audio = new Audio(src);
  const playbackId = ++current_voice_playback_id;

  const ctx = getaudio_ctx();
  const source = ctx.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(ctx.destination);

  current_voice_audio = audio;
  playing_voice_effect = true;

  let syncInterval = null;
  let lastWord = null;
  let hideTagTimeout = null;

  if (timestamps && response) {
    const responseWords = response.split(" ");
    timestamps.forEach((ts, i) => {
      ts.word = responseWords[i] ?? ts.word;
    });
  }

  try {
    await new Promise((resolve) => {
      if (audio.readyState >= 1) resolve();
      else audio.addEventListener("loadedmetadata", resolve, { once: true });
    });
    await audio.play();

    if (!ignore_hide && Number.isFinite(audio.duration) && audio.duration > 0) {
      const hideDelay = (audio.duration + audio.duration * 0.5) * 1000;
      hideTagTimeout = setTimeout(() => updateHeadTag(null), hideDelay);
    }

    if (timestamps && timestamps.length) {
      syncInterval = setInterval(() => {
        const t = audio.currentTime;
        const current = timestamps.find(w => t >= w.start_time && t < w.end_time);
        if (current && current.word !== lastWord) {
          displayedText += (displayedText ? " " : "") + current.word;
          updateHeadTag(displayedText)
          lastWord = current.word;
          currentViseme = pickViseme(current.word);

          if (current.action) {
            ResponseHandler(current.action);
          }
        }
      }, 50);
    } else if (type === "no_tts_audio") {
      // No word timing available, cycle viseme randomly while it plays
      syncInterval = setInterval(() => {
        currentViseme = VISEMES[Math.floor(Math.random() * VISEMES.length)];
      }, 100);
    }

    await new Promise((resolve) =>
      audio.addEventListener("ended", resolve, { once: true })
    );
  } catch (error) {
    console.log("Audio playback error:", error);
  } finally {
    if (syncInterval) clearInterval(syncInterval);
    if (hideTagTimeout) clearTimeout(hideTagTimeout);
    if (playbackId === current_voice_playback_id) {
      current_voice_audio = null;
      playing_voice_effect = false;
    }
    source.disconnect();
  }
}

let mouthValue = 0;
export function updateLipSync(vrm) {
  if (!vrm?.expressionManager) return;

  const speaking = playing_voice_effect && current_voice_audio && analyser;

  if (speaking) {
    analyser.getByteFrequencyData(freq_data);
    const avg = freq_data.reduce((a, b) => a + b, 0) / freq_data.length;
    const target = Math.min(1, avg / 80);
    mouthValue += (target - mouthValue) * 0.4;
  } else {
    mouthValue += (0 - mouthValue) * 0.4;
  }

  VISEMES.forEach(v => vrm.expressionManager.setValue(v, v === currentViseme ? mouthValue : 0));
}