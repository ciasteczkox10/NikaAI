import asyncio, json, platform

playing = {"playing_music": False}

async def _is_playing():
    system = platform.system()

    if system == "Windows":
        from winsdk.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as MediaManager
        sessions = await MediaManager.request_async()
        session = sessions.get_current_session()
        if not session:
            return False
        info = session.get_playback_info()
        return "PLAYING" in str(info.playback_status)

    elif system == "Linux":
        # pip install jeepney
        from jeepney.io.asyncio import open_dbus_router, Proxy
        from jeepney.wrappers import Properties
        from jeepney.bus_messages import DBus, message_bus
        from jeepney import DBusAddress

        try:
            async with open_dbus_router(bus="SESSION") as router:
                dbus = Proxy(message_bus(), router)
                names = (await dbus.list_names())[0]
                players = [n for n in names if n.startswith("org.mpris.MediaPlayer2.")]
                for name in players:
                    addr = DBusAddress("/org/mpris/MediaPlayer2",
                                        bus_name=name,
                                        interface="org.freedesktop.DBus.Properties")
                    proxy = Proxy(addr, router)
                    reply = await proxy.Get("org.mpris.MediaPlayer2.Player", "PlaybackStatus")
                    if reply[0] == "Playing":
                        return True
        except Exception:
            return False
        return False

    elif system == "Darwin":
        # pip install pyobjc-framework-Cocoa
        import ctypes, objc
        from Foundation import NSBundle

        bundle = NSBundle.bundleWithPath_(
            "/System/Library/PrivateFrameworks/MediaRemote.framework"
        )
        MediaRemote = {}
        objc.loadBundleFunctions(bundle, MediaRemote, [
            ("MRMediaRemoteGetNowPlayingInfo", b"v@@"),
            ("MRMediaRemoteGetNowPlayingApplicationIsPlaying", b"v@@"),
        ])

        result = {}
        done = asyncio.Event()

        def callback(is_playing):
            result["playing"] = bool(is_playing)
            done.set()

        MediaRemote["MRMediaRemoteGetNowPlayingApplicationIsPlaying"](
            None, callback
        )
        try:
            await asyncio.wait_for(done.wait(), timeout=2)
        except asyncio.TimeoutError:
            return False
        return result.get("playing", False)

    return False


async def detect_music(broadcast):
    global playing
    last_state = None
    while True:
        playing["playing_music"] = await _is_playing()
        if playing["playing_music"] != last_state:
            last_state = playing["playing_music"]
            await broadcast(json.dumps(playing))
        await asyncio.sleep(1)