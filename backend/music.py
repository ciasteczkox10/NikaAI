import asyncio, json
from winsdk.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as MediaManager

playing = {"playing_music": False}  # Global variable to track if music is playing

async def detect_music(broadcast):
    global playing
    last_state = None
    while True:
        sessions = await MediaManager.request_async()
        session = sessions.get_current_session()
        playing["playing_music"] = False
        if session:
            info = session.get_playback_info()
            status = str(info.playback_status)
            playing["playing_music"] = "PLAYING" in status

        if playing["playing_music"] != last_state:
            last_state = playing["playing_music"]
            await broadcast(json.dumps(playing))

        await asyncio.sleep(1)