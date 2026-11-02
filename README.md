# Bug Hunt

A top-down, auto-firing survival shooter. You're the last marine in an infested colony outpost. Move to stay alive: your weapons fire on their own. Collect bio-samples to level up, stack weapons and gear, and last until the Queen shows up at 15:00. Then kill her.

## Run it

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8642
```

Then go to http://localhost:8642.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Move |
| Drag anywhere (touch or mouse) | Virtual joystick |
| 1–4 | Pick a marine / pick an upgrade |
| P or Esc | Pause |
| M | Mute |

## Hostiles (weakest → strongest)

| Bug | Behavior |
| --- | --- |
| Egg | Sits in resin clusters. Hatches a Leaper when you get close. Shoot it first. |
| Larva | Fast and fragile. Grows into a Drone if you leave it alive for ~20s. |
| Leaper | Crouches, then pounces. Latches on, slowing and draining you until it's pried off. |
| Drone | The basic grunt. |
| Runner | Fast, dog-like hunter. |
| Spitter | Keeps its distance and lobs acid globs (they can be dodged). |
| Warrior | Tough, ridged-skull brute. Acid blood leaves damaging pools. |
| Praetorian | Mini-boss at 5:00 and 10:00 (×2). Telegraphs, then charges. Drops a supply crate. |
| The Queen | Arrives at 15:00. Spits acid fans, lays eggs, summons guards, charges. Enrages below 50%. |

## Arsenal

Weapons (up to 6, level 8 max): Pulse Rifle, Combat Shotgun, Flamethrower, Smart Gun, Grenade Launcher, Sentry Gun, Combat Drone, Arc Emitter.

Gear (up to 6, level 5 max): Body Armor, Combat Stims, Targeting Optics, Auto-Loader, Servo Boots, Mag Harness, Extended Mags, Heavy Ordnance, Conditioning.

Pickups: Medkit, Sample Recall (pulls in every sample on the map), Demo Charge (clears the screen), Night Vision (20s of green-phosphor sight in the dark), Supply Crate.

## Code layout

- `js/data.js`: weapons, gear, enemy stats, squad, and the event timeline. Most balancing happens here.
- `js/audio.js`: synthesized WebAudio sound effects, including the bitcrushed motion tracker ping.
- `js/render.js`: procedural floor tiles, lighting sprites, and all character art (no image assets).
- `js/game.js`: game loop, spawning director, AI, weapons, collisions, HUD, menus.

Add `?debug` to the URL for test keys: `]` skips 60s, `L` grants a level, `K` kills everything, `G` gives god mode.
