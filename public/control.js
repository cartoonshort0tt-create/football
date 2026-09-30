(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const QTY_OPTIONS = [1, 2, 5, 10, 20];
  let config = { teams: { messi: { name: 'MESSI' }, ronaldo: { name: 'RONALDO' } }, gifts: [] };
  let qty = 1;
  let toastTimer = 0;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function teamName(team) {
    return (config.teams[team] && config.teams[team].name) || team.toUpperCase();
  }

  function toast(text, isError) {
    const t = $('toast');
    t.textContent = text;
    t.classList.toggle('err', !!isError);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  }

  async function post(url, body) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    } catch (err) {
      toast(`⚠ ${err.message}`, true);
      return null;
    }
  }

  // ---------- Quantity (for gift streaks like "Rose x5") ----------
  function renderQty() {
    const box = $('qty');
    box.textContent = '';
    for (const n of QTY_OPTIONS) {
      const b = el('button', n === qty ? 'on' : '', `x${n}`);
      b.type = 'button';
      b.onclick = () => {
        qty = n;
        renderQty();
      };
      box.appendChild(b);
    }
  }

  // ---------- Sending ----------
  async function send(team, count, gift) {
    const sender = $('sender').value.trim();
    const data = await post('/api/spawn', { team, count, gift, sender });
    if (!data) return;
    if (navigator.vibrate) navigator.vibrate(25);
    toast(`✔ +${count} ${teamName(team)}${sender ? ' · ' + sender : ''}`);
    $('sender').value = '';
    qty = 1;
    renderQty();
  }

  function giftButton(team, gift) {
    const b = el('button', `gift ${team}`);
    b.type = 'button';
    b.appendChild(el('span', 'emoji', gift.emoji || '🎁'));
    const info = el('span', 'info');
    info.appendChild(el('span', 'gname', gift.name));
    info.appendChild(el('span', 'coins', `🪙 ${gift.coins}`));
    b.appendChild(info);
    b.onclick = () => {
      const label = `${gift.emoji || '🎁'} ${gift.name}${qty > 1 ? ' x' + qty : ''}`;
      send(team, gift.coins * qty, label);
    };
    return b;
  }

  function render() {
    $('nameMessi').textContent = $('headMessi').textContent = $('customMessi').textContent = teamName('messi');
    $('nameRonaldo').textContent = $('headRonaldo').textContent = $('customRonaldo').textContent = teamName('ronaldo');
    for (const [team, boxId] of [['messi', 'giftsMessi'], ['ronaldo', 'giftsRonaldo']]) {
      const box = $(boxId);
      box.textContent = '';
      for (const gift of config.gifts || []) box.appendChild(giftButton(team, gift));
    }
    renderQty();
  }

  function sendCustom(team) {
    const count = Math.floor(Number($('customCoins').value));
    if (!count || count < 1) {
      toast('⚠ Enter a number of coins', true);
      return;
    }
    send(team, count, '🪙 Coins');
    $('customCoins').value = '';
  }

  // ---------- Live state ----------
  function showState(msg) {
    if (msg.scores) {
      $('scoreMessi').textContent = msg.scores.messi;
      $('scoreRonaldo').textContent = msg.scores.ronaldo;
    }
    const recent = msg.recent || [];
    const log = $('log');
    log.textContent = '';
    for (const e of recent) {
      const li = el('li');
      const left = el('span');
      left.appendChild(el('span', e.team === 'messi' ? 'm' : 'r', `+${e.count} ${teamName(e.team)}`));
      const extra = [e.gift, e.sender && `· ${e.sender}`].filter(Boolean).join(' ');
      if (extra) left.appendChild(document.createTextNode(` ${extra}`));
      li.appendChild(left);
      li.appendChild(el('span', 't', new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
      log.appendChild(li);
    }
    if (!recent.length) log.appendChild(el('li', 't', 'No gifts yet'));
    const last = recent[0];
    $('undoInfo').textContent = last ? `Undo would remove: +${last.count} ${teamName(last.team)} ${last.gift || ''}` : '';
  }

  function connect() {
    const es = new EventSource('/events');
    es.onopen = () => $('dot').classList.add('on');
    es.onerror = () => $('dot').classList.remove('on');
    es.onmessage = (e) => {
      try {
        showState(JSON.parse(e.data));
      } catch (err) {
        console.error(err);
      }
    };
  }

  // ---------- Wire up ----------
  $('customMessi').onclick = () => sendCustom('messi');
  $('customRonaldo').onclick = () => sendCustom('ronaldo');
  $('undo').onclick = async () => {
    const data = await post('/api/undo');
    if (data) toast(`↩ Removed +${data.undone.count} ${teamName(data.undone.team)}`);
  };
  $('reset').onclick = async () => {
    if (!confirm('Reset the score to 0 - 0?')) return;
    if (await post('/api/reset')) toast('⟲ Score reset');
  };

  fetch('/api/config')
    .then((r) => r.json())
    .then((cfg) => {
      config = cfg;
    })
    .catch(() => toast('⚠ Could not load config', true))
    .finally(() => {
      render();
      connect();
    });
})();
