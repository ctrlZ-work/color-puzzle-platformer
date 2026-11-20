"""Issue 3.2 check: plays the five prototype rooms in headless Chrome with real key presses.
Every documented solution and tempting wrong choice is played from the room's start with input only
(no teleporting). Usage: python3 tools/checks/check-prototype-rooms.py <dist dir or URL> <screenshot dir> [only-room-numbers]"""
import sys, subprocess, time, json, os
from playwright.sync_api import sync_playwright

dist, shots = sys.argv[1], sys.argv[2]
ONLY = set(sys.argv[3].split(",")) if len(sys.argv) > 3 else None
os.makedirs(shots, exist_ok=True)
URL = dist if dist.startswith("http") else "http://localhost:8767/"
srv = None if dist.startswith("http") else subprocess.Popen([sys.executable, "-m", "http.server", "8767", "--directory", dist],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)

STATE = """() => { const s = window.game.scene.getScene('Room');
  const o = {}; for (const c of s.chars) { o[c.name] = { x: Math.round(c.body.x*10)/10, bottom: Math.round(c.body.bottom*10)/10,
    supporter: c.supporter ? c.supporter.name : null, inWater: c.inWater }; }
  o.active = s.active.name; o.h = s.hazardResets; o.open = s.portalOpen; o.room = s.roomKey;
  o.bg = s.bgColor ? Math.round(s.bgColor.alpha*100)/100 : null;
  let ice = 0; s.terrain.forEachTile(t => { if (s.kindOf(t) === 'ice') ice++; }); o.ice = ice;
  o.objs = [...s.objectsById.values()].map(b => [b.id, b.effect]); return o; }"""

errors, results = [], []
def check(name, ok, detail=""):
    results.append((name, bool(ok), detail)); print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  :: " + detail), flush=True)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        pg = b.new_page(viewport={"width": 960, "height": 540})
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
        TITLE_READY = "window.game && window.game.scene.getScene('Title') && window.game.scene.getScene('Title').ready === true"
        pg.goto(URL); pg.wait_for_function(TITLE_READY, timeout=15000)
        pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_function(TITLE_READY, timeout=15000)
        pg.locator("canvas").click()

        def hold(key, ms):
            pg.keyboard.down(key); pg.wait_for_timeout(ms); pg.keyboard.up(key); pg.wait_for_timeout(60)
        def tap(key): hold(key, 50)
        def settle(ms=500): pg.wait_for_timeout(ms)
        st = lambda: pg.evaluate(STATE)
        def effect(oid): return dict(st()["objs"]).get(oid)
        def wait_room(key):
            pg.wait_for_function(f"(() => {{ const s = window.game.scene.getScene('Room'); return s && s.ready === true && s.roomKey === '{key}' && s.sys.isActive(); }})()", timeout=15000)
            settle(700)
        def start_room(key):  # direct start, for replaying a room's other routes, with the room unsolved
            pg.evaluate("localStorage.setItem('color-puzzle-platformer-save-v1', JSON.stringify({unlocked:['proto-1','proto-2','proto-3','proto-4','proto-5'],solved:[],current:'proto-1'}))")
            pg.evaluate(f"window.game.scene.getScene('Room').scene.restart({{ room: '{key}' }})"); wait_room(key)
        def make_active(who):
            for _i in range(3):
                if st()["active"] == who: return
                tap("q")
        def walk_to(who, x, tol=2.5):
            make_active(who)
            for _i in range(120):
                cx = st()[who]["x"]
                if abs(cx - x) <= tol: break
                hold("ArrowRight" if cx < x else "ArrowLeft", 20 if abs(cx - x) < 10 else 60)
            settle(300)
        def push(who, d, ms):
            make_active(who); hold(d, ms); settle(400)
        def jump(who, d, ms, up=300):
            """Jump, holding direction d ('ArrowRight'/'ArrowLeft'/None) for ms, jump held for up ms."""
            make_active(who)
            pg.keyboard.down("Space")
            if d: pg.keyboard.down(d)
            pg.wait_for_timeout(max(ms, up))
            if d: pg.keyboard.up(d)
            pg.keyboard.up("Space"); settle(700)
        def dive(ms=600):
            make_active("blue"); hold("ArrowDown", ms); settle(1500)
        def jump_out(F):
            # Blue swims to the far bank and jumps out; it can only jump once it's floating at the surface.
            walk_to("blue", F - 18); settle(800)
            for _i in range(3):
                if not st()["blue"]["inWater"]: break
                jump("blue", "ArrowRight", 350)
        def in_portal():
            return pg.evaluate("window.game.scene.getScene('Room').goalMet()")
        def use_portal_to(next_key):
            tap("e"); pg.wait_for_function("window.game.scene.getScene('Travel').sys.isActive()", timeout=5000); settle(400)
            tap("Enter"); wait_room(next_key)

        # Shared crossings for rooms 2 and 4 (left bank edge L, far bank F, raft at R, all body.x).
        def carry_across(L, F):
            walk_to("blue", L + 8); settle(1200)   # Blue drops into the water by the near bank and settles
            walk_to("red", L + 8); settle(600)     # Red steps down onto floating Blue
            s = st(); ok_on = s["red"]["supporter"] == "blue"
            walk_to("blue", F - 18)         # Blue swims across with Red on top
            jump("red", "ArrowRight", 300)  # Red hops off onto the far bank
            jump_out(F)
            return ok_on
        def raft_across(L, R, F):
            walk_to("blue", R); dive()      # Blue touches the sunken platform; it floats up
            walk_to("blue", L + 4)          # out of the way, back by the near bank
            walk_to("red", L - 16)
            jump("red", "ArrowRight", 760, up=500)  # onto the raft
            s = st(); on_raft = not s["red"]["inWater"] and s["h"] == 0 and s["red"]["bottom"] < 222
            walk_to("red", R + 12)
            jump("red", "ArrowRight", 760, up=500)  # onto the far bank
            jump_out(F)
            return on_raft

        def room(n): return ONLY is None or str(n) in ONLY

        # ---------- Play-through: New game, every room by its intended solution, through the portals ----------
        tap("Enter"); wait_room("proto-1")
        check("New game starts in prototype room 1", st()["room"] == "proto-1")
        s = st()
        check("room 1 background starts black-and-white (color layer hidden)", s["bg"] == 0, str(s["bg"]))
        pg.screenshot(path=f"{shots}/r1-start.png")

        # Room 1 intended (also its tempting wrong choice: Red touches the step first, making it hot).
        walk_to("red", 302)                       # Red walks through the step (it turns hot) to the ledge's foot
        settle(1000)
        check("room 1: Red walking into the step makes it hot", effect(3) == "hot", str(st()["objs"]))
        s = st(); check("room 1: background partly restored after the first touch", 0 < s["bg"] < 1, str(s["bg"]))
        walk_to("blue", 270); jump("blue", "ArrowRight", 160)   # Blue onto Red
        check("room 1: Blue stands on Red at the ledge", st()["blue"]["supporter"] == "red", json.dumps(st()))
        jump("blue", "ArrowRight", 300)
        check("room 1: Blue on Red reaches the ledge", st()["blue"]["bottom"] == 144, json.dumps(st()["blue"]))
        jump("red", "ArrowRight", 250)
        check("room 1: Red jumps onto the ledge alone (on the ledge or on Blue there)", st()["red"]["bottom"] <= 144 and st()["red"]["x"] >= 304, json.dumps(st()["red"]))
        walk_to("red", 392); walk_to("blue", 410); settle(1200)
        s = st()
        check("room 1 intended solution: both in the portal, portal opens", s["open"] is True, json.dumps(s))
        check("room 1: background fully in color once solved", s["bg"] == 1, str(s["bg"]))
        pg.screenshot(path=f"{shots}/r1-solved.png")
        use_portal_to("proto-2")

        # Room 2 intended: Blue carries Red.
        ok_on = carry_across(144, 304)
        check("room 2: Red rides on floating Blue", ok_on)
        s = st(); check("room 2: both colors across the water, no resets", s["red"]["x"] >= 304 and s["blue"]["x"] >= 290 and s["h"] == 0, json.dumps(s))
        walk_to("red", 404); walk_to("blue", 424); settle(1200)
        check("room 2 intended solution (carry): portal opens", st()["open"] is True, json.dumps(st()))
        use_portal_to("proto-3")

        # Room 3 intended: Red melts the ice through the slab.
        walk_to("red", 320); settle(800)
        s = st()
        check("room 3: Red touching the slab makes it hot and melts the ice", effect(3) == "hot" and s["ice"] == 0, json.dumps(s))
        walk_to("red", 404); walk_to("blue", 424); settle(1200)
        check("room 3 intended solution (melt): portal opens", st()["open"] is True, json.dumps(st()))
        use_portal_to("proto-4")

        # Room 4 intended: carry across, then Red melts the ice wall.
        ok_on = carry_across(112, 272)
        check("room 4: carry crossing works", ok_on and st()["h"] == 0 and st()["red"]["x"] >= 272, json.dumps(st()))
        walk_to("red", 420); settle(800)
        s = st(); check("room 4: Red melts the ice wall through the slab", s["ice"] == 0 and effect(3) == "hot", json.dumps(s))
        walk_to("red", 420); walk_to("blue", 440); settle(1200)
        check("room 4 intended solution (carry, melt): portal opens", st()["open"] is True, json.dumps(st()))
        use_portal_to("proto-5")

        # Room 5 intended: Blue touches both steps first, then the stack from the step.
        walk_to("blue", 120)
        jump("blue", "ArrowRight", 250)           # Blue onto step A (touching it first)
        walk_to("blue", 176); settle(300)         # off its right end
        push("blue", "ArrowRight", 1200)         # into step B's side
        check("room 5: Blue touched both steps first (both blue)", effect(3) == "float" and effect(4) == "float", str(st()["objs"]))
        walk_to("red", 120); jump("red", "ArrowRight", 260)
        walk_to("red", 286); jump("red", "ArrowRight", 130); walk_to("red", 305)   # Red on step B, left end
        check("room 5: Red stands on step B", st()["red"]["bottom"] == 192, json.dumps(st()["red"]))
        walk_to("blue", 280); jump("blue", "ArrowRight", 120)                      # Blue onto step B... 
        if st()["blue"]["supporter"] != "red":
            walk_to("blue", 305); jump("blue", None, 0, 300)                      # ...then onto Red
        check("room 5: Blue stands on Red on step B", st()["blue"]["supporter"] == "red", json.dumps(st()))
        jump("blue", "ArrowRight", 350)
        check("room 5: Blue on Red on the step reaches the 80 px ledge", st()["blue"]["bottom"] == 128, json.dumps(st()["blue"]))
        jump("red", "ArrowRight", 300)
        check("room 5: Red jumps onto the ledge (on the ledge or on Blue there)", st()["red"]["bottom"] <= 128 and st()["red"]["x"] >= 336, json.dumps(st()["red"]))
        walk_to("red", 404); walk_to("blue", 424); settle(1200)
        check("room 5 intended solution: portal opens", st()["open"] is True, json.dumps(st()))
        sv = pg.evaluate("JSON.parse(localStorage.getItem('color-puzzle-platformer-save-v1'))")
        check("all five rooms solved and unlocked in the save after the play-through",
              set(sv["solved"]) == {f"proto-{i}" for i in range(1, 6)}, json.dumps(sv))
        pg.screenshot(path=f"{shots}/r5-solved.png")

        # ---------- Other solutions and wrong choices, each from a fresh room start ----------
        if room(1):
            start_room("proto-1")
            walk_to("blue", 240); push("blue", "ArrowRight", 400)  # Blue walks into the step first
            check("room 1 other solution: Blue touching the step first makes it a solid blue step", effect(3) == "float", str(st()["objs"]))
            jump("blue", "ArrowRight", 120)
            check("room 1 other solution: Blue stands on the blue step", st()["blue"]["bottom"] == 192, json.dumps(st()["blue"]))
            jump("blue", "ArrowRight", 300)
            check("room 1 other solution: Blue jumps from the step to the ledge", st()["blue"]["bottom"] == 144, json.dumps(st()["blue"]))
            walk_to("red", 230); jump("red", "ArrowRight", 450)
            if st()["red"]["bottom"] != 144: jump("red", "ArrowRight", 300)
            check("room 1 other solution: Red reaches the ledge (on the ledge or on Blue there)", st()["red"]["bottom"] <= 144 and st()["red"]["x"] >= 304, json.dumps(st()["red"]))
            walk_to("red", 392); walk_to("blue", 410); settle(1200)
            check("room 1 other solution (blue step): portal opens", st()["open"] is True, json.dumps(st()))
            start_room("proto-1")
            walk_to("blue", 225); jump("blue", "ArrowRight", 450)  # Blue alone, jumping over the step at the ledge
            check("room 1 no skip: Blue alone can't jump onto the ledge", st()["blue"]["bottom"] > 144, json.dumps(st()["blue"]))

        if room(2):
            start_room("proto-2")
            ok = raft_across(144, 216, 304)
            check("room 2 other solution: Red lands on the raft", ok, json.dumps(st()))
            s = st(); check("room 2 other solution: both across, no resets", s["red"]["x"] >= 304 and s["blue"]["x"] >= 290 and s["h"] == 0, json.dumps(s))
            walk_to("red", 404); walk_to("blue", 424); settle(1200)
            check("room 2 other solution (raft): portal opens", st()["open"] is True, json.dumps(st()))
            start_room("proto-2")
            walk_to("red", 126); jump("red", "ArrowRight", 700); settle(800)
            check("room 2 wrong choice / no skip: Red can't jump the pool; it sinks and both colors go back", st()["h"] >= 1, json.dumps(st()))

        if room(3):
            # Stack over the ice, with the slab made blue first (the tempting wrong choice).
            start_room("proto-3")
            walk_to("blue", 236); push("blue", "ArrowRight", 300); push("blue", "ArrowLeft", 150)
            s = st(); check("room 3 wrong choice: Blue touching the slab first makes it blue; the ice stays", effect(3) == "float" and s["ice"] == 4, json.dumps(s))
            walk_to("red", 240); jump("red", "ArrowRight", 120); walk_to("red", 268)   # Red on the slab, by the ice
            walk_to("blue", 230); jump("blue", "ArrowRight", 160)
            if st()["blue"]["supporter"] != "red":
                walk_to("blue", 262); jump("blue", None, 0, 300)
            check("room 3 stack route: Blue stands on Red on the slab", st()["blue"]["supporter"] == "red", json.dumps(st()))
            jump("blue", "ArrowRight", 450); walk_to("blue", 330)
            check("room 3 stack route: Blue gets over the ice", st()["blue"]["x"] > 300 and st()["blue"]["bottom"] == 208, json.dumps(st()["blue"]))
            walk_to("red", 240)
            jump("red", "ArrowRight", 600, up=170); walk_to("red", 320)
            check("room 3 stack route: Red gets over the ice through the gap", st()["red"]["x"] > 300, json.dumps(st()["red"]))
            walk_to("red", 404); walk_to("blue", 424); settle(1200)
            check("room 3 other solution (stack over the ice after the wrong touch): portal opens", st()["open"] is True, json.dumps(st()))
            # Stack on the ground with the slab untouched.
            start_room("proto-3")
            walk_to("red", 234)
            walk_to("blue", 200); jump("blue", "ArrowRight", 160)
            if st()["blue"]["supporter"] != "red":
                walk_to("blue", 230); jump("blue", None, 0, 300)
            check("room 3 ground stack: Blue on Red on the ground, slab untouched", st()["blue"]["supporter"] == "red" and effect(3) is None, json.dumps(st()))
            jump("blue", "ArrowRight", 600)
            walk_to("blue", 330)
            check("room 3 ground stack: Blue gets over the ice from Red on the ground", st()["blue"]["x"] > 300, json.dumps(st()["blue"]))
            start_room("proto-3")
            walk_to("blue", 230); jump("blue", "ArrowRight", 450)
            check("room 3 no skip: Blue alone can't get over the ice", st()["blue"]["x"] < 288, json.dumps(st()["blue"]))

        if room(4):
            start_room("proto-4")
            ok = raft_across(112, 184, 272)
            check("room 4 raft crossing: Red lands on the raft", ok, json.dumps(st()))
            walk_to("red", 330); walk_to("red", 420); settle(800)
            walk_to("red", 420); walk_to("blue", 440); settle(1200)
            check("room 4 other solution (raft, melt): portal opens", st()["open"] is True and st()["h"] == 0, json.dumps(st()))
            start_room("proto-4")
            carry_across(112, 272)
            walk_to("blue", 330); push("blue", "ArrowRight", 300)             # Blue touches the slab first
            s = st(); check("room 4 wrong choice: Blue touching the slab first makes it blue; the ice wall stays", effect(3) == "float" and s["ice"] == 12, json.dumps(s))
            walk_to("red", 330); jump("red", "ArrowRight", 600); walk_to("red", 420)
            check("room 4 wrong choice: Red can no longer get past the ice wall", st()["red"]["x"] < 384, json.dumps(st()["red"]))
            tap("r"); wait_room("proto-4")
            s = st(); check("room 4: restart restores the slab and the ice wall", effect(3) is None and s["ice"] == 12 and s["bg"] == 0, json.dumps(s))

        if room(5):
            start_room("proto-5")
            walk_to("red", 250); push("red", "ArrowRight", 700)        # Red walks right first: both steps turn hot
            check("room 5 wrong choice: Red walking right first makes both steps hot", effect(3) == "hot" and effect(4) == "hot", str(st()["objs"]))
            walk_to("red", 334)
            walk_to("blue", 300); jump("blue", "ArrowRight", 160)
            if st()["blue"]["supporter"] != "red":
                walk_to("blue", 330); jump("blue", None, 0, 300)
            jump("blue", "ArrowRight", 350)
            check("room 5 wrong choice: Blue on Red on the ground can't reach the 80 px ledge", st()["blue"]["bottom"] > 128, json.dumps(st()))
            # Only step B decides the room: Red may touch step A first.
            start_room("proto-5")
            walk_to("red", 186); settle(400)            # Red through step A (hot), stops before step B
            walk_to("blue", 250); push("blue", "ArrowRight", 600)           # Blue touches step B first
            check("room 5: step A's color doesn't matter; Blue touching step B first is what counts", effect(3) == "hot" and effect(4) == "float", str(st()["objs"]))

        # ---------- Review 3.3 defect rechecks ----------
        if room(5):
            # Defect 1: Red jumping up under a jumping Blue must not catch and carry it.
            start_room("proto-5")
            walk_to("red", 250); push("red", "ArrowRight", 700); walk_to("red", 330)
            walk_to("blue", 330)
            caught = False
            for delay in (70, 150, 250, 400):
                make_active("blue")
                pg.keyboard.down("Space"); pg.wait_for_timeout(delay)
                pg.keyboard.down("q"); pg.wait_for_timeout(40); pg.keyboard.up("q")
                pg.keyboard.up("Space"); pg.keyboard.down("Space"); pg.keyboard.down("ArrowRight")
                pg.wait_for_timeout(600); pg.keyboard.up("ArrowRight"); pg.keyboard.up("Space"); settle(900)
                s = st()
                if s["blue"]["bottom"] <= 128: caught = True
                walk_to("red", 330); walk_to("blue", 330)
            check("review defect 1: Red jumping under a jumping Blue doesn't carry it onto the room 5 ledge", not caught, json.dumps(st()))
        if room(1):
            # Defect 3: a tap shorter than one frame still counts.
            start_room("proto-1")
            before = st()["active"]
            pg.evaluate("""() => { const o = {key: 'q', code: 'KeyQ', keyCode: 81, which: 81, bubbles: true};
              window.dispatchEvent(new KeyboardEvent('keydown', o)); window.dispatchEvent(new KeyboardEvent('keyup', o)); }""")
            settle(200)
            check("review defect 3: a key tapped down and up within one frame still switches color", st()["active"] != before, f'{before} -> {st()["active"]}')
            # Defect 4: the room's side edges are walls.
            make_active("blue"); hold("ArrowLeft", 1200); settle(300)
            s = st()
            check("review defect 4: walking off the left edge is blocked by a wall, not a reset", s["blue"]["x"] >= 0 and s["h"] == 0, json.dumps(s))
        if room(2):
            # Defect 2: the travel screen's default choice is worked out on every visit.
            pg.evaluate("localStorage.setItem('color-puzzle-platformer-save-v1', JSON.stringify({unlocked:['proto-1','proto-2','proto-3','proto-4','proto-5'],solved:['proto-1','proto-2','proto-3','proto-4','proto-5'],current:'proto-1'}))")
            pg.evaluate("window.game.scene.getScene('Room').scene.restart({ room: 'proto-1' })"); wait_room("proto-1")
            # (This check is about the travel screen, so Blue is put straight into the open portal.)
            place_blue = "window.game.scene.getScene('Room').chars[0].body.reset(408, 120)"
            pg.evaluate(place_blue); settle(500); make_active("blue")
            tap("e"); pg.wait_for_function("window.game.scene.getScene('Travel').sys.isActive()", timeout=5000); settle(300)
            first = pg.evaluate("window.game.scene.getScene('Travel').selected")
            tap("Escape"); settle(400)
            pg.evaluate("window.game.scene.getScene('Room').scene.restart({ room: 'proto-4' })"); wait_room("proto-4")
            pg.evaluate("window.game.scene.getScene('Room').chars[0].body.reset(440, 200)"); settle(500); make_active("blue")
            tap("e"); pg.wait_for_function("window.game.scene.getScene('Travel').sys.isActive()", timeout=5000); settle(300)
            second = pg.evaluate("window.game.scene.getScene('Travel').selected")
            tap("Escape"); settle(300)
            check("review defect 2: travel screen preselects the room after the current one on each visit", first == 1 and second == 4, f"{first} {second}")

        print("console errors:", errors)
        check("no console errors", not errors, "; ".join(errors[:5]))
        b.close()
finally:
    if srv: srv.terminate()

fails = [r for r in results if not r[1]]
print(f"\n{len(results) - len(fails)} PASS, {len(fails)} FAIL")
