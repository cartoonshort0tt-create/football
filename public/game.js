(() => {
  'use strict';

  // ---------- Layout: logical 1080x1920 portrait (TikTok 9:16), scaled to fit ----------
  const W = 1080;
  const H = 1920;
  const PITCH = { x: 120, y: 450, w: 840, h: 1250 };
  const MID_Y = PITCH.y + PITCH.h / 2;
  const GOAL_HALF = 150; // half width of the goal mouth
  const GOAL_HEIGHT = 110; // crossbar height (pseudo-3D)
  const BALL_R = 20;
  const GRAVITY = 2600;
  const MAX_FIELD_BALLS = 12;
  const FONT = '"Arial Black", "Segoe UI", Arial, sans-serif';
  const OUTLINE = '#15161c';

  const KITS = {
    messi: {
      stripes: ['#A50044', '#004D98'], sleeve: '#004D98', shorts: '#004D98', socks: '#A50044',
      number: '#EDBB00', trim: '#EDBB00', skin: '#F1C29B', hair: '#5B3A21',
      confetti: ['#A50044', '#004D98', '#EDBB00'],
    },
    ronaldo: {
      stripes: ['#FFFFFF'], sleeve: '#FFFFFF', shorts: '#FFFFFF', socks: '#FFFFFF',
      number: '#1B2A6B', trim: '#D4AF37', skin: '#D9A27A', hair: '#1A1411',
      confetti: ['#FFFFFF', '#D4AF37', '#1B2A6B'],
    },
  };

  const GOALS = {
    top: { cx: W / 2, lineY: PITCH.y, dir: -1, shake: 0 },
    bottom: { cx: W / 2, lineY: PITCH.y + PITCH.h, dir: 1, shake: 0 },
  };
  const ATTACK = { messi: 'top', ronaldo: 'bottom' };
  const OPP = { messi: 'ronaldo', ronaldo: 'messi' };

  let CONFIG = {
    teams: {
      messi: { name: 'MESSI', number: '10', celebrate: '¡VAMOS!' },
      ronaldo: { name: 'RONALDO', number: '7', celebrate: 'SIUUU!' },
    },
    megaBallThreshold: 10,
    tip: '',
    boardText: 'SEND A GIFT TO SCORE FOR YOUR TEAM!',
  };

  // ---------- Helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);

  // Seeded random so the pre-rendered grass texture is identical after every resize.
  function seeded(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function formatTime(ms) {
    const total = Math.ceil(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  const canvas = document.getElementById('game');
  const mainCtx = canvas.getContext('2d');
  const bg = document.createElement('canvas'); // pre-rendered stadium + pitch
  const bgCtx = bg.getContext('2d');
  let ctx = mainCtx; // swapped to bgCtx while pre-rendering

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }

  // Sets a font no larger than `size` that fits `text` within `maxW`.
  function fitFont(text, maxW, size, weight = '900') {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const w = ctx.measureText(text).width;
    if (w > maxW) ctx.font = `${weight} ${Math.floor((size * maxW) / w)}px ${FONT}`;
  }

  function outlinedText(text, x, y, fill, stroke, lw) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function teamFill(team, x0, x1) {
    if (team !== 'messi') return '#FFFFFF';
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, '#004D98');
    g.addColorStop(1, '#A50044');
    return g;
  }

  // ---------- Sound (Web Audio, no files needed) ----------
  const Sound = {
    ctx: null,
    noise: null,
    muted: false,
    lastGoal: 0,
    init() {
      if (this.ctx) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        const len = this.ctx.sampleRate * 2;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        this.ctx = null;
      }
    },
    ready() {
      return this.ctx && !this.muted;
    },
    tone(freq, dur, vol, type = 'sine') {
      if (!this.ready()) return;
      const c = this.ctx;
      const t = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    kick() {
      if (!this.ready()) return;
      const c = this.ctx;
      const t = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.setValueAtTime(190, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.45, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.16);
    },
    // Referee whistle: one blast per entry (seconds).
    whistle(blasts) {
      if (!this.ready()) return;
      const c = this.ctx;
      let t = c.currentTime;
      for (const d of blasts) {
        const o = c.createOscillator();
        const lfo = c.createOscillator();
        const depth = c.createGain();
        const g = c.createGain();
        o.frequency.value = 2750;
        lfo.frequency.value = 34;
        depth.gain.value = 170;
        lfo.connect(depth).connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.13, t + 0.02);
        g.gain.setValueAtTime(0.13, t + d - 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(c.destination);
        o.start(t);
        lfo.start(t);
        o.stop(t + d + 0.02);
        lfo.stop(t + d + 0.02);
        t += d + 0.12;
      }
    },
    goal(big) {
      if (!this.ready()) return;
      const c = this.ctx;
      const t = c.currentTime;
      if (t - this.lastGoal < 0.15) return;
      this.lastGoal = t;
      const len = big ? 2.6 : 1.4;
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 0.6;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(big ? 0.5 : 0.32, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      src.connect(f).connect(g).connect(c.destination);
      src.start(t);
      src.stop(t + len);
      for (const freq of big ? [392, 494, 587] : [440, 554]) {
        const o = c.createOscillator();
        const og = c.createGain();
        o.type = 'sawtooth';
        o.frequency.value = freq;
        og.gain.setValueAtTime(0.0001, t);
        og.gain.exponentialRampToValueAtTime(0.06, t + 0.03);
        og.gain.exponentialRampToValueAtTime(0.001, t + (big ? 0.9 : 0.4));
        o.connect(og).connect(c.destination);
        o.start(t);
        o.stop(t + 1);
      }
    },
  };

  // Celebration clips (public/sounds/*.mp3), triggered from the controller.
  const CLIPS = { messi: new Audio('/sounds/messi.mp3'), ronaldo: new Audio('/sounds/ronaldo.mp3') };
  for (const a of Object.values(CLIPS)) a.preload = 'auto';

  function stopClips() {
    for (const a of Object.values(CLIPS)) {
      a.pause();
      a.currentTime = 0;
    }
  }

  function playClip(team) {
    stopClips();
    if (team === 'stop' || !CLIPS[team]) return;
    if (!Sound.muted) CLIPS[team].play().catch((err) => console.warn('Sound blocked — click Start on the game screen first.', err));
    const p = players[team];
    if (p.state !== 'kick') Object.assign(p, { state: 'celebrate', stateT: 3 });
    cheer[team] = 1;
  }

  // ---------- Game state ----------
  const serverScores = { messi: 0, ronaldo: 0 };
  const shown = { messi: 0, ronaldo: 0 };
  const pop = { messi: 0, ronaldo: 0 };
  const cheer = { messi: 0, ronaldo: 0 };
  const combo = { messi: { n: 0, t: -9 }, ronaldo: { n: 0, t: -9 } };
  const lastDue = { messi: 0, ronaldo: 0 };
  let balls = [];
  let spawnQueue = [];
  let particles = [];
  let floats = [];
  let banner = null;
  let now = 0;

  const match = {
    phase: 'ready', duration: 180000, remaining: 180000, round: 1,
    wins: { messi: 0, ronaldo: 0 }, streak: { team: null, count: 0 },
    lastResult: null, autoNextRound: true, recvAt: 0,
  };
  let resultT = 99; // seconds since full time (drives the result card animation)
  let lastBeep = 0;

  function makePlayer(team) {
    const home = team === 'messi' ? { x: W / 2, y: MID_Y + 320 } : { x: W / 2, y: MID_Y - 300 };
    return {
      team, home, x: home.x, y: home.y, face: 1, state: 'idle', stateT: 0,
      anim: Math.random() * 10, ball: null, kickT: 0, kicked: false, moving: false,
    };
  }
  const players = { messi: makePlayer('messi'), ronaldo: makePlayer('ronaldo') };

  // Goals still to be scored on screen for a team (queued + on the field).
  function pending(team) {
    let n = 0;
    for (const q of spawnQueue) if (q.team === team) n += q.value;
    for (const b of balls) if (b.team === team && !b.scored) n += b.value;
    return n;
  }

  function fieldCount(team) {
    let n = 0;
    for (const b of balls) if (b.team === team && (b.state === 'drop' || b.state === 'ground')) n++;
    return n;
  }

  // Players hurry up when lots of balls are waiting.
  function speedMult(team) {
    return Math.min(3.2, 1 + Math.max(0, pending(team) - 1) * 0.15);
  }

  function timeLeft() {
    const live = match.phase === 'running' || match.phase === 'intermission';
    return Math.max(0, match.remaining - (live ? performance.now() - match.recvAt : 0));
  }

  // ---------- Server events ----------
  function setScores(scores) {
    if (!scores) return;
    for (const t of ['messi', 'ronaldo']) serverScores[t] = Number(scores[t]) || 0;
  }

  function setMatch(m) {
    if (!m) return;
    Object.assign(match, m);
    match.recvAt = performance.now();
  }

  function onSpawn(msg) {
    const team = msg.team;
    const count = msg.count;
    const values = count > (CONFIG.megaBallThreshold || 10) ? [count] : Array(count).fill(1);
    let due = Math.max(now, lastDue[team]);
    for (const v of values) {
      spawnQueue.push({ id: msg.id, team, value: v, due });
      due += 0.2;
    }
    lastDue[team] = due;
    addFloat(msg);
  }

  function onUndo(msg) {
    spawnQueue = spawnQueue.filter((q) => q.id !== msg.id);
    balls = balls.filter((b) => b.id !== msg.id || b.scored);
  }

  function clearField() {
    spawnQueue = [];
    balls = balls.filter((b) => b.scored);
    for (const t of ['messi', 'ronaldo']) {
      shown[t] = 0;
      lastDue[t] = 0;
      combo[t].n = 0;
      players[t].ball = null;
      if (players[t].state === 'kick') players[t].state = 'idle';
    }
  }

  function onReset() {
    clearField();
    balls = [];
    floats = [];
    banner = null;
    for (const t of ['messi', 'ronaldo']) {
      Object.assign(players[t], { state: 'idle', x: players[t].home.x, y: players[t].home.y });
    }
  }

  function onMatchEvent(msg) {
    switch (msg.event) {
      case 'start':
        banner = { team: null, text: `KICK-OFF! ROUND ${match.round}`, t: 0, big: false };
        Sound.whistle([0.6]);
        break;
      case 'resume':
      case 'pause':
        Sound.whistle([0.25]);
        break;
      case 'end': {
        Sound.whistle([0.3, 0.3, 0.9]);
        clearField();
        banner = null;
        resultT = 0;
        const r = match.lastResult;
        const stay = (match.remaining || 10000) / 1000;
        if (r && r.winner !== 'draw') {
          Object.assign(players[r.winner], { state: 'celebrate', stateT: stay });
          Object.assign(players[OPP[r.winner]], { state: 'sad', stateT: stay });
          cheer[r.winner] = 1;
          Sound.goal(true);
        } else {
          for (const t of ['messi', 'ronaldo']) Object.assign(players[t], { state: 'sad', stateT: 2.5 });
        }
        break;
      }
      default:
        break;
    }
  }

  function handle(msg) {
    setMatch(msg.match);
    setScores(msg.scores);
    if (msg.type === 'spawn') onSpawn(msg);
    else if (msg.type === 'undo') onUndo(msg);
    else if (msg.type === 'reset') onReset(msg);
    else if (msg.type === 'match') onMatchEvent(msg);
    else if (msg.type === 'sound') playClip(msg.team);
  }

  function connect() {
    const es = new EventSource('/events');
    es.onmessage = (e) => {
      try {
        handle(JSON.parse(e.data));
      } catch (err) {
        console.error(err);
      }
    };
  }

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).catch((err) => console.error(err));
  }

  // ---------- Balls ----------
  function makeBall(q) {
    const r = q.value > 1 ? Math.min(58, BALL_R + 16 * Math.log10(q.value)) : BALL_R;
    const [y0, y1] = q.team === 'messi'
      ? [MID_Y + 130, PITCH.y + PITCH.h - 230]
      : [PITCH.y + 230, MID_Y - 130];
    return {
      id: q.id, team: q.team, value: q.value, r,
      x: rand(PITCH.x + 130, PITCH.x + PITCH.w - 130), y: rand(y0, y1), z: 1100,
      vx: 0, vy: 0, vz: 0, rot: rand(0, 6), state: 'drop', bounced: false,
      scored: false, netT: 0, alpha: 1, shot: null,
    };
  }

  function processQueue() {
    for (let i = 0; i < spawnQueue.length; i++) {
      const q = spawnQueue[i];
      if (q.due > now || fieldCount(q.team) >= MAX_FIELD_BALLS) continue;
      spawnQueue.splice(i--, 1);
      balls.push(makeBall(q));
    }
  }

  function launch(b) {
    const g = GOALS[ATTACK[b.team]];
    const margin = Math.max(0, Math.min(GOAL_HALF - b.r - 14, 115));
    const x1 = g.cx + rand(-margin, margin);
    const y1 = g.lineY + g.dir * 22;
    const dx = x1 - b.x;
    const dy = y1 - b.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = (b.value > 1 ? 1050 : 1450) * Math.sqrt(speedMult(b.team));
    b.shot = {
      u: 0, x0: b.x, y0: b.y, x1, y1, dur: dist / speed,
      h: rand(60, 170), zEnd: rand(6, Math.max(8, GOAL_HEIGHT - 2 * b.r - 10)),
      curve: rand(-70, 70), nx: -dy / dist, ny: dx / dist, dx: dx / dist, dy: dy / dist,
      speed, spin: Math.sign(dx) || 1,
    };
    b.state = 'shot';
    Sound.kick();
  }

  function updateBall(b, dt) {
    if (b.state === 'drop') {
      b.vz -= GRAVITY * dt;
      b.z += b.vz * dt;
      if (b.z <= 0) {
        b.z = 0;
        if (Math.abs(b.vz) < 260) {
          b.vz = 0;
          b.state = 'ground';
        } else {
          b.vz = -b.vz * 0.42;
          if (!b.bounced) {
            b.bounced = true;
            b.vx = rand(-60, 60);
            b.vy = rand(-60, 60);
          }
        }
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += (b.vx * dt) / b.r;
    } else if (b.state === 'ground') {
      const f = Math.exp(-3 * dt);
      b.vx *= f;
      b.vy *= f;
      b.x = clamp(b.x + b.vx * dt, PITCH.x + 60, PITCH.x + PITCH.w - 60);
      b.y += b.vy * dt;
      b.rot += (Math.hypot(b.vx, b.vy) * dt) / b.r;
    } else if (b.state === 'shot') {
      const s = b.shot;
      s.u = Math.min(1, s.u + dt / s.dur);
      const u = s.u;
      const off = s.curve * Math.sin(Math.PI * u);
      b.x = s.x0 + (s.x1 - s.x0) * u + s.nx * off;
      b.y = s.y0 + (s.y1 - s.y0) * u + s.ny * off;
      b.z = s.zEnd * u + 4 * s.h * u * (1 - u);
      b.rot += dt * 22 * s.spin;
      if (u >= 1) {
        b.state = 'net';
        b.vx = s.dx * s.speed * 0.3;
        b.vy = s.dy * s.speed * 0.3;
        b.vz = 0;
        scoreGoal(b);
      }
    } else if (b.state === 'net') {
      const g = GOALS[ATTACK[b.team]];
      b.netT += dt;
      b.vz -= GRAVITY * dt;
      b.z = Math.max(0, b.z + b.vz * dt);
      if (b.z === 0) b.vz = 0;
      const f = Math.exp(-7 * dt);
      b.vx *= f;
      b.vy *= f;
      b.x = clamp(b.x + b.vx * dt, g.cx - GOAL_HALF + b.r, g.cx + GOAL_HALF - b.r);
      const deep = g.lineY + g.dir * 40;
      b.y = g.dir < 0 ? Math.max(deep, b.y + b.vy * dt) : Math.min(deep, b.y + b.vy * dt);
      if (b.netT > 1.1) b.alpha -= dt * 2.5;
    }
  }

  function scoreGoal(b) {
    b.scored = true;
    const team = b.team;
    const g = GOALS[ATTACK[team]];
    g.shake = 1;
    cheer[team] = 1;
    burst(b.x, g.lineY - 40, team, b.value > 1 ? 160 : 40);

    const c = combo[team];
    if (b.value > 1) {
      banner = { team, text: `MEGA GOAL +${b.value}!`, t: 0, big: true };
      c.n = 0;
    } else {
      c.n = now - c.t < 1.8 ? c.n + 1 : 1;
      c.t = now;
      if (!(banner && banner.big && banner.t < 1.5)) {
        banner = { team, text: c.n > 1 ? `GOAL x${c.n}!` : 'GOAL!', t: 0, big: false };
      }
    }
    Sound.goal(b.value > 1);

    const p = players[team];
    const o = players[OPP[team]];
    if (pending(team) === 0 && p.state !== 'kick') {
      p.state = 'celebrate';
      p.stateT = 1.8;
    }
    if ((o.state === 'idle' || o.state === 'sad') && pending(OPP[team]) === 0) {
      o.state = 'sad';
      o.stateT = 1.4;
    }
  }

  // ---------- Players ----------
  function pickBall(p) {
    let best = null;
    let bestD = Infinity;
    for (const b of balls) {
      if (b.team !== p.team || (b.state !== 'drop' && b.state !== 'ground')) continue;
      const d = Math.hypot(b.x - p.x, b.y - p.y) + (b.state === 'drop' ? 200 : 0);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  function updatePlayer(p, dt) {
    p.anim += dt;
    const mult = speedMult(p.team);

    if (p.state === 'kick') {
      p.kickT += dt * mult;
      if (!p.kicked && p.kickT >= 0.1) {
        p.kicked = true;
        if (p.ball && p.ball.state === 'ground' && balls.includes(p.ball)) launch(p.ball);
      }
      if (p.kickT >= 0.26) {
        p.state = 'idle';
        p.ball = null;
      }
      return;
    }

    if (p.state === 'celebrate' || p.state === 'sad') {
      p.stateT -= dt;
      if (p.stateT > 0 && !pickBall(p)) return;
      p.state = 'idle';
    }

    if (!p.ball || !balls.includes(p.ball) || (p.ball.state !== 'drop' && p.ball.state !== 'ground')) {
      p.ball = pickBall(p);
    }

    const b = p.ball;
    let tx;
    let ty;
    let speed;
    if (b) {
      // Stand behind the ball, on the line from the goal through the ball.
      const g = GOALS[ATTACK[p.team]];
      let dx = b.x - g.cx;
      let dy = b.y - g.lineY;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      tx = b.x + dx * (b.r + 16);
      ty = b.y + dy * (b.r + 16);
      speed = 520 * mult;
    } else {
      tx = p.home.x;
      ty = p.home.y;
      speed = 220;
    }

    const mx = tx - p.x;
    const my = ty - p.y;
    const md = Math.hypot(mx, my);
    const step = speed * dt;
    if (md > 0.5) {
      if (md <= step) {
        p.x = tx;
        p.y = ty;
      } else {
        p.x += (mx / md) * step;
        p.y += (my / md) * step;
      }
      if (Math.abs(mx) > 3) p.face = mx > 0 ? 1 : -1;
    }
    const left = Math.hypot(tx - p.x, ty - p.y);
    p.moving = md > 4;
    p.state = 'idle';
    if (b && left < 6 && b.state === 'ground') {
      p.state = 'kick';
      p.kickT = 0;
      p.kicked = false;
      p.moving = false;
    }
  }

  // ---------- Effects ----------
  function burst(x, y, team, n) {
    const cols = KITS[team].confetti;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(200, 950);
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 350, g: 900,
        rot: rand(0, 6), vr: rand(-12, 12), w: rand(8, 16), h: rand(5, 10),
        c: cols[i % cols.length], life: rand(1.2, 2.2),
      });
    }
    trimParticles();
  }

  // Slow confetti falling from the top of the pitch (full-time celebration).
  function rain(team, n) {
    const cols = KITS[team].confetti;
    for (let i = 0; i < n; i++) {
      particles.push({
        x: rand(PITCH.x, PITCH.x + PITCH.w), y: rand(PITCH.y - 60, PITCH.y + 10), vx: rand(-40, 40), vy: rand(80, 180), g: 60,
        rot: rand(0, 6), vr: rand(-8, 8), w: rand(10, 18), h: rand(6, 10), c: pick(cols), life: rand(4, 7),
      });
    }
    trimParticles();
  }

  function trimParticles() {
    if (particles.length > 1000) particles.splice(0, particles.length - 1000);
  }

  function addFloat(msg) {
    const team = msg.team;
    const stack = floats.filter((f) => f.team === team).length;
    floats.push({
      team,
      text: `${msg.gift ? msg.gift + '  ' : ''}+${msg.count}`,
      sub: msg.sender ? `from ${msg.sender}` : '',
      y: (team === 'messi' ? MID_Y + 150 : MID_Y - 190) + (team === 'messi' ? 1 : -1) * (stack % 3) * 76,
      t: 0,
    });
    if (floats.length > 8) floats.shift();
  }

  // ---------- Crowd ----------
  // Fans are grouped by colour so the whole crowd is drawn with a handful of fills.
  const crowd = [];
  const crowdByShirt = new Map();
  const crowdBySkin = new Map();
  (function buildCrowd() {
    const skins = ['#f1c29b', '#e0ac7e', '#c68b5e', '#8d5a3b', '#f6d3b3'];
    const shirts = {
      messi: ['#1b4fd0', '#c0103a', '#1b4fd0', '#a50044', '#f2c94c', '#ffffff'],
      ronaldo: ['#ffffff', '#ffffff', '#f2c94c', '#e8e8ee', '#1b2a6b', '#c0103a'],
    };
    const barTop = PITCH.y + PITCH.h + 70;
    const add = (x, y, team) => {
      if (y > barTop && y < H - 18) return; // hidden behind the bottom bar
      crowd.push({
        x: x + rand(-2, 2), y: y + rand(-1.5, 1.5), team,
        shirt: pick(shirts[team]), skin: pick(skins), ph: rand(0, 6), scarf: Math.random() < 0.3,
      });
    };
    for (let y = 150, row = 0; y < PITCH.y - 96; y += 14, row++) {
      for (let x = 6 + (row % 2) * 7; x < W; x += 14) add(x, y, x < W / 2 ? 'messi' : 'ronaldo');
    }
    for (let y = PITCH.y - 96; y < PITCH.y + PITCH.h + 50; y += 15) {
      for (const x of [9, 25, 41]) add(x, y, 'messi');
      for (const x of [W - 9, W - 25, W - 41]) add(x, y, 'ronaldo');
    }
    for (let y = PITCH.y + PITCH.h + 50, row = 0; y < H + 8; y += 14, row++) {
      for (let x = 6 + (row % 2) * 7; x < W; x += 14) add(x, y, x < W / 2 ? 'messi' : 'ronaldo');
    }
    for (const f of crowd) {
      if (!crowdByShirt.has(f.shirt)) crowdByShirt.set(f.shirt, []);
      crowdByShirt.get(f.shirt).push(f);
      if (!crowdBySkin.has(f.skin)) crowdBySkin.set(f.skin, []);
      crowdBySkin.get(f.skin).push(f);
    }
  })();

  // ---------- Update ----------
  function update(dt) {
    processQueue();
    for (const b of balls) updateBall(b, dt);
    balls = balls.filter((b) => b.alpha > 0);
    updatePlayer(players.messi, dt);
    updatePlayer(players.ronaldo, dt);

    for (const p of particles) {
      p.vy += p.g * dt;
      p.vx *= Math.exp(-1.5 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0 && p.y < H + 20);
    for (const f of floats) f.t += dt;
    floats = floats.filter((f) => f.t < 3);
    for (const g of Object.values(GOALS)) g.shake = Math.max(0, g.shake - dt * 1.8);
    for (const t of ['messi', 'ronaldo']) {
      cheer[t] = Math.max(0, cheer[t] - dt * 0.6);
      pop[t] = Math.max(0, pop[t] - dt * 3);
    }
    if (banner) {
      banner.t += dt;
      if (banner.t > (banner.big ? 2.2 : 1.6)) banner = null;
    }

    // match clock effects
    resultT += dt;
    if (match.phase === 'running') {
      const secs = Math.ceil(timeLeft() / 1000);
      if (secs <= 5 && secs >= 1 && secs !== lastBeep) Sound.tone(880, 0.12, 0.15);
      lastBeep = secs;
    } else {
      lastBeep = 0;
    }
    const r = match.lastResult;
    if (match.phase === 'intermission' && r && r.winner !== 'draw') {
      cheer[r.winner] = Math.max(cheer[r.winner], 0.6);
      if (Math.random() < dt * 30) rain(r.winner, 2);
    }
  }

  // ---------- Static background (pre-rendered on resize) ----------
  const runoff = () => ({ x: PITCH.x - 24, y: PITCH.y - 24, w: PITCH.w + 48, h: PITCH.h + 48 });

  function drawStands() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1640');
    g.addColorStop(0.5, '#0c1b50');
    g.addColorStop(1, '#070f30');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 150; y < H; y += 28) ctx.fillRect(0, y, W, 3);
  }

  // Blue walls around the run-off with a gold trim and small lamps.
  function drawWalls() {
    const R = runoff();
    const wall = (x, y, w, h, vertical) => {
      const g = vertical ? ctx.createLinearGradient(x, 0, x + w, 0) : ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#0a2470');
      g.addColorStop(0.5, '#1d4fc4');
      g.addColorStop(1, '#0a2470');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#f2c94c';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    };
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 24;
    wall(R.x - 38, R.y - 30, 38, R.h + 60, true);
    wall(R.x + R.w, R.y - 30, 38, R.h + 60, true);
    wall(R.x - 38, R.y - 30, R.w + 76, 30, false);
    wall(R.x - 38, R.y + R.h, R.w + 76, 30, false);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = '#cfe3ff';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#eef6ff';
    for (let y = R.y + 60; y < R.y + R.h - 20; y += 120) {
      circle(R.x - 19, y, 4);
      ctx.fill();
      circle(R.x + R.w + 19, y, 4);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLines() {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 4.5;
    ctx.strokeRect(PITCH.x, PITCH.y, PITCH.w, PITCH.h);
    ctx.beginPath();
    ctx.moveTo(PITCH.x, MID_Y);
    ctx.lineTo(PITCH.x + PITCH.w, MID_Y);
    ctx.stroke();
    circle(W / 2, MID_Y, 125);
    ctx.stroke();
    circle(W / 2, MID_Y, 7);
    ctx.fill();

    for (const g of Object.values(GOALS)) {
      const d = -g.dir; // direction into the pitch
      const box = (hw, depth) => {
        ctx.beginPath();
        ctx.moveTo(W / 2 - hw, g.lineY);
        ctx.lineTo(W / 2 - hw, g.lineY + d * depth);
        ctx.lineTo(W / 2 + hw, g.lineY + d * depth);
        ctx.lineTo(W / 2 + hw, g.lineY);
        ctx.stroke();
      };
      box(280, 210);
      box(155, 70);
      const spotY = g.lineY + d * 140;
      circle(W / 2, spotY, 7);
      ctx.fill();
      const a = Math.acos(70 / 125);
      const mid = d > 0 ? Math.PI / 2 : -Math.PI / 2;
      ctx.beginPath();
      ctx.arc(W / 2, spotY, 125, mid - a, mid + a);
      ctx.stroke();
    }
    const corner = (x, y, a0) => {
      ctx.beginPath();
      ctx.arc(x, y, 22, a0, a0 + Math.PI / 2);
      ctx.stroke();
    };
    corner(PITCH.x, PITCH.y, 0);
    corner(PITCH.x + PITCH.w, PITCH.y, Math.PI / 2);
    corner(PITCH.x + PITCH.w, PITCH.y + PITCH.h, Math.PI);
    corner(PITCH.x, PITCH.y + PITCH.h, -Math.PI / 2);
  }

  function drawPitchStatic() {
    const R = runoff();
    ctx.fillStyle = '#3f9b2c';
    ctx.fillRect(R.x, R.y, R.w, R.h);

    // mowing stripes
    const rows = 14;
    const sh = PITCH.h / rows;
    for (let i = 0; i < rows; i++) {
      ctx.fillStyle = i % 2 ? '#5fc23c' : '#52b333';
      ctx.fillRect(PITCH.x, PITCH.y + i * sh, PITCH.w, sh + 0.5);
    }

    // grass texture
    const rnd = seeded(20261001);
    for (let i = 0; i < 12000; i++) {
      const x = R.x + rnd() * R.w;
      const y = R.y + rnd() * R.h;
      ctx.fillStyle = rnd() < 0.55 ? 'rgba(20,70,10,0.10)' : 'rgba(230,255,200,0.07)';
      ctx.fillRect(x, y, 1.6, 2 + rnd() * 4);
    }

    // sunlit centre, darker edges
    const lg = ctx.createRadialGradient(W / 2, MID_Y, 60, W / 2, MID_Y, 900);
    lg.addColorStop(0, 'rgba(255,255,200,0.14)');
    lg.addColorStop(0.55, 'rgba(0,0,0,0)');
    lg.addColorStop(1, 'rgba(0,30,0,0.28)');
    ctx.fillStyle = lg;
    ctx.fillRect(R.x, R.y, R.w, R.h);

    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    circle(W / 2, MID_Y, 100);
    ctx.stroke();

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 2;
    drawLines();
    ctx.restore();
  }

  function renderStatic() {
    bg.width = canvas.width;
    bg.height = canvas.height;
    ctx = bgCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, bg.width, bg.height);
    applyView();
    drawStands();
    drawWalls();
    drawPitchStatic();
    ctx = mainCtx;
  }

  // ---------- Dynamic drawing ----------
  function drawCrowd() {
    const jump = (f) => (Math.sin(now * 12 + f.ph) * 0.5 + 0.5) * (1 + cheer[f.team] * 10);
    ctx.save();
    ctx.globalAlpha = 0.68; // keep the stands in the background
    for (const [color, fans] of crowdByShirt) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const f of fans) ctx.rect(f.x - 6, f.y - jump(f), 12, 10);
      ctx.fill();
    }
    for (const [color, fans] of crowdBySkin) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const f of fans) {
        const y = f.y - 5 - jump(f);
        ctx.moveTo(f.x + 4.5, y);
        ctx.arc(f.x, y, 4.5, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    // scarves held up when their team scores
    for (const team of ['messi', 'ronaldo']) {
      if (cheer[team] < 0.25) continue;
      const [c1, c2] = team === 'messi' ? ['#a50044', '#1b4fd0'] : ['#ffffff', '#f2c94c'];
      ctx.fillStyle = c1;
      ctx.beginPath();
      for (const f of crowd) if (f.scarf && f.team === team) ctx.rect(f.x - 9, f.y - 17 - jump(f) + Math.sin(now * 10 + f.ph) * 2, 18, 4);
      ctx.fill();
      ctx.fillStyle = c2;
      ctx.beginPath();
      for (const f of crowd) if (f.scarf && f.team === team) ctx.rect(f.x - 2, f.y - 17 - jump(f) + Math.sin(now * 10 + f.ph) * 2, 4, 4);
      ctx.fill();
    }
    ctx.restore();
  }

  // Steel roof beams in the top corners.
  function drawRoof() {
    ctx.strokeStyle = '#1a2238';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    for (const s of [1, -1]) {
      const x0 = s > 0 ? 0 : W;
      ctx.beginPath();
      ctx.moveTo(x0, 340);
      ctx.lineTo(x0 + s * 110, 110);
      ctx.lineTo(x0 + s * 40, 0);
      ctx.moveTo(x0, 210);
      ctx.lineTo(x0 + s * 110, 110);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  function drawFloodlights() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of [1, -1]) {
      const x = s > 0 ? 66 : W - 66;
      const y = 44;
      for (let i = 0; i < 4; i++) {
        const a0 = 0.75 + i * 0.17;
        const a = s > 0 ? a0 : Math.PI - a0;
        ctx.fillStyle = 'rgba(255,255,225,0.022)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a - 0.045) * 1700, y + Math.sin(a - 0.045) * 1700);
        ctx.lineTo(x + Math.cos(a + 0.045) * 1700, y + Math.sin(a + 0.045) * 1700);
        ctx.closePath();
        ctx.fill();
      }
      const g = ctx.createRadialGradient(x, y, 0, x, y, 260);
      g.addColorStop(0, 'rgba(255,255,240,0.7)');
      g.addColorStop(0.15, 'rgba(220,235,255,0.28)');
      g.addColorStop(1, 'rgba(200,220,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 260, y - 260, 520, 520);
    }
    ctx.restore();
    // lamp panels
    for (const s of [1, -1]) {
      const x = s > 0 ? 66 : W - 66;
      ctx.save();
      ctx.translate(x, 44);
      ctx.rotate(s * 0.5);
      ctx.fillStyle = '#20283f';
      rr(-34, -34, 68, 68, 8);
      ctx.fill();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          rr(-28 + i * 20, -28 + j * 20, 16, 16, 4);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  function drawCrown(x, y, w, fill) {
    const h = w * 0.7;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(-w / 2, h / 2);
    ctx.lineTo(-w / 2, -h / 5);
    ctx.lineTo(-w / 4, h / 8);
    ctx.lineTo(0, -h / 2);
    ctx.lineTo(w / 4, h / 8);
    ctx.lineTo(w / 2, -h / 5);
    ctx.lineTo(w / 2, h / 2);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    for (const px of [-w / 2, 0, w / 2]) {
      circle(px, px === 0 ? -h / 2 : -h / 5, w * 0.07);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMiniBall(x, y, r) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    circle(x, y, r);
    ctx.fill();
    ctx.save();
    circle(x, y, r);
    ctx.clip();
    ctx.fillStyle = '#1d1d22';
    const penta = (px, py, size, rot) => {
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = rot + (k * Math.PI * 2) / 5 - Math.PI / 2;
        if (k === 0) ctx.moveTo(px + Math.cos(a) * size, py + Math.sin(a) * size);
        else ctx.lineTo(px + Math.cos(a) * size, py + Math.sin(a) * size);
      }
      ctx.closePath();
      ctx.fill();
    };
    penta(x, y, r * 0.36, 0);
    for (let k = 0; k < 5; k++) {
      const a = (k * Math.PI * 2) / 5 - Math.PI / 2;
      penta(x + Math.cos(a) * r * 0.98, y + Math.sin(a) * r * 0.98, r * 0.32, Math.PI);
    }
    ctx.restore();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1.5, r * 0.09);
    circle(x, y, r);
    ctx.stroke();
    ctx.restore();
  }

  // Waving cloth banner beside the top goal.
  function drawCloth(cx, cy, w, h, tilt, team, text) {
    const messi = team === 'messi';
    const wave = Math.sin(now * 2.2 + cx) * 4;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    if (cheer[team] > 0.05) {
      ctx.shadowColor = messi ? '#3d7bff' : '#f2c94c';
      ctx.shadowBlur = 34 * cheer[team];
    }
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2);
    ctx.quadraticCurveTo(0, -h / 2 + wave, w / 2, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.quadraticCurveTo(0, h / 2 + wave, -w / 2, h / 2);
    ctx.closePath();
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    if (messi) {
      g.addColorStop(0, '#8a1048');
      g.addColorStop(0.35, '#1d4fc4');
      g.addColorStop(1, '#0b2a8c');
    } else {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#e3e7f1');
    }
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#f2c94c';
    ctx.stroke();
    const ink = messi ? '#ffffff' : '#1b2a6b';
    drawCrown(-w / 2 + 30, wave * 0.5, 30, ink);
    drawCrown(w / 2 - 30, wave * 0.5, 30, ink);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    fitFont(text, w - 120, 30, 'italic 900');
    ctx.fillText(text, 0, 2 + wave * 0.5);
    ctx.restore();
  }

  // Hanging pennant on the side wall.
  function drawPennant(cx, top, team) {
    const messi = team === 'messi';
    const info = CONFIG.teams[team];
    const w = 78;
    const h = 300;
    ctx.strokeStyle = '#c9a43a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 - 8, top);
    ctx.lineTo(cx + w / 2 + 8, top);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx, top);
    const shake = cheer[team] > 0.05 ? Math.sin(now * 14) * 0.06 * cheer[team] : 0;
    ctx.rotate(Math.sin(now * 1.4 + cx) * 0.025 + shake);
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(0, h - 34);
    ctx.lineTo(-w / 2, h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (messi) {
      g.addColorStop(0, '#2457d6');
      g.addColorStop(1, '#0a2580');
    } else {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#e6e9f2');
    }
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 6;
    ctx.strokeStyle = messi ? '#d0103a' : '#f2c94c';
    ctx.stroke();
    const ink = messi ? '#ffffff' : '#1b2a6b';
    drawCrown(0, 42, 34, ink);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    fitFont(info.name, w - 14, 24, 'italic 900');
    ctx.fillText(info.name, 0, 92);
    ctx.font = `900 56px ${FONT}`;
    ctx.fillText(info.number || '', 0, 150);
    drawMiniBall(0, 214, 18);
    ctx.restore();
  }

  function drawBottomBar() {
    const y0 = PITCH.y + PITCH.h + 76;
    const y1 = H - 22;
    const mid = (y0 + y1) / 2;
    roundPoly([[24, y0], [W - 24, y0], [W - 66, y1], [66, y1]], 18);
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#18235a');
    g.addColorStop(1, '#070b1f');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#f2c94c';
    ctx.stroke();
    roundPoly([[150, y0 + 20], [W - 150, y0 + 20], [W - 176, y1 - 18], [176, y1 - 18]], 12);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#c9a43a';
    ctx.stroke();

    const text = CONFIG.boardText || '';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(text, 560, 34, 'italic 900');
    const tw = ctx.measureText(text).width;
    ctx.save();
    ctx.shadowColor = 'rgba(242,201,76,0.7)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#f2c94c';
    ctx.fillText(text, W / 2, mid + 1);
    ctx.restore();
    drawCrown(W / 2 - tw / 2 - 34, mid, 30, '#f2c94c');
    drawCrown(W / 2 + tw / 2 + 34, mid, 30, '#f2c94c');
    ctx.fillStyle = '#c9a43a';
    const lineEnd = W / 2 - tw / 2 - 64;
    if (lineEnd > 200) {
      ctx.fillRect(200, mid - 1.5, lineEnd - 200, 3);
      ctx.fillRect(W - lineEnd, mid - 1.5, lineEnd - 200, 3);
    }
    drawMiniBall(60, y0 + 4, 30);
    drawMiniBall(W - 60, y0 + 4, 30);
  }

  function drawCornerFlags() {
    const corners = [
      [PITCH.x, PITCH.y], [PITCH.x + PITCH.w, PITCH.y],
      [PITCH.x, PITCH.y + PITCH.h], [PITCH.x + PITCH.w, PITCH.y + PITCH.h],
    ];
    for (const [x, y] of corners) {
      const dir = x < W / 2 ? 1 : -1;
      const top = y - 48;
      const wave = Math.sin(now * 6 + x * 0.01) * 5;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, y, 6, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f2f2f2';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, top);
      ctx.stroke();
      ctx.fillStyle = '#ffd400';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.quadraticCurveTo(x + dir * 12, top + wave * 0.5, x + dir * 24, top + 6 + wave);
      ctx.lineTo(x, top + 16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // Goal geometry: front frame on the goal line, back frame offset away from the pitch.
  function goalShape(g) {
    const far = g.dir < 0;
    const backY = g.lineY + g.dir * (far ? 45 : 50);
    const bw = far ? 140 : 162;
    const bh = GOAL_HEIGHT * (far ? 0.85 : 1.1);
    return { backY, bw, bh, topY: Math.min(g.lineY - GOAL_HEIGHT, backY - bh), bottomY: Math.max(g.lineY, backY) };
  }

  function drawNet(g) {
    const s = goalShape(g);
    const x0 = g.cx - Math.max(GOAL_HALF, s.bw);
    const x1 = g.cx + Math.max(GOAL_HALF, s.bw);
    ctx.save();
    ctx.beginPath();
    if (g.dir < 0) {
      ctx.moveTo(g.cx - s.bw, s.topY);
      ctx.lineTo(g.cx + s.bw, s.topY);
      ctx.lineTo(g.cx + GOAL_HALF, g.lineY);
      ctx.lineTo(g.cx - GOAL_HALF, g.lineY);
    } else {
      ctx.moveTo(g.cx - GOAL_HALF, s.topY);
      ctx.lineTo(g.cx + GOAL_HALF, s.topY);
      ctx.lineTo(g.cx + s.bw, s.bottomY);
      ctx.lineTo(g.cx - s.bw, s.bottomY);
    }
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = g.dir < 0 ? 'rgba(10,20,15,0.35)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(x0, s.topY, x1 - x0, s.bottomY - s.topY);
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = 2;
    const wob = g.shake * 7;
    for (let x = x0, i = 0; x <= x1; x += 16, i++) {
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(now * 45 + i) * wob, s.topY);
      ctx.lineTo(x - Math.sin(now * 45 + i) * wob, s.bottomY);
      ctx.stroke();
    }
    for (let y = s.topY, i = 0; y <= s.bottomY; y += 16, i++) {
      ctx.beginPath();
      ctx.moveTo(x0, y + Math.sin(now * 50 + i) * wob);
      ctx.lineTo(x1, y - Math.sin(now * 50 + i) * wob);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFrame(g) {
    const s = goalShape(g);
    const L = g.cx - GOAL_HALF;
    const R = g.cx + GOAL_HALF;
    const top = g.lineY - GOAL_HEIGHT;
    ctx.strokeStyle = 'rgba(235,235,235,0.85)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(L, top);
    ctx.lineTo(g.cx - s.bw, s.backY - s.bh);
    ctx.lineTo(g.cx - s.bw, s.backY);
    ctx.lineTo(L, g.lineY);
    ctx.moveTo(R, top);
    ctx.lineTo(g.cx + s.bw, s.backY - s.bh);
    ctx.lineTo(g.cx + s.bw, s.backY);
    ctx.lineTo(R, g.lineY);
    ctx.moveTo(g.cx - s.bw, s.backY - s.bh);
    ctx.lineTo(g.cx + s.bw, s.backY - s.bh);
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(L, g.lineY);
    ctx.lineTo(L, top);
    ctx.lineTo(R, top);
    ctx.lineTo(R, g.lineY);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function drawBall(b) {
    ctx.save();
    ctx.globalAlpha = clamp(b.alpha, 0, 1);
    const sh = clamp(1 - b.z / 900, 0.25, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.3 * sh})`;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, b.r * sh, b.r * 0.38 * sh, 0, 0, Math.PI * 2);
    ctx.fill();

    const cx = b.x;
    const cy = b.y - b.r - b.z;
    if (b.value > 1) {
      ctx.shadowColor = '#ffd23f';
      ctx.shadowBlur = 35;
    }
    ctx.fillStyle = '#ffffff';
    circle(cx, cy, b.r);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.save();
    circle(cx, cy, b.r);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(b.rot);
    ctx.fillStyle = '#1d1d22';
    const penta = (x, y, size, rot) => {
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = rot + (k * Math.PI * 2) / 5 - Math.PI / 2;
        const px = x + Math.cos(a) * size;
        const py = y + Math.sin(a) * size;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    };
    penta(0, 0, b.r * 0.36, 0);
    for (let k = 0; k < 5; k++) {
      const a = (k * Math.PI * 2) / 5 - Math.PI / 2;
      penta(Math.cos(a) * b.r * 0.98, Math.sin(a) * b.r * 0.98, b.r * 0.32, Math.PI);
    }
    ctx.restore();

    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(2.5, b.r * 0.1);
    circle(cx, cy, b.r);
    ctx.stroke();

    if (b.value > 1 && !b.scored) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `900 40px ${FONT}`;
      outlinedText(`+${b.value}`, cx, cy - b.r - 14, '#ffd23f', OUTLINE, 8);
    }
    ctx.restore();
  }

  function drawLeg(x, ang, kit) {
    ctx.save();
    ctx.translate(x, -46);
    ctx.rotate(ang);
    ctx.fillStyle = kit.skin;
    rr(-7, 0, 14, 24, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = kit.socks;
    rr(-7, 20, 14, 20, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#16161a';
    rr(-8, 38, 20, 10, 5);
    ctx.fill();
    ctx.restore();
  }

  function drawArm(x, ang, kit) {
    ctx.save();
    ctx.translate(x, -96);
    ctx.rotate(ang);
    ctx.fillStyle = kit.skin;
    rr(-6, 10, 12, 26, 5);
    ctx.fill();
    ctx.stroke();
    circle(0, 38, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = kit.sleeve;
    rr(-8, -2, 16, 18, 5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawHead(p, kit) {
    const hy = -142;
    const celebrating = p.state === 'celebrate';
    const sad = p.state === 'sad';

    ctx.fillStyle = kit.skin;
    circle(-35, hy + 4, 8);
    ctx.fill();
    ctx.stroke();
    circle(35, hy + 4, 8);
    ctx.fill();
    ctx.stroke();
    circle(0, hy, 37);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = kit.hair;
    if (p.team === 'messi') {
      ctx.beginPath();
      ctx.arc(0, hy, 38, Math.PI * 0.95, Math.PI * 2.05);
      ctx.quadraticCurveTo(22, hy - 24, 4, hy - 16);
      ctx.quadraticCurveTo(-16, hy - 26, -37, hy + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const ex = 37 * Math.cos(0.08 * Math.PI);
      const ey = hy + 37 * Math.sin(0.08 * Math.PI);
      ctx.beginPath();
      ctx.arc(0, hy, 37, 0.08 * Math.PI, 0.92 * Math.PI);
      ctx.quadraticCurveTo(0, hy + 32, ex, ey);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, hy, 38, Math.PI, Math.PI * 2);
      ctx.quadraticCurveTo(0, hy - 22, -38, hy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(-4, hy - 36, 22, 11, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,110,120,0.35)';
    circle(-22, hy + 10, 6);
    ctx.fill();
    circle(22, hy + 10, 6);
    ctx.fill();

    ctx.fillStyle = OUTLINE;
    if (celebrating) {
      ctx.lineWidth = 4;
      for (const ex of [-13, 13]) {
        ctx.beginPath();
        ctx.arc(ex, hy + 2, 6, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
    } else {
      for (const ex of [-13, 13]) {
        ctx.beginPath();
        ctx.ellipse(ex, hy + 1, 5, 6.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#fff';
      circle(-11, hy - 2, 2);
      ctx.fill();
      circle(15, hy - 2, 2);
      ctx.fill();
    }

    ctx.lineWidth = 4;
    ctx.strokeStyle = kit.hair;
    const tilt = sad ? 4 : 0;
    ctx.beginPath();
    ctx.moveTo(-20, hy - 10 + tilt);
    ctx.lineTo(-7, hy - 12 - tilt);
    ctx.moveTo(20, hy - 10 + tilt);
    ctx.lineTo(7, hy - 12 - tilt);
    ctx.stroke();

    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3.5;
    if (celebrating) {
      ctx.fillStyle = '#6b1d24';
      ctx.beginPath();
      ctx.ellipse(0, hy + 19, 10, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (sad) {
      ctx.beginPath();
      ctx.arc(0, hy + 26, 8, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, hy + 12, 9, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
    }
    ctx.lineWidth = 3;
  }

  function drawPlayer(p) {
    const kit = KITS[p.team];
    const team = CONFIG.teams[p.team];
    const t = p.anim;
    const celebrating = p.state === 'celebrate';
    const sad = p.state === 'sad';
    const swing = p.moving ? Math.sin(t * 18) * 0.7 : 0;
    const bob = p.moving ? Math.abs(Math.sin(t * 18)) * 6 : Math.sin(t * 2.5) * 1.5;
    const jump = celebrating ? Math.abs(Math.sin(t * 7)) * 24 : 0;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 40 - jump * 0.3, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(p.face, 1);
    ctx.translate(0, -bob - jump);
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;
    ctx.lineJoin = 'round';

    let kickLeg = 0;
    if (p.state === 'kick') kickLeg = Math.sin(Math.min(1, p.kickT / 0.26) * Math.PI) * 1.3;
    drawLeg(-12, swing, kit);
    drawLeg(12, -swing - kickLeg, kit);

    ctx.fillStyle = kit.shorts;
    rr(-27, -58, 54, 20, 6);
    ctx.fill();
    ctx.stroke();

    rr(-30, -106, 60, 52, 14);
    ctx.save();
    ctx.clip();
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = kit.stripes[i % kit.stripes.length];
      ctx.fillRect(-30 + i * 12, -106, 12, 52);
    }
    ctx.restore();
    rr(-30, -106, 60, 52, 14);
    ctx.stroke();
    ctx.strokeStyle = kit.trim;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -106, 12, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.save();
    ctx.scale(p.face, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 24px ${FONT}`;
    ctx.fillStyle = kit.number;
    ctx.fillText(team.number || '', 0, -76);
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;

    // arms (down vector (0,1) rotated by a: positive a swings the left arm outward/up)
    const armL = celebrating ? 2.6 : sad ? 2.95 : 0.15 + swing * 0.8;
    const armR = celebrating ? -2.6 : sad ? -2.95 : -0.15 - swing * 0.8;
    drawArm(-31, armL, kit);
    drawArm(31, armR, kit);

    drawHead(p, kit);
    ctx.restore();

    // name tag
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 26px ${FONT}`;
    const name = team.name;
    const tw = ctx.measureText(name).width + 30;
    rr(p.x - tw / 2, p.y + 16, tw, 38, 19);
    ctx.fillStyle = p.team === 'messi' ? teamFill('messi', p.x - tw / 2, p.x + tw / 2) : '#14286b';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#f2c94c';
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(name, p.x, p.y + 36);

    if (celebrating && team.celebrate) {
      const by = p.y - 230 - jump;
      ctx.font = `900 34px ${FONT}`;
      const bw = ctx.measureText(team.celebrate).width + 40;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 4;
      rr(p.x - bw / 2, by - 30, bw, 60, 24);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 12, by + 28);
      ctx.lineTo(p.x, by + 50);
      ctx.lineTo(p.x + 12, by + 28);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(p.x - 10, by + 24, 20, 6);
      ctx.fillStyle = p.team === 'messi' ? '#A50044' : '#1B2A6B';
      ctx.fillText(team.celebrate, p.x, by + 2);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = clamp(p.life / 0.5, 0, 1);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
  }

  function drawFloats() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of floats) {
      const a = f.t < 0.25 ? f.t / 0.25 : f.t > 2.4 ? (3 - f.t) / 0.6 : 1;
      const y = f.y - f.t * 30;
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      fitFont(f.text, 560, 40);
      const tw = Math.max(ctx.measureText(f.text).width, f.sub ? 200 : 0) + 50;
      const h = f.sub ? 92 : 64;
      rr(W / 2 - tw / 2, y - h / 2, tw, h, 22);
      ctx.fillStyle = f.team === 'messi' ? 'rgba(0,50,110,0.85)' : 'rgba(255,255,255,0.92)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = f.team === 'messi' ? '#EDBB00' : '#D4AF37';
      ctx.stroke();
      ctx.fillStyle = f.team === 'messi' ? '#fff' : '#1B2A6B';
      ctx.fillText(f.text, W / 2, y - (f.sub ? 14 : 0));
      if (f.sub) {
        fitFont(f.sub, tw - 30, 26, '700');
        ctx.fillText(f.sub, W / 2, y + 26);
      }
      ctx.restore();
    }
  }

  function drawBanner() {
    if (!banner) return;
    const dur = banner.big ? 2.2 : 1.6;
    const t = banner.t;
    const s = t < 0.25 ? easeOutBack(t / 0.25) : 1;
    const a = t > dur - 0.3 ? (dur - t) / 0.3 : 1;
    const team = banner.team;
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.translate(W / 2, MID_Y);
    ctx.scale(s, s);
    ctx.rotate(-0.05);
    if (team) {
      ctx.fillStyle = teamFill(team, -440, 440);
    } else {
      const g = ctx.createLinearGradient(0, -90, 0, 90);
      g.addColorStop(0, '#1d2340');
      g.addColorStop(1, '#0a0d1a');
      ctx.fillStyle = g;
    }
    rr(-450, -90, 900, 180, 34);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = team === 'ronaldo' ? '#D4AF37' : '#EDBB00';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(banner.text, 820, banner.big || !team ? 96 : 130);
    if (team === 'ronaldo') outlinedText(banner.text, 0, 6, '#1B2A6B', '#D4AF37', 12);
    else if (team === 'messi') outlinedText(banner.text, 0, 6, '#FFFFFF', '#15161c', 12);
    else outlinedText(banner.text, 0, 6, '#EDBB00', '#15161c', 12);
    ctx.restore();
  }

  // Big fading 5-4-3-2-1 over the pitch at the end of a round.
  function drawCountdown() {
    if (match.phase !== 'running') return;
    const left = timeLeft();
    if (left > 5000 || left <= 0) return;
    const secs = Math.ceil(left / 1000);
    const frac = secs - left / 1000; // 0 at the start of each second
    ctx.save();
    ctx.globalAlpha = 0.45 * (1 - frac);
    ctx.translate(W / 2, MID_Y);
    ctx.scale(1 + frac * 0.6, 1 + frac * 0.6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 380px ${FONT}`;
    outlinedText(String(secs), 0, 0, '#ffffff', '#c0102a', 18);
    ctx.restore();
  }

  function drawResult() {
    const r = match.lastResult;
    if (match.phase !== 'intermission' || !r) return;
    const win = r.winner;
    const t = Math.min(resultT, 99);
    const s = t < 0.4 ? easeOutBack(t / 0.4) : 1;
    const nameOf = (team) => CONFIG.teams[team].name;

    ctx.save();
    ctx.fillStyle = `rgba(3,5,12,${0.45 * clamp(t / 0.4, 0, 1)})`;
    ctx.fillRect(PITCH.x - 28, PITCH.y - 28, PITCH.w + 56, PITCH.h + 56);
    ctx.translate(W / 2, MID_Y);
    ctx.scale(s, s);

    const cardW = 860;
    const cardH = 520;
    rr(-cardW / 2, -cardH / 2, cardW, cardH, 40);
    if (win === 'draw') {
      const g = ctx.createLinearGradient(0, -cardH / 2, 0, cardH / 2);
      g.addColorStop(0, '#1d2340');
      g.addColorStop(1, '#0a0d1a');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = teamFill(win, -cardW / 2, cardW / 2);
    }
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = win === 'ronaldo' ? '#D4AF37' : '#EDBB00';
    ctx.stroke();

    const ink = win === 'ronaldo' ? '#1B2A6B' : '#FFFFFF';
    const accent = win === 'ronaldo' ? '#B8901F' : '#EDBB00';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = accent;
    ctx.font = `900 40px ${FONT}`;
    ctx.fillText(`FULL TIME · ROUND ${r.round}`, 0, -190);

    const headline = win === 'draw' ? "IT'S A DRAW!" : `🏆 ${nameOf(win)} WINS!`;
    fitFont(headline, cardW - 80, 100);
    outlinedText(headline, 0, -95, ink, win === 'ronaldo' ? '#D4AF37' : '#15161c', 10);

    const score = `${r.scores.messi}  -  ${r.scores.ronaldo}`;
    fitFont(score, cardW - 200, 110);
    ctx.fillStyle = ink;
    ctx.fillText(score, 0, 25);
    ctx.font = `900 30px ${FONT}`;
    ctx.fillStyle = accent;
    ctx.textAlign = 'right';
    ctx.fillText(nameOf('messi'), -140, 100);
    ctx.textAlign = 'left';
    ctx.fillText(nameOf('ronaldo'), 140, 100);
    ctx.textAlign = 'center';

    let line;
    if (win === 'draw') line = 'No winner this round';
    else if (match.streak.team === win && match.streak.count >= 2) line = `🔥 ${match.streak.count} WINS IN A ROW!`;
    else line = `Total wins: ${match.wins[win]}`;
    fitFont(line, cardW - 80, 48);
    ctx.fillStyle = ink;
    ctx.fillText(line, 0, 160);

    const next = match.autoNextRound
      ? `Next round in ${Math.ceil(timeLeft() / 1000)}…`
      : 'Next round starting soon…';
    ctx.font = `800 30px ${FONT}`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(next, 0, 222);
    ctx.restore();
  }

  // Polygon with rounded corners.
  function roundPoly(pts, r) {
    const n = pts.length;
    const a = pts[n - 1];
    const b = pts[0];
    ctx.beginPath();
    ctx.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      ctx.arcTo(p[0], p[1], q[0], q[1], r);
    }
    ctx.closePath();
  }

  // Lookalike club badges (not the official crests).
  function drawBadge(team, cx, cy, size) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(size / 64, size / 64);
    if (team === 'messi') {
      const shield = () => {
        ctx.beginPath();
        ctx.moveTo(-28, -32);
        ctx.lineTo(28, -32);
        ctx.lineTo(28, 4);
        ctx.quadraticCurveTo(26, 26, 0, 36);
        ctx.quadraticCurveTo(-26, 26, -28, 4);
        ctx.closePath();
      };
      shield();
      ctx.fillStyle = '#f2c94c';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#6b4a00';
      ctx.stroke();
      ctx.save();
      ctx.scale(0.8, 0.8);
      shield();
      ctx.clip();
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? '#0b2a8c' : '#a50044';
        ctx.fillRect(-30 + i * 10, -14, 10, 52);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-30, -34, 60, 20);
      ctx.restore();
      drawMiniBall(0, -19, 7);
    } else {
      circle(0, 6, 26);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#f2c94c';
      ctx.stroke();
      circle(0, 6, 19);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#1b2a6b';
      ctx.stroke();
      ctx.fillStyle = '#1b2a6b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 24px ${FONT}`;
      ctx.fillText(CONFIG.teams.ronaldo.number || '7', 0, 8);
      drawCrown(0, -24, 34, '#f2c94c');
    }
    ctx.restore();
  }

  function drawHUD() {
    const left = timeLeft();
    const running = match.phase === 'running';
    const urgent = running && left <= 10000;

    for (const team of ['messi', 'ronaldo']) {
      const messi = team === 'messi';
      const disp = Math.max(0, serverScores[team] - pending(team));
      if (disp > shown[team]) pop[team] = 1;
      shown[team] = disp;

      const pts = messi
        ? [[118, 12], [442, 12], [416, 138], [96, 138]]
        : [[638, 12], [962, 12], [984, 138], [664, 138]];
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 4;
      roundPoly(pts, 16);
      const g = ctx.createLinearGradient(0, 12, 0, 138);
      g.addColorStop(0, messi ? '#2f6cf0' : '#ffffff');
      g.addColorStop(1, messi ? '#0a2580' : '#d6dbe8');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      ctx.save();
      roundPoly(pts, 16);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(0, 12, W, 52);
      ctx.restore();
      roundPoly(pts, 16);
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#f2c94c';
      ctx.stroke();

      drawBadge(team, messi ? 168 : W - 168, 76, 80);

      const tx = messi ? 300 : W - 300;
      const ink = messi ? '#FFFFFF' : '#14286b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ink;
      fitFont(CONFIG.teams[team].name, 220, 34);
      ctx.fillText(CONFIG.teams[team].name, tx, 42);
      ctx.save();
      ctx.translate(tx, 100);
      const s = 1 + pop[team] * 0.35;
      ctx.scale(s, s);
      fitFont(String(disp), 220, 72);
      outlinedText(String(disp), 0, 0, ink, messi ? '#0a1a5a' : '#c9a43a', 5);
      ctx.restore();

      // wins (+ streak)
      const wp = messi
        ? [[142, 146], [402, 146], [390, 192], [130, 192]]
        : [[678, 146], [938, 146], [950, 192], [690, 192]];
      roundPoly(wp, 10);
      ctx.fillStyle = 'rgba(8,16,48,0.94)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = messi ? '#3b62c9' : '#c9a43a';
      ctx.stroke();
      const wins = match.wins[team] || 0;
      const main = `🏆 ${wins} ${wins === 1 ? 'WIN' : 'WINS'}`;
      const streak = match.streak.team === team && match.streak.count >= 2 ? `   🔥 x${match.streak.count}` : '';
      const cx = messi ? 266 : W - 266;
      let size = 26;
      ctx.font = `900 ${size}px ${FONT}`;
      let total = ctx.measureText(main + streak).width;
      if (total > 236) {
        size = Math.floor((size * 236) / total);
        ctx.font = `900 ${size}px ${FONT}`;
        total = ctx.measureText(main + streak).width;
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFFFFF';
      const x0 = cx - total / 2;
      ctx.fillText(main, x0, 170);
      if (streak) {
        ctx.save();
        ctx.shadowColor = '#ff7a00';
        ctx.shadowBlur = 8 + 10 * (0.5 + 0.5 * Math.sin(now * 6));
        ctx.fillStyle = '#ffb13b';
        ctx.fillText(streak, x0 + ctx.measureText(main).width, 170);
        ctx.restore();
      }
    }

    // timer
    const cp = [[432, 8], [648, 8], [678, 38], [656, 134], [424, 134], [402, 38]];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 18;
    roundPoly(cp, 10);
    const tg = ctx.createLinearGradient(0, 8, 0, 134);
    tg.addColorStop(0, urgent && Math.sin(now * 10) > 0 ? '#4a0812' : '#1d1d24');
    tg.addColorStop(1, '#000000');
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.restore();
    roundPoly(cp, 10);
    ctx.lineWidth = 4;
    ctx.strokeStyle = urgent ? '#ff4d4d' : '#f2c94c';
    ctx.stroke();

    const label = {
      ready: 'KICK-OFF SOON',
      running: 'TIME LEFT',
      paused: 'PAUSED',
      intermission: 'FULL TIME',
    }[match.phase] || '';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = match.phase === 'paused' ? '#ff9a3c' : '#f2c94c';
    fitFont(label, 180, 22);
    ctx.fillText(label, W / 2, 34);
    const lw = ctx.measureText(label).width;
    ctx.fillRect(W / 2 - lw / 2 - 30, 33, 18, 3);
    ctx.fillRect(W / 2 + lw / 2 + 12, 33, 18, 3);

    const clock = match.phase === 'intermission' ? '0:00' : formatTime(left);
    const blinkOff = match.phase === 'paused' && Math.sin(now * 5) < -0.3;
    if (!blinkOff) {
      ctx.save();
      ctx.translate(W / 2, 90);
      if (urgent) {
        const sc = 1 + 0.08 * Math.max(0, Math.sin(now * 12));
        ctx.scale(sc, sc);
      }
      fitFont(clock, 220, 76);
      outlinedText(clock, 0, 0, urgent ? '#ff4d4d' : '#FFFFFF', '#000000', 4);
      ctx.restore();
    }

    const rp = [[452, 144], [628, 144], [650, 168], [628, 192], [452, 192], [430, 168]];
    roundPoly(rp, 6);
    ctx.fillStyle = '#0a0a12';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f2c94c';
    ctx.stroke();
    ctx.fillStyle = '#f2c94c';
    const roundText = match.phase === 'intermission' ? `NEXT: ROUND ${match.round}` : `ROUND ${match.round}`;
    fitFont(roundText, 190, 26);
    ctx.fillText(roundText, W / 2, 169);
  }

  // ---------- Frame loop ----------
  let view = { s: 1, ox: 0, oy: 0, dpr: 1 };

  function applyView() {
    const { s, ox, oy, dpr } = view;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    const s = Math.min(innerWidth / W, innerHeight / H);
    view = { s, ox: (innerWidth - W * s) / 2, oy: (innerHeight - H * s) / 2, dpr };
    renderStatic();
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    applyView();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();

    drawCrowd();
    drawRoof();
    drawFloodlights();
    drawCloth(228, 368, 300, 58, -0.03, 'messi', `TEAM ${CONFIG.teams.messi.name}`);
    drawCloth(W - 228, 368, 300, 58, 0.03, 'ronaldo', `TEAM ${CONFIG.teams.ronaldo.name}`);
    drawPennant(50, 520, 'messi');
    drawPennant(W - 50, 520, 'ronaldo');
    drawBottomBar();
    drawCornerFlags();
    drawNet(GOALS.top);
    drawFrame(GOALS.top);

    // Balls sitting in the far (top) net are drawn behind its front posts.
    ctx.save();
    ctx.beginPath();
    ctx.rect(GOALS.top.cx - GOAL_HALF + 5, 0, GOAL_HALF * 2 - 10, GOALS.top.lineY - 2);
    ctx.clip();
    for (const b of balls) if (b.state === 'net' && ATTACK[b.team] === 'top') drawBall(b);
    ctx.restore();

    const ents = [
      ...balls.filter((b) => !(b.state === 'net' && ATTACK[b.team] === 'top')).map((b) => ({ y: b.y, b })),
      ...Object.values(players).map((p) => ({ y: p.y, p })),
    ].sort((a, b) => a.y - b.y);
    for (const e of ents) (e.b ? drawBall(e.b) : drawPlayer(e.p));

    drawNet(GOALS.bottom);
    drawFrame(GOALS.bottom);
    drawCountdown();
    drawFloats();
    drawBanner();
    drawResult();
    drawParticles();
    drawHUD();
    ctx.restore();
  }

  let last = performance.now();
  function frame(ts) {
    const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
    last = ts;
    now += dt;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- Input ----------
  document.getElementById('startBtn').addEventListener('click', () => {
    Sound.init();
    if (Sound.ctx && Sound.ctx.state === 'suspended') Sound.ctx.resume();
    document.body.classList.add('started');
  });

  const KEYS = {
    1: () => post('/api/spawn', { team: 'messi', count: 1, gift: '🧪 Test' }),
    2: () => post('/api/spawn', { team: 'ronaldo', count: 1, gift: '🧪 Test' }),
    q: () => post('/api/spawn', { team: 'messi', count: 50, gift: '🧪 Test' }),
    w: () => post('/api/spawn', { team: 'ronaldo', count: 50, gift: '🧪 Test' }),
    s: () => post('/api/timer', { action: 'toggle' }),
    e: () => post('/api/timer', { action: 'end' }),
    r: () => post('/api/timer', { action: 'reset' }),
    m: () => {
      Sound.muted = !Sound.muted;
      if (Sound.muted) stopClips();
    },
    f: () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    },
  };
  window.addEventListener('keydown', (e) => {
    const fn = KEYS[e.key.toLowerCase()];
    if (fn && !e.repeat) fn();
  });

  window.addEventListener('resize', resize);
  resize();

  fetch('/api/config')
    .then((r) => r.json())
    .then((cfg) => {
      CONFIG = { ...CONFIG, ...cfg, teams: { ...CONFIG.teams, ...(cfg.teams || {}) } };
      renderStatic(); // repaint the team names on the grass
    })
    .catch((err) => console.error('Config load failed', err))
    .finally(connect);

  requestAnimationFrame(frame);

  // Exposed for debugging in the browser console.
  window.__game = { players, match, clips: CLIPS, get balls() { return balls; }, serverScores };
})();
