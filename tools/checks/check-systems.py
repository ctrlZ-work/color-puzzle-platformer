"""M2 systems check (issues 2.1-2.4 and the M2 review fixes), played in the M2 test rooms (?rooms=test).
Plays the built game in headless Chrome with real keyboard events and a simulated standard gamepad.
Usage: python3 tools/checks/check-systems.py <dist dir or deployed URL> <screenshot dir>"""
import sys, subprocess, time, json, os
from playwright.sync_api import sync_playwright

dist, shots = sys.argv[1], sys.argv[2]
os.makedirs(shots, exist_ok=True)
# <dist> may be a built folder (served locally) or a deployed URL.
URL = (dist if dist.startswith("http") else "http://localhost:8766/").rstrip("/") + "/?rooms=test"  # the M2 test rooms
srv = None if dist.startswith("http") else subprocess.Popen([sys.executable, "-m", "http.server", "8766", "--directory", dist],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)

FAKE_PAD = """
window.__pad = { buttons: Array.from({length: 17}, () => ({pressed: false, touched: false, value: 0})),
                 axes: [0, 0, 0, 0] };
const fake = { id: 'Fake standard gamepad', index: 0, connected: true, mapping: 'standard',
               get buttons() { return window.__pad.buttons; }, get axes() { return window.__pad.axes; },
               get timestamp() { return performance.now(); } };
navigator.getGamepads = () => [fake, null, null, null];
"""

STATE = """() => { const s = window.game.scene.getScene('Room');
  const o = {}; for (const c of s.chars) { o[c.name] = { x: Math.round(c.body.x*10)/10, bottom: Math.round(c.body.bottom*10)/10,
    top: Math.round(c.body.top*10)/10, supporter: c.supporter ? c.supporter.name : null, inWater: c.inWater, atSurface: c.atSurface }; }
  o.active = s.active.name; o.h = s.hazardResets; return o; }"""

errors, results = [], []
def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome",
                              args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        pg = b.new_page(viewport={"width": 960, "height": 540})
        pg.add_init_script(FAKE_PAD)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
        pg.goto(URL)
        pg.wait_for_function("window.game && window.game.scene.getScene('Title') && window.game.scene.getScene('Title').ready === true", timeout=15000)
        pg.evaluate("localStorage.clear()")
        pg.reload(); pg.wait_for_function("window.game && window.game.scene.getScene('Title') && window.game.scene.getScene('Title').ready === true", timeout=15000)
        pg.locator("canvas").click()  # focus
        pg.keyboard.down("Enter"); pg.wait_for_timeout(80); pg.keyboard.up("Enter")  # New game (the only option with no save)
        pg.wait_for_function("window.game.scene.getScene('Room').ready === true", timeout=15000)
        st = lambda: pg.evaluate(STATE)
        def hold(key, ms):
            pg.keyboard.down(key); pg.wait_for_timeout(ms); pg.keyboard.up(key); pg.wait_for_timeout(60)
        def tap(key): hold(key, 50)
        def settle(ms=500): pg.wait_for_timeout(ms)

        settle(800)
        s0 = st()
        check("Blue is a circle and Red a square", pg.evaluate("(() => { const s = window.game.scene.getScene('Room'); return s.chars.map(c => c.sprite.type).join(','); })()") == "Arc,Rectangle")
        check("Blue is active at start", s0["active"] == "blue", s0["active"])

        # Switching, and inactive colors stay put.
        hold("ArrowLeft", 300); s1 = st()
        check("keyboard moves the active color (Blue)", s1["blue"]["x"] < s0["blue"]["x"] - 10, f'{s0["blue"]["x"]} -> {s1["blue"]["x"]}')
        check("inactive Red stays put while Blue moves", abs(s1["red"]["x"] - s0["red"]["x"]) < 0.5)
        tap("q"); s2 = st()
        check("Q switches to Red", s2["active"] == "red")
        hold("ArrowRight", 200); s3 = st()
        check("Red moves after switching", s3["red"]["x"] > s2["red"]["x"] + 5)
        check("inactive Blue stays put while Red moves", abs(s3["blue"]["x"] - s2["blue"]["x"]) < 0.5)
        tap("Tab"); check("Tab switches back to Blue", st()["active"] == "blue")

        # Jump heights: Red jumps clearly higher than Blue (the high ledge needs 70 px).
        def jump_rise(who):
            start = st()[who]["bottom"]; best = start
            pg.keyboard.down("Space")
            for _ in range(40):
                pg.wait_for_timeout(15); best = min(best, st()[who]["bottom"])
            pg.keyboard.up("Space"); settle(600)
            return start - best
        blue_rise = jump_rise("blue"); tap("q"); red_rise = jump_rise("red")
        check("Red's high jump clears the 64 px ledge height and Blue's jump doesn't", red_rise >= 70 and blue_rise < 64,
              f"Red rise {red_rise:.0f} px, Blue rise {blue_rise:.0f} px")

        # Stand on each other: Red walks under... put Red next to Blue, then Blue jumps onto Red.
        s = st()  # Red active
        for _i in range(60):
            if not (st()["red"]["x"] > st()["blue"]["x"] + 2): break
            hold("ArrowLeft", 40)
        for _i in range(60):
            if not (st()["red"]["x"] < st()["blue"]["x"] - 2): break
            hold("ArrowRight", 40)
        settle(300)
        tap("q")  # Blue active, standing at same x as Red (they pass through sideways)
        pg.keyboard.down("Space"); pg.wait_for_timeout(250); pg.keyboard.up("Space"); settle(700)
        s = st()
        check("Blue can stand on Red", s["blue"]["supporter"] == "red", json.dumps(s["blue"]))

        # Red reaches the high ledge (x 20-90, top y 160) with its high jump.
        tap("q")  # Red active; Blue rides on top, step Blue off first
        tap("q"); hold("ArrowRight", 650); settle(400); tap("q")  # Blue walks well off to the right, Red active
        for _i in range(60):
            if not (st()["red"]["x"] < 112): break
            hold("ArrowRight", 40)
        for _i in range(60):
            if not (st()["red"]["x"] > 118): break
            hold("ArrowLeft", 40)
        settle(200)
        pg.keyboard.down("Space"); pg.wait_for_timeout(200); pg.keyboard.down("ArrowLeft"); pg.wait_for_timeout(300)
        pg.keyboard.up("Space"); pg.wait_for_timeout(200); pg.keyboard.up("ArrowLeft"); settle(500)
        s = st()
        check("Red reaches the high ledge", abs(s["red"]["bottom"] - 144) < 1.5 and s["red"]["x"] < 96, json.dumps(s["red"]))
        pg.screenshot(path=f"{shots}/red-on-ledge.png")
        # bring Red back down to the ground, right of the ledge
        hold("ArrowRight", 600); settle(500)

        # Blue swims: walks into the pool, floats at the surface, dives with Down, floats back up.
        tap("q")  # Blue
        for _i in range(60):
            if not (st()["blue"]["x"] < 198): break  # left part of the pool, clear of the sunken platform at x 240
            hold("ArrowRight", 60)
        settle(800); s = st()
        check("Red is not riding Blue for the swim test", s["red"]["supporter"] is None, json.dumps(s))
        check("Blue floats at the water surface", s["blue"]["inWater"] and s["blue"]["atSurface"], json.dumps(s["blue"]))
        surf = s["blue"]["top"]
        pg.keyboard.down("ArrowDown"); pg.wait_for_timeout(300); deep = st()["blue"]["top"]; pg.keyboard.up("ArrowDown")
        settle(900); back = st()["blue"]["top"]
        check("Blue dives with Down and floats back up", deep > surf + 10 and abs(back - surf) < 4,
              f"surface {surf}, dived to {deep}, back to {back}; state {json.dumps(st())}")

        # Red can't swim: walking into the water sends it back to its start.
        respawns_before = st()["red"]["x"]
        # Carry: restart so the sunken platform is back on the pool floor (Blue's dive may have floated it),
        # then Blue swims to the pool's left edge, Red walks onto Blue, and Blue swims across carrying Red.
        tap("r"); pg.wait_for_function("window.game.scene.getScene('Room').ready === true", timeout=10000); settle(400)
        for _i in range(60):
            if st()["blue"]["x"] >= 194: break
            hold("ArrowRight", 40)
        settle(600)
        for _i in range(60):
            if not (st()["blue"]["x"] > 198): break
            hold("ArrowLeft", 40)
        settle(600); tap("q")  # Red
        for _i in range(60):
            if not (st()["red"]["x"] < st()["blue"]["x"]): break
            hold("ArrowRight", 40)
        settle(400); s = st()
        check("Red stands on floating Blue", s["red"]["supporter"] == "blue", json.dumps(s["red"]))
        tap("q")  # Blue carries Red to the right
        for _i in range(60):
            if not (st()["blue"]["x"] < 268): break
            hold("ArrowRight", 80)
        settle(400); s = st()
        check("Blue carries Red across the water", s["red"]["supporter"] == "blue" and s["red"]["x"] > 262, json.dumps(s))
        pg.screenshot(path=f"{shots}/blue-carries-red.png")
        tap("q")  # Red hops off onto the right-hand ground (its top is a little above the floating Blue)
        pg.keyboard.down("ArrowRight"); tap("Space"); pg.wait_for_timeout(350); pg.keyboard.up("ArrowRight"); settle(500); s = st()
        check("Red gets off onto the far side", s["red"]["x"] > 288 and not s["red"]["inWater"] and s["red"]["bottom"] <= 208.5, json.dumps(s["red"]))

        # Red alone in the water goes back to its start position.
        hold("ArrowLeft", 700); settle(500); s = st()
        check("Red sinking in the water sends the colors back to their start", abs(s["red"]["x"] - 152) < 2 and abs(s["red"]["bottom"] - 208) < 1.5, json.dumps(s["red"]))

        # Gamepad: switch with Y (button 3), move with the d-pad / stick, jump with A (button 0).
        def pad_btn(i, down): pg.evaluate(f"window.__pad.buttons[{i}].pressed = {str(down).lower()}; window.__pad.buttons[{i}].value = {1 if down else 0}")
        def pad_axis(v): pg.evaluate(f"window.__pad.axes[0] = {v}")
        a0 = st()["active"]
        pad_btn(3, True); pg.wait_for_timeout(100); pad_btn(3, False); pg.wait_for_timeout(100)
        check("gamepad Y switches color", st()["active"] != a0)
        who = st()["active"]; x0 = st()[who]["x"]
        pad_axis(-1); pg.wait_for_timeout(300); pad_axis(0); pg.wait_for_timeout(100)
        check("gamepad left stick moves the active color", st()[who]["x"] < x0 - 10, f"{x0} -> {st()[who]['x']}")
        pad_btn(14, True); pg.wait_for_timeout(250); pad_btn(14, False); pg.wait_for_timeout(100)
        x1 = st()[who]["x"]
        check("gamepad d-pad moves the active color", x1 < x0 - 20)
        b0 = st()[who]["bottom"]; best = b0
        pad_btn(0, True)
        for _ in range(20):
            pg.wait_for_timeout(15); best = min(best, st()[who]["bottom"])
        pad_btn(0, False); settle(600)
        check("gamepad A jumps", b0 - best > 30, f"rise {b0 - best:.0f} px")

        # ---- Issue 2.2: room from Tiled, restart, hazards ----
        # Restart first: earlier steps may have changed the room (Red stepping off at the far side touches the platform).
        tap("r"); pg.wait_for_function("window.game.scene.getScene('Room').ready === true", timeout=10000); settle(400)
        info = pg.evaluate("""() => { const s = window.game.scene.getScene('Room'); const k = {};
          s.terrain.forEachTile(t => { const n = s.kindOf(t); if (n) k[n] = (k[n] || 0) + 1; });
          const o = [...s.objectsById.values()].map(v => ({id: v.id, name: v.name, type: v.type, x: v.sprite.x, y: v.sprite.y, reacts: v.props.reacts}));
          return { kinds: k, objects: o, w: s.map.width, h: s.map.height }; }""")
        check("room loads from the Tiled file with solid, water, ice and spike tiles",
              all(info["kinds"].get(k, 0) > 0 for k in ["solid", "water", "ice", "spikes"]) and info["w"] == 30, json.dumps(info["kinds"]))
        plat = [o for o in info["objects"] if o["id"] == 3]
        check("black-and-white platform object loads with its stable Tiled ID and properties",
              len(plat) == 1 and plat[0]["type"] == "platform" and plat[0]["reacts"] is True and (plat[0]["x"], plat[0]["y"]) == (336, 200), json.dumps(plat))

        def restart_with(fn):
            pg.evaluate("window.game.scene.getScene('Room').objectsById.get(3).sprite.setPosition(10, 10)")  # stand-in for a reaction changing an object
            fn()
            pg.wait_for_function("window.game.scene.getScene('Room').ready === true", timeout=10000); settle(500)
        hold("ArrowRight", 300)
        moved = st()
        restart_with(lambda: tap("r"))
        s = st(); p3 = pg.evaluate("(() => { const o = window.game.scene.getScene('Room').objectsById.get(3).sprite; return [o.x, o.y]; })()")
        check("R restarts the room: colors back at their starts, Blue active, objects back as authored",
              s["blue"]["x"] == 132 and s["red"]["x"] == 152 and s["active"] == "blue" and p3 == [336, 200], f"before {json.dumps(moved)} after {json.dumps(s)} platform {p3}")
        hold("ArrowLeft", 300)
        def pad_back():
            pg.evaluate("window.__pad.buttons[8].pressed = true; window.__pad.buttons[8].value = 1"); pg.wait_for_timeout(120); pg.evaluate("window.__pad.buttons[8].pressed = false; window.__pad.buttons[8].value = 0")
        restart_with(pad_back)
        s = st()
        check("gamepad Back restarts the room", s["blue"]["x"] == 132, json.dumps(s["blue"]))

        hz = lambda: pg.evaluate("window.game.scene.getScene('Room').hazardResets")
        # Pit (x 384-416, between the ice and the far ground): drop Blue in from above.
        n0 = hz(); pg.evaluate("window.game.scene.getScene('Room').chars[0].body.reset(400, 150)"); settle(1200); s = st()
        check("falling into a pit sends the colors back to their starts", hz() - n0 == 1 and s["blue"]["x"] == 132 and s["red"]["x"] == 152, json.dumps(s))
        # Spikes at x 448-464 on the far ground: put Red just left of them and walk in.
        tap("q")
        pg.evaluate("window.game.scene.getScene('Room').chars[1].body.reset(428, 200)"); settle(300)
        n0 = hz(); hold("ArrowRight", 400); settle(300); s = st()
        check("spikes send the colors back to their starts (Red keeps walking from its start while the key is held)", hz() - n0 == 1 and s["red"]["x"] < 200 and s["blue"]["x"] == 132, json.dumps(s) + f" resets {hz() - n0}")
        pg.screenshot(path=f"{shots}/room-after-hazard.png")

        # ---- Issue 2.3: color reactions, in the 2.2 test room ----
        OBJ = """(id) => { const s = window.game.scene.getScene('Room'); const o = s.objectsById.get(id);
          let ice = 0; s.terrain.forEachTile(t => { if (s.kindOf(t) === 'ice') ice++; });
          return { touchedBy: o.touchedBy, effect: o.effect, y: Math.round(o.sprite.y), fill: o.sprite.fillColor, solid: o.sprite.body.enable, ice }; }"""
        obj = lambda i: pg.evaluate(OBJ, i)
        def place(idx, x, y): pg.evaluate(f"window.game.scene.getScene('Room').chars[{idx}].body.reset({x}, {y})")
        def fresh():
            tap("r"); pg.wait_for_function("window.game.scene.getScene('Room').ready === true", timeout=10000); settle(400)
        fresh()
        o = obj(3)
        check("platform starts black-and-white and untouched, with 2 ice tiles beside it", o["touchedBy"] is None and o["fill"] == 0xbdbdbd and o["ice"] == 2, json.dumps(o))
        tap("q"); place(1, 320, 200); settle(200); hold("ArrowRight", 250); settle(600)  # Red walks into the platform's side
        o = obj(3)
        check("Red touching the platform makes it hot: red, melts the ice beside it, can't be stood on",
              o["touchedBy"] == "red" and o["effect"] == "hot" and o["fill"] == 0xe03a3a and o["ice"] == 0 and o["solid"] is False, json.dumps(o))
        pg.screenshot(path=f"{shots}/platform-hot.png")
        hold("ArrowLeft", 500)  # Red walks back out of the way
        tap("q"); place(0, 360, 180); settle(800)  # Blue drops onto the hot platform: falls through, no change
        o = obj(3); s = st()
        check("a second color (Blue) touching the hot platform changes nothing, and falls through it",
              o["touchedBy"] == "red" and o["fill"] == 0xe03a3a and s["blue"]["bottom"] >= 207.5, json.dumps(o) + " " + json.dumps(s["blue"]))
        fresh()
        o = obj(3)
        check("restart resets the platform and the melted ice", o["touchedBy"] is None and o["fill"] == 0xbdbdbd and o["ice"] == 2 and o["solid"] is True, json.dumps(o))
        place(0, 352, 180); settle(800)  # Blue lands on the platform first
        tap("q"); place(1, 320, 200); settle(200); hold("ArrowRight", 250); settle(600)
        o = obj(3)
        check("Blue touching first makes it a floating platform (blue), and Red touching after changes nothing",
              o["touchedBy"] == "blue" and o["effect"] == "float" and o["fill"] == 0x3a6ee0 and o["ice"] == 2 and o["solid"] is True, json.dumps(o))
        fresh()
        o0 = obj(4)
        place(0, 256, 230); settle(300)  # Blue in the pool above the sunken platform
        pg.keyboard.down("ArrowDown"); pg.wait_for_timeout(500); pg.keyboard.up("ArrowDown"); settle(1500)
        o = obj(4)
        check("Blue touching the sunken platform makes it float up to the water surface",
              o0["y"] == 248 and o["touchedBy"] == "blue" and o["y"] <= 221, f"before {json.dumps(o0)} after {json.dumps(o)}")
        pg.screenshot(path=f"{shots}/platform-floated.png")
        place(0, 132, 200); tap("q"); place(1, 256, 190); settle(800); s = st()
        check("Red can stand on the floated platform", abs(s["red"]["bottom"] - o["y"]) < 1.5 and not s["red"]["inWater"], json.dumps(s["red"]))

        # ---- Issue 2.4: goals, portals, travel, saving ----
        SAVE = "() => JSON.parse(localStorage.getItem('color-puzzle-platformer-save-v1') || 'null')"
        portal_open = lambda: pg.evaluate("window.game.scene.getScene('Room').portalOpen")
        def make_active(who):
            for _i in range(3):
                if st()["active"] == who: return
                tap("q")
        def walk_to(who, x, tol=3):
            make_active(who)
            for _i in range(80):
                cx = st()[who]["x"]
                if abs(cx - x) <= tol: break
                hold("ArrowRight" if cx < x else "ArrowLeft", 25 if abs(cx - x) < 12 else 60)
            settle(250)
        def jump_right(who, ms):
            make_active(who)
            pg.keyboard.down("Space"); pg.keyboard.down("ArrowRight"); pg.wait_for_timeout(ms)
            pg.keyboard.up("ArrowRight"); pg.wait_for_timeout(250); pg.keyboard.up("Space"); settle(700)
        def into_portal():
            walk_to("red", 304); walk_to("blue", 308)
        fresh()
        check("room 1 portal starts closed", portal_open() is False)
        # Route A: Blue carries Red across the pool.
        walk_to("blue", 198); walk_to("red", 196)
        make_active("blue"); walk_to("blue", 268)
        jump_right("red", 300)          # Red hops off Blue onto the far ground
        jump_right("blue", 350)         # Blue jumps out of the water
        check("route A (Blue carries Red) gets both colors across", st()["red"]["x"] > 288 and st()["blue"]["x"] > 280, json.dumps(st()))
        into_portal(); settle(300)
        sv = pg.evaluate(SAVE)
        check("route A: goal met (both colors in the portal) opens the portal and unlocks room 2",
              portal_open() is True and "test-room" in sv["solved"] and "test-room-2" in sv["unlocked"], json.dumps(sv))
        pg.screenshot(path=f"{shots}/portal-open.png")
        # Route B: Blue floats the sunken platform into a raft; Red jumps across on it.
        fresh()
        walk_to("blue", 250)
        make_active("blue"); pg.keyboard.down("ArrowDown"); pg.wait_for_timeout(600); pg.keyboard.up("ArrowDown"); settle(1500)
        walk_to("blue", 200)            # swim back out of the raft's way
        walk_to("red", 176)
        jump_right("red", 480)          # onto the raft
        rb = st()
        jump_right("red", 450)          # raft to the far ground
        walk_to("red", 340)             # out of Blue's landing spot
        walk_to("blue", 270)            # the raft may block Blue at the surface; then Blue hops onto it and on to the ground
        for _i in range(3):
            if st()["blue"]["x"] > 280 and not st()["blue"]["inWater"]: break
            jump_right("blue", 400)
        check("route B (raft) gets both colors across without Blue carrying Red",
              rb["red"]["supporter"] is None and not rb["red"]["inWater"] and st()["red"]["x"] > 288 and st()["blue"]["x"] > 280, f"on raft {json.dumps(rb['red'])} then {json.dumps(st())}")
        into_portal(); settle(300)
        check("route B: the same goal opens the portal too", portal_open() is True)
        # Travel: use the open portal, pick room 2.
        tap("e")
        pg.wait_for_function("window.game.scene.getScene('Travel').ready === true && window.game.scene.isActive('Travel')", timeout=10000)
        items = pg.evaluate("window.game.scene.getScene('Travel').items.map(i => i.key)")
        sel = pg.evaluate("window.game.scene.getScene('Travel').selected")
        check("travel screen lists the unlocked rooms, with the next room preselected", items == ["test-room", "test-room-2"] and sel == 1, f"{items} selected {sel}")
        hold("Enter", 80)
        pg.wait_for_function("window.game.scene.getScene('Room').ready === true && window.game.scene.getScene('Room').roomKey === 'test-room-2'", timeout=10000)
        settle(400)
        check("travel goes to room 2, and the save records it as current", pg.evaluate(SAVE)["current"] == "test-room-2")
        # Room 2's goal is an object state: make the platform hot.
        check("room 2 portal starts closed", portal_open() is False)
        walk_to("red", 200); settle(400)
        check("room 2: Red making the platform hot meets the goal and opens the portal", portal_open() is True,
              json.dumps(pg.evaluate(OBJ, 3)))
        # Reload: progress kept; Continue returns to room 2.
        pg.reload(); pg.wait_for_function("window.game && window.game.scene.getScene('Title') && window.game.scene.getScene('Title').ready === true", timeout=15000)
        labels = pg.evaluate("window.game.scene.getScene('Title').items.map(i => i.label)")
        pg.locator("canvas").click(); hold("Enter", 80)
        pg.wait_for_function("window.game.scene.getScene('Room').ready === true", timeout=10000); settle(300)
        sv = pg.evaluate(SAVE)
        check("after a reload, Continue returns to room 2 with progress kept",
              labels == ["Continue", "New game"] and pg.evaluate("window.game.scene.getScene('Room').roomKey") == "test-room-2"
              and sv["unlocked"] == ["test-room", "test-room-2"] and set(sv["solved"]) == {"test-room", "test-room-2"}, f"{labels} {json.dumps(sv)}")
        # New game clears progress.
        pg.reload(); pg.wait_for_function("window.game && window.game.scene.getScene('Title') && window.game.scene.getScene('Title').ready === true", timeout=15000)
        pg.locator("canvas").click(); hold("ArrowDown", 80); hold("Enter", 80)
        pg.wait_for_function("window.game.scene.getScene('Room').ready === true", timeout=10000); settle(300)
        sv = pg.evaluate(SAVE)
        check("New game clears progress and starts in room 1",
              sv == {"unlocked": ["test-room"], "solved": [], "current": "test-room"} and pg.evaluate("window.game.scene.getScene('Room').roomKey") == "test-room", json.dumps(sv))

        # ---- M2-R fixes ----
        # Carrying off a ledge: Red on Blue, Blue walks off the left ground into the pool.
        fresh()
        walk_to("red", 160); walk_to("blue", 158)
        make_active("blue"); pg.keyboard.down("Space"); pg.wait_for_timeout(250); pg.keyboard.up("Space"); settle(700)
        on = st()["blue"]["supporter"] == "red"
        make_active("red"); pg.keyboard.down("Space"); pg.wait_for_timeout(150); pg.keyboard.up("Space"); settle(50)
        # (Red hops so Blue can go underneath)
        make_active("blue"); settle(700)
        walk_to("red", 150); walk_to("blue", 150)
        make_active("red"); pg.keyboard.down("Space"); pg.wait_for_timeout(250); pg.keyboard.up("Space"); settle(800)
        stacked = st()["red"]["supporter"] == "blue"
        make_active("blue"); h0 = pg.evaluate("window.game.scene.getScene('Room').hazardResets")
        for _i in range(40):
            if st()["blue"]["x"] >= 240: break
            hold("ArrowRight", 80)
        settle(500); s = st()
        check("Blue walking off the ledge into the water carries Red with it (review defect 2)",
              stacked and s["red"]["supporter"] == "blue" and pg.evaluate("window.game.scene.getScene('Room').hazardResets") == h0 and s["blue"]["x"] >= 230, json.dumps(s))
        # Marks: hot and float get different patterns, not only different hues.
        fresh(); tap("q"); place(1, 320, 200); settle(200); hold("ArrowRight", 250); settle(500)
        mk = pg.evaluate("(() => { const o = window.game.scene.getScene('Room').objectsById.get(3); return !!o.markGraphics; })()")
        check("a reacted object gets a pattern as well as a color (hot = zigzag)", mk)
        # Esc on the travel screen resumes the room as it was; a solved room starts with its portal open.
        fresh()
        pg.evaluate("window.game.scene.getScene('Room').chars[0].body.reset(310, 200); window.game.scene.getScene('Room').chars[1].body.reset(312, 200)")
        settle(800)
        before = st(); opened = portal_open()
        make_active("blue"); tap("e")
        pg.wait_for_function("window.game.scene.isActive('Travel') && window.game.scene.getScene('Travel').ready === true", timeout=10000)
        tap("Escape"); settle(600)
        after = st()
        check("Esc on the travel screen goes back to the room as it was: portal still open, colors where they were",
              opened and portal_open() is True and not pg.evaluate("window.game.scene.isActive('Travel')")
              and abs(after["blue"]["x"] - before["blue"]["x"]) < 2 and abs(after["red"]["x"] - before["red"]["x"]) < 2, f"{json.dumps(before)} -> {json.dumps(after)}")
        fresh()
        check("a solved room starts with its portal already open", portal_open() is True)
        # Holding gamepad Back restarts once; choosing New game with gamepad A doesn't make Blue jump.
        starts = lambda: pg.evaluate("window.game.registry.get('roomStarts') || 0")
        n0 = starts()
        pg.evaluate("window.__pad.buttons[8].pressed = true; window.__pad.buttons[8].value = 1"); pg.wait_for_timeout(600)
        pg.evaluate("window.__pad.buttons[8].pressed = false; window.__pad.buttons[8].value = 0"); settle(400)
        check("holding gamepad Back for 0.6 s restarts the room once, not every frame (review defect 5)", starts() - n0 == 1, f"{starts() - n0} restarts")
        pg.evaluate("localStorage.clear()"); pg.reload()
        pg.wait_for_function("window.game && window.game.scene.getScene('Title') && window.game.scene.getScene('Title').ready === true", timeout=15000)
        pg.evaluate("window.__pad.buttons[0].pressed = true; window.__pad.buttons[0].value = 1")
        pg.wait_for_function("window.game.scene.getScene('Room').ready === true", timeout=10000)
        vy = [pg.evaluate("Math.round(window.game.scene.getScene('Room').chars[0].body.velocity.y)") for _ in range(5) if not pg.wait_for_timeout(40)]
        pg.evaluate("window.__pad.buttons[0].pressed = false; window.__pad.buttons[0].value = 0"); settle(300)
        check("choosing New game with gamepad A doesn't make Blue jump when the room starts (review defect 6)", min(vy) > -100, str(vy))
        # A save naming a room that no longer exists falls back to room 1 instead of crashing.
        pg.evaluate("""localStorage.setItem('color-puzzle-platformer-save-v1', JSON.stringify({unlocked:['test-room','old-room'],solved:[],current:'old-room'}))""")
        pg.reload(); pg.wait_for_function("window.game && window.game.scene.getScene('Title') && window.game.scene.getScene('Title').ready === true", timeout=15000)
        pg.locator("canvas").click(); hold("Enter", 80)
        pg.wait_for_function("window.game.scene.getScene('Room').ready === true", timeout=10000)
        check("Continue with a save that names a missing room opens room 1 (review defect 1)",
              pg.evaluate("window.game.scene.getScene('Room').roomKey") == "test-room")

        pg.screenshot(path=f"{shots}/final.png")
        b.close()
except Exception as ex:
    results.append(("check run stopped early: " + str(ex).splitlines()[0], False, ""))
finally:
    if srv: srv.terminate()

for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))
print("console/page errors:", errors)
print("ALL PASS" if all(ok for _, ok, _ in results) and not errors else "SOME FAILED")
