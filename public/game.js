(() => {
  'use strict';

  // ---------- Layout: logical 1080x1920 portrait (TikTok 9:16), scaled to fit ----------
  const W = 1080;
  const H = 1920;
  const PITCH = { x: 80, y: 360, w: 920, h: 1460 };
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
  };

  // ---------- Helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

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
    goal(big) {
      if (!this.ready()) return;
      const c = this.ctx;
      const t = c.currentTime;
      if (t - this.lastGoal < 0.15) return;
      this.lastGoal = t;
      const len = big ? 2.6 : 1.4;
      // crowd roar
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
      // stadium horn
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

  function makePlayer(team) {
    const home = team === 'messi' ? { x: W / 2, y: MID_Y + 340 } : { x: W / 2, y: MID_Y - 300 };
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

  // ---------- Server events ----------
  function setScores(scores) {
    if (!scores) return;
    for (const t of ['messi', 'ronaldo']) serverScores[t] = Number(scores[t]) || 0;
  }

  function onSpawn(msg) {
    setScores(msg.scores);
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
    setScores(msg.scores);
    spawnQueue = spawnQueue.filter((q) => q.id !== msg.id);
    balls = balls.filter((b) => b.id !== msg.id || b.scored);
  }

  function onReset(msg) {
    setScores(msg.scores);
    spawnQueue = [];
    balls = [];
    floats = [];
    banner = null;
    for (const t of ['messi', 'ronaldo']) {
      shown[t] = 0;
      lastDue[t] = 0;
      Object.assign(players[t], { state: 'idle', ball: null, x: players[t].home.x, y: players[t].home.y });
    }
  }

  function handle(msg) {
    if (msg.type === 'state') setScores(msg.scores);
    else if (msg.type === 'spawn') onSpawn(msg);
    else if (msg.type === 'undo') onUndo(msg);
    else if (msg.type === 'reset') onReset(msg);
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
      ? [MID_Y + 130, PITCH.y + PITCH.h - 240]
      : [PITCH.y + 240, MID_Y - 130];
    return {
      id: q.id, team: q.team, value: q.value, r,
      x: rand(PITCH.x + 140, PITCH.x + PITCH.w - 140), y: rand(y0, y1), z: 1100,
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
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 350,
        rot: rand(0, 6), vr: rand(-12, 12), w: rand(8, 16), h: rand(5, 10),
        c: cols[i % cols.length], life: rand(1.2, 2.2),
      });
    }
    if (particles.length > 900) particles.splice(0, particles.length - 900);
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
  const crowd = [];
  (function buildCrowd() {
    const cols = {
      messi: ['#A50044', '#004D98', '#EDBB00', '#A50044', '#004D98'],
      ronaldo: ['#FFFFFF', '#D4AF37', '#E8E8EE', '#FFFFFF', '#1B2A6B'],
    };
    const add = (x, y, team) => crowd.push({ x: x + rand(-3, 3), y: y + rand(-2, 2), team, c: pick(cols[team]), ph: rand(0, 6) });
    for (let y = 222; y < H; y += 24) {
      for (let x = 14; x < PITCH.x - 30; x += 24) add(x, y, 'messi');
      for (let x = W - 14; x > PITCH.x + PITCH.w + 30; x -= 24) add(x, y, 'ronaldo');
    }
    for (let y = 222; y < PITCH.y - 50; y += 24) {
      for (let x = 60; x < W / 2 - GOAL_HALF - 30; x += 24) add(x, y, 'messi');
      for (let x = W - 60; x > W / 2 + GOAL_HALF + 30; x -= 24) add(x, y, 'ronaldo');
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
      p.vy += 900 * dt;
      p.vx *= Math.exp(-1.5 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const f of floats) f.t += dt;
    floats = floats.filter((f) => f.t < 3);
    for (const g of Object.values(GOALS)) g.shake = Math.max(0, g.shake - dt * 1.8);
    for (const t of ['messi', 'ronaldo']) {
      cheer[t] = Math.max(0, cheer[t] - dt * 0.6);
      pop[t] = Math.max(0, pop[t] - dt * 3);
    }
    if (banner) {
      banner.t += dt;
      if (banner.t > (banner.big ? 2.2 : 1.4)) banner = null;
    }
  }

  // ---------- Drawing ----------
  function drawStadium() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#111a33');
    g.addColorStop(1, '#070a14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const c of crowd) {
      const jump = (Math.sin(now * 14 + c.ph) * 0.5 + 0.5) * (2 + cheer[c.team] * 14);
      ctx.fillStyle = c.c;
      ctx.beginPath();
      ctx.arc(c.x, c.y + 10 - jump, 9, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#e0b48f';
      circle(c.x, c.y - jump, 6);
      ctx.fill();
    }
  }

  function drawPitch() {
    ctx.fillStyle = '#2d8a45';
    ctx.fillRect(PITCH.x - 34, PITCH.y - 34, PITCH.w + 68, PITCH.h + 68);
    for (let i = 0; i * 100 < PITCH.h; i++) {
      ctx.fillStyle = i % 2 ? '#3aa656' : '#35994f';
      ctx.fillRect(PITCH.x, PITCH.y + i * 100, PITCH.w, Math.min(100, PITCH.h - i * 100));
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = 5;
    ctx.strokeRect(PITCH.x, PITCH.y, PITCH.w, PITCH.h);
    ctx.beginPath();
    ctx.moveTo(PITCH.x, MID_Y);
    ctx.lineTo(PITCH.x + PITCH.w, MID_Y);
    ctx.stroke();
    circle(W / 2, MID_Y, 150);
    ctx.stroke();
    circle(W / 2, MID_Y, 8);
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
      box(310, 240);
      box(170, 90);
      const spotY = g.lineY + d * 165;
      circle(W / 2, spotY, 7);
      ctx.fill();
      const a = Math.acos(75 / 150);
      const mid = d > 0 ? Math.PI / 2 : -Math.PI / 2;
      ctx.beginPath();
      ctx.arc(W / 2, spotY, 150, mid - a, mid + a);
      ctx.stroke();
    }
    const corner = (x, y, a0) => {
      ctx.beginPath();
      ctx.arc(x, y, 24, a0, a0 + Math.PI / 2);
      ctx.stroke();
    };
    corner(PITCH.x, PITCH.y, 0);
    corner(PITCH.x + PITCH.w, PITCH.y, Math.PI / 2);
    corner(PITCH.x + PITCH.w, PITCH.y + PITCH.h, Math.PI);
    corner(PITCH.x, PITCH.y + PITCH.h, -Math.PI / 2);
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
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x0, s.topY, x1 - x0, s.bottomY - s.topY);
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
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
    // back frame (thin)
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
    // front posts + crossbar
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
      // beard
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

    // blush
    ctx.fillStyle = 'rgba(255,110,120,0.35)';
    circle(-22, hy + 10, 6);
    ctx.fill();
    circle(22, hy + 10, 6);
    ctx.fill();

    // eyes
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

    // eyebrows
    ctx.lineWidth = 4;
    ctx.strokeStyle = kit.hair;
    const tilt = sad ? 4 : 0;
    ctx.beginPath();
    ctx.moveTo(-20, hy - 10 + tilt);
    ctx.lineTo(-7, hy - 12 - tilt);
    ctx.moveTo(20, hy - 10 + tilt);
    ctx.lineTo(7, hy - 12 - tilt);
    ctx.stroke();

    // mouth
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
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
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

    // shorts
    ctx.fillStyle = kit.shorts;
    rr(-27, -58, 54, 20, 6);
    ctx.fill();
    ctx.stroke();

    // shirt
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
    if (p.team === 'messi') {
      const g = ctx.createLinearGradient(p.x - tw / 2, 0, p.x + tw / 2, 0);
      g.addColorStop(0, '#004D98');
      g.addColorStop(1, '#A50044');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = '#FFFFFF';
    }
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = p.team === 'messi' ? '#EDBB00' : '#D4AF37';
    ctx.stroke();
    ctx.fillStyle = p.team === 'messi' ? '#FFFFFF' : '#1B2A6B';
    ctx.fillText(name, p.x, p.y + 36);

    // celebration speech bubble
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
    const dur = banner.big ? 2.2 : 1.4;
    const t = banner.t;
    const s = t < 0.25 ? easeOutBack(t / 0.25) : 1;
    const a = t > dur - 0.3 ? (dur - t) / 0.3 : 1;
    const messi = banner.team === 'messi';
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.translate(W / 2, MID_Y);
    ctx.scale(s, s);
    ctx.rotate(-0.05);
    if (messi) {
      const g = ctx.createLinearGradient(-440, 0, 440, 0);
      g.addColorStop(0, '#004D98');
      g.addColorStop(1, '#A50044');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = '#FFFFFF';
    }
    rr(-450, -90, 900, 180, 34);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = messi ? '#EDBB00' : '#D4AF37';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(banner.text, 820, banner.big ? 96 : 130);
    outlinedText(banner.text, 0, 6, messi ? '#FFFFFF' : '#1B2A6B', messi ? '#15161c' : '#D4AF37', 12);
    ctx.restore();
  }

  function drawHUD() {
    const bg = ctx.createLinearGradient(0, 0, 0, 205);
    bg.addColorStop(0, '#0a0f1f');
    bg.addColorStop(1, '#131c38');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, 205);

    const panel = (team, x) => {
      const messi = team === 'messi';
      const disp = Math.max(0, serverScores[team] - pending(team));
      if (disp > shown[team]) pop[team] = 1;
      shown[team] = disp;

      rr(x, 16, 440, 146, 28);
      if (messi) {
        const g = ctx.createLinearGradient(x, 0, x + 440, 0);
        g.addColorStop(0, '#004D98');
        g.addColorStop(1, '#A50044');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = '#FFFFFF';
      }
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = messi ? '#EDBB00' : '#D4AF37';
      ctx.stroke();

      const cx = x + 220;
      const ink = messi ? '#FFFFFF' : '#1B2A6B';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ink;
      fitFont(CONFIG.teams[team].name, 380, 38);
      ctx.fillText(CONFIG.teams[team].name, cx, 48);

      ctx.save();
      ctx.translate(cx, 112);
      const s = 1 + pop[team] * 0.35;
      ctx.scale(s, s);
      fitFont(String(disp), 380, 80);
      outlinedText(String(disp), 0, 0, messi ? '#FFFFFF' : '#1B2A6B', messi ? '#15161c' : '#D4AF37', 6);
      ctx.restore();
    };
    panel('messi', 26);
    panel('ronaldo', W - 26 - 440);

    // VS badge
    ctx.fillStyle = '#EDBB00';
    circle(W / 2, 89, 46);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.fillStyle = OUTLINE;
    ctx.font = `900 34px ${FONT}`;
    ctx.fillText('VS', W / 2, 91);

    if (CONFIG.tip) {
      ctx.fillStyle = '#ffe27a';
      fitFont(CONFIG.tip, W - 60, 28, '800');
      ctx.fillText(CONFIG.tip, W / 2, 186);
    }
  }

  // ---------- Frame loop ----------
  let view = { s: 1, ox: 0, oy: 0, dpr: 1 };
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    const s = Math.min(innerWidth / W, innerHeight / H);
    view = { s, ox: (innerWidth - W * s) / 2, oy: (innerHeight - H * s) / 2, dpr };
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const { s, ox, oy, dpr } = view;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();

    drawStadium();
    drawPitch();
    drawNet(GOALS.top);
    drawFrame(GOALS.top);

    const ents = [
      ...balls.filter((b) => !(b.state === 'net' && ATTACK[b.team] === 'top')).map((b) => ({ y: b.y, b })),
      ...Object.values(players).map((p) => ({ y: p.y, p })),
    ].sort((a, b) => a.y - b.y);
    // Balls sitting in the far (top) net are drawn behind its front posts.
    ctx.save();
    ctx.beginPath();
    ctx.rect(GOALS.top.cx - GOAL_HALF + 5, 0, GOAL_HALF * 2 - 10, GOALS.top.lineY - 2);
    ctx.clip();
    for (const b of balls) if (b.state === 'net' && ATTACK[b.team] === 'top') drawBall(b);
    ctx.restore();
    for (const e of ents) (e.b ? drawBall(e.b) : drawPlayer(e.p));

    drawNet(GOALS.bottom);
    drawFrame(GOALS.bottom);
    drawParticles();
    drawFloats();
    drawBanner();
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

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    } else if (k === 'm') {
      Sound.muted = !Sound.muted;
    } else if (k === '1') {
      post('/api/spawn', { team: 'messi', count: 1, gift: '🧪 Test' });
    } else if (k === '2') {
      post('/api/spawn', { team: 'ronaldo', count: 1, gift: '🧪 Test' });
    } else if (k === 'q') {
      post('/api/spawn', { team: 'messi', count: 50, gift: '🧪 Test' });
    } else if (k === 'w') {
      post('/api/spawn', { team: 'ronaldo', count: 50, gift: '🧪 Test' });
    }
  });

  window.addEventListener('resize', resize);
  resize();

  fetch('/api/config')
    .then((r) => r.json())
    .then((cfg) => {
      CONFIG = { ...CONFIG, ...cfg, teams: { ...CONFIG.teams, ...(cfg.teams || {}) } };
    })
    .catch((err) => console.error('Config load failed', err))
    .finally(connect);

  requestAnimationFrame(frame);

  // Exposed for debugging in the browser console.
  window.__game = { players, get balls() { return balls; }, serverScores };
})();
