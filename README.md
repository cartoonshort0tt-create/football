# ⚽ Messi vs Ronaldo — TikTok Live gift game

A cartoon football game for TikTok Live. The game screen runs on your PC (captured in
TikTok Live Studio); you watch the gifts and tap them in on your **phone**. Each gift
spawns balls for the chosen side, and the player automatically shoots every ball into
the other goal.

- **Messi** — cartoon Barça colours (blue & garnet, #10), attacks the **top** goal
- **Ronaldo** — cartoon Real Madrid white (#7), attacks the **bottom** goal
- **1 coin = 1 goal.** Gifts up to 10 coins drop as separate balls; bigger gifts drop one
  glowing **mega ball** worth all the coins (e.g. Hand Hearts = +100 in one shot).
- Goal banners, combos (`GOAL x5!`), confetti, crowd noise, "SIUUU!" celebrations.
- The score is saved, so restarting the PC keeps it.

## Setup (one time)

1. Install **Node.js** (LTS) from <https://nodejs.org>. Nothing else is needed — no `npm install`.
2. Download this repo (Code → Download ZIP, or `git clone`).

## Every stream

1. **Start the server** — double-click `start.bat` (Windows), or run `node server.js`.
   It prints two addresses:
   ```
   Game screen (open on this PC):  http://localhost:3000
   Phone control (same Wi-Fi):     http://192.168.1.23:3000/control
   ```
   If Windows asks about the firewall, click **Allow** (Private networks) so your phone can connect.
2. **Game screen** — open `http://localhost:3000` in Chrome on the PC, click **▶ Start**
   (turns sound on), press **F** for fullscreen.
3. **TikTok Live Studio** — add a *Window capture* (or *Game capture*) of that Chrome window.
   The game is designed for **portrait 9:16** (1080×1920), so use a portrait/vertical
   scene. Enable audio capture if you want the crowd sounds on stream.
4. **Phone** — connect to the same Wi-Fi and open the `/control` address. Add it to your
   home screen for quick access.

## Using the phone controller

- **Tap a gift** under **MESSI** or **RONALDO** → balls spawn for that side.
- **x2 / x5 / x10 / x20** — for gift streaks (e.g. Rose x10). Resets to x1 after each tap.
- **Viewer name** (optional) — shown on screen as "from @name". Clears after each tap.
- **Custom coins** — any amount for gifts that aren't in the list.
- **Undo last** — removes the last gift you entered (for mis-taps).
- **Reset score** — back to 0 – 0.

## Keyboard shortcuts (game screen)

| Key | Action |
| --- | --- |
| F | Fullscreen |
| M | Mute / unmute |
| 1 / 2 | Test: one ball for Messi / Ronaldo |
| Q / W | Test: 50-coin mega ball for Messi / Ronaldo |

## Customising — `config.json`

- `teams.*.name` / `number` / `celebrate` — names on screen, shirt numbers, celebration text.
- `gifts` — the buttons on the phone: `name`, `emoji`, `coins`. TikTok gift prices change
  now and then, so check them in the app and edit here. Restart the server after editing.
- `megaBallThreshold` — gifts above this many coins become one mega ball (default 10).
- `tip` — the yellow line under the scoreboard.
- `port` — change if 3000 is taken.

Scores are stored in `data/scores.json` (delete it or use **Reset score** to start fresh).

## Files

```
server.js            tiny web server + live updates (no dependencies)
config.json          names, gifts, settings
public/index.html    game screen
public/game.js       game engine & drawing
public/control.html  phone controller
public/control.js
start.bat            double-click launcher for Windows
```
