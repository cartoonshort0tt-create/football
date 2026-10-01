# ⚽ Messi vs Ronaldo — TikTok Live gift game

A cartoon football game for TikTok Live. The game screen runs on your PC (captured in
TikTok Live Studio); you watch the gifts and tap them in on your **phone**. Each gift
spawns balls for the chosen side, and the player automatically shoots every ball into
the other goal.

- **Messi** — cartoon Barça colours (blue & garnet, #10), attacks the **top** goal
- **Ronaldo** — cartoon Real Madrid white (#7), attacks the **bottom** goal
- **1 coin = 5 goals** (`goalsPerCoin`). Up to 10 goals drop as separate balls; bigger gifts
  drop one glowing **mega ball** worth all the goals (e.g. Hand Hearts = 100 coins = +500).
- **Each team has its own gifts**: Messi — GOAT, Finger Heart, Hand Hearts, Glowing Jellyfish;
  Ronaldo — GG, Spinning Soccer, Super GG, Galaxy. Both teams also have 250, 5K and 10K coin gifts.
- **3-minute rounds** with a big match clock, referee whistles, a red 5-4-3-2-1 countdown,
  and a **FULL TIME** winner card. The next round starts automatically after 12 seconds.
- **Win count + winning streak** (🏆 3 WINS · 🔥 3 STREAK) under each team.
- Stadium look: angled scoreboard with club-style badges, floodlights, team banners and hanging pennants, gold bottom bar, cheering fans waving scarves.
- Goal banners, combos (`GOAL x5!`), confetti, crowd noise, "SIUUU!" celebrations.
- Score, wins and streak are saved, so restarting the PC keeps them.

## Setup (one time)

1. Install **Node.js** (LTS) from <https://nodejs.org>. Nothing else is needed — no `npm install`.
2. Download this repo (Code → Download ZIP, or `git clone`).

## Getting updates

1. Close the black server window.
2. Double-click **`update.bat`** — it downloads the newest version into this folder
   (your scores and wins are kept; `config.json` is replaced, so re-apply any edits).
3. Double-click **`start.bat`** again, and press **Ctrl+F5** on the game page and the
   controller page so the browser loads the new code.

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

**Match clock** (top card)
- **▶ Start / ⏸ Pause** — kicks off the round (the clock waits for you on the first round).
- **−30s / +30s / +1 min** — change the time left.
- **⏹ End round** — finish now and declare the winner.
- **⟲ Reset timer** — back to the full round length, not started.
- **🏆 Reset wins** — clear the win count and streak.
- **Round length** — 1, 2, 3, 5 or 10 minutes (applies to the next round).

When time runs out, the team with more goals wins the round (+1 win, streak grows).
A draw gives no win and ends any streak. Gifts sent during the full-time card
count for the next round.

**Celebration sounds**
- **🔊 ANKARA MESSI** / **🔊 SIUUU!** — plays the clip on the game screen (so it goes out on
  the stream) and that player celebrates. **⏹ Stop sound** cuts it off.
- To use other clips, replace `public/sounds/messi.mp3` / `public/sounds/ronaldo.mp3`
  (keep the same file names).

**Gifts**

- **Tap a gift** under **MESSI** or **RONALDO** → balls spawn for that side. Each button shows
  its coins and the goals it gives (🪙 5 = ⚽ 25).
- **x2 / x5 / x10 / x20** — for gift streaks (e.g. Rose x10). Resets to x1 after each tap.
- **Viewer name** (optional) — shown on screen as "from @name". Clears after each tap.
- **Custom coins** — any amount of coins for gifts that aren't in the list (×5 goals).
- **Undo last** — removes the last gift you entered (for mis-taps).
- **Reset score** — back to 0 – 0.

## Keyboard shortcuts (game screen)

| Key | Action |
| --- | --- |
| F | Fullscreen |
| M | Mute / unmute |
| S | Start / pause the match clock |
| E | End the round now |
| R | Reset the clock |
| 1 / 2 | Test: 1 coin (5 goals) for Messi / Ronaldo |
| Q / W | Test: 10 coins (50-goal mega ball) for Messi / Ronaldo |

## Customising — `config.json`

- `teams.*.name` / `number` / `celebrate` — names on screen, shirt numbers, celebration text.
- `goalsPerCoin` — goals per coin (default 5).
- `gifts.messi` / `gifts.ronaldo` — each team's buttons on the phone: `name`, `emoji`, `coins`.
  TikTok gift prices change now and then, so check them in the app and edit here.
  Restart the server after editing.
- `megaBallThreshold` — gifts worth more than this many goals become one mega ball (default 10).
- `roundSeconds` — round length (default 180 = 3 minutes).
- `intermissionSeconds` — how long the FULL TIME card shows (default 12).
- `autoStartNextRound` — `true` starts the next round by itself; `false` waits for you to press Start.
- `boardText` — the gold text in the bar at the bottom of the screen.
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
update.bat           double-click to download the latest version
```
