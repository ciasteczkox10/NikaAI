let recorder = null;
let stream = null;
let chunks = [];

export async function startRecording(ws) {
    // Start recording audio from the user's microphone and send it to the server via WebSocket
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error("STT error: getUserMedia not supported");
        return;
    }
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());

        const audio = new Blob(chunks, { type: "audio/webm" });
        const bytes = await audio.arrayBuffer();

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(bytes); // Send the recorded audio data to the server via WebSocket
        } else {
            console.error("STT error: websocket not open");
        }
    };
    recorder.start();
    return () => {
        if (recorder && recorder.state !== "inactive") {
            recorder.stop();
        }
    };
}