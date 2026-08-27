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
export async function playAudio(type, path = null, wordsDict = null, words = null, ACTIONS = null) {
  const src = type === "TTS" ? `${path ?? "./output.wav"}?t=${Date.now()}` : path;
  if (!src) return;

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

  let stopSync = null;

  try {
    await audio.play();
    if (wordsDict && words && ACTIONS) {
      stopSync = syncActions(audio, wordsDict, words, ACTIONS);
    }
    await new Promise((resolve) =>
      audio.addEventListener("ended", resolve, { once: true })
    );
  } catch (error) {
    console.log("Audio playback error:", error);
  } finally {
    if (stopSync) stopSync();
    if (playbackId === current_voice_playback_id) {
      current_voice_audio = null;
      playing_voice_effect = false;
    }
    source.disconnect();
  }
}

const VISEMES = ["aa", "ih", "ou", "ee", "oh"];
let currentViseme = "aa";
let visemeSwapTimer = 0;
let mouthValue = 0;
export function updateLipSync(vrm, dt) {
  if (!vrm?.expressionManager) return;

  const speaking = playing_voice_effect && current_voice_audio && analyser;

  if (speaking) {
    analyser.getByteFrequencyData(freq_data);
    const avg = freq_data.reduce((a, b) => a + b, 0) / freq_data.length;
    const target = Math.min(1, avg / 80);
    mouthValue += (target - mouthValue) * 0.4;

    visemeSwapTimer -= dt;
    if (visemeSwapTimer <= 0) {
      VISEMES.forEach(v => vrm.expressionManager.setValue(v, 0));
      currentViseme = VISEMES[Math.floor(Math.random() * VISEMES.length)];
      visemeSwapTimer = 0.08 + Math.random() * 0.08;
    }
  } else {
    mouthValue += (0 - mouthValue) * 0.4;
  }

  vrm.expressionManager.setValue(currentViseme, mouthValue);
}