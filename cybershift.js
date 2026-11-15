/* CYBERSHIFT — jogo autônomo (PWA)
   Jogo original do usuário (falcon-king-granite-summit.grok.me), reescrito para rodar offline.
   Melhorias: partículas, brilho/bloom, screen shake, parallax, power-ups, chefes,
   combo, controles de toque, WebAudio, recorde em localStorage. */
(function () {
  const SAVE = "cybershift-save-v1";
  const ROOT = (function () {
    const s = document.currentScript && document.currentScript.src;
    if (s) {
      try { return new URL("./", s).href; } catch (e) {}
    }
    if (/\/jogo(\/|$)/.test(location.pathname)) return "./";
    return "jogo/";
  })();

  const RACES = [
    { name: "VEXARI", origin: "Nébula Carmesim", hue: 168 },
    { name: "QOR'THAL", origin: "Anel de Obsidiana", hue: 268 },
    { name: "NYXIL", origin: "Vala do Silêncio", hue: 312 },
    { name: "ZHUR-KA", origin: "Dunas de Ferro", hue: 28 },
    { name: "ITHARI", origin: "Mar de Vidro", hue: 186 },
    { name: "MOL'VEK", origin: "Fossa Enxofre", hue: 72 },
    { name: "SAEDRYN", origin: "Coroa Polar", hue: 198 },
    { name: "KETHUUN", origin: "Cinturão Âmbar", hue: 40 }
  ];
  const ERA = (w) => (w <= 4 ? "mech" : w <= 10 ? "xeno" : "cosmic");
  const ERA_NAME = (e) => (e === "mech" ? "MECHAS" : e === "xeno" ? "EXTRATERRESTRES" : "SERES CÓSMICOS");
  const ERA_SPRITES = {
    mech: ["mech-warrior", "mech-jet", "mech-tank", "mech-truck", "mech-ape"],
    xeno: ["alien-insect", "alien-crystal", "alien-bio", "alien-saucer", "alien-kraken", "alien-bone", "alien-brute", "alien-needle", "alien-hex", "alien-orb"],
    cosmic: ["cosmic-nebula", "cosmic-void", "cosmic-crystal", "cosmic-serpent"]
  };
  const BOSS_SPR = { mech: "colossus-insect", xeno: "colossus-kraken", cosmic: "colossus-crystal" };
  const PICK_SPR = { spread: "pickup-spread", shield: "pickup-shield", turbo: "pickup-turbo", nova: "pickup-turbo", drone: "pickup-shield", slow: "pickup-spread" };
  const STAT = {
    scout: { hp: 1, r: 20, speed: 96, score: 150, fire: 2.4, w: 42, h: 46, spr: "scout" },
    raider: { hp: 2, r: 26, speed: 80, score: 320, fire: 1.3, w: 52, h: 54, spr: "raider" },
    brute: { hp: 10, r: 36, speed: 54, score: 720, fire: 1.0, w: 74, h: 70, spr: "alien-brute" },
    titan: { hp: 16, r: 46, speed: 42, score: 1600, fire: 0.7, w: 92, h: 88, spr: "titan" },
    colossus: { hp: 80, r: 72, speed: 28, score: 4200, fire: 1.1, w: 150, h: 156, spr: "colossus-insect" },
    mech: { hp: 22, r: 44, speed: 34, score: 900, fire: 1.5, w: 90, h: 114, spr: "mech-warrior" },
    xeno: { hp: 20, r: 42, speed: 38, score: 980, fire: 1.4, w: 94, h: 110, spr: "alien-insect" },
    cosmic: { hp: 26, r: 48, speed: 32, score: 1200, fire: 1.35, w: 104, h: 120, spr: "cosmic-serpent" }
  };

  function loadSave() {
    try {
      const r = JSON.parse(localStorage.getItem(SAVE) || "null");
      if (r && Array.isArray(r.scores)) return { version: 1, scores: r.scores, muted: !!r.muted };
    } catch (e) {}
    return { version: 1, scores: [], muted: false };
  }
  function writeSave(s) {
    try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch (e) {}
  }
  function topScore() {
    const s = loadSave().scores;
    return s[0] ? s[0].score : 0;
  }
  function addScore(name, score, wave) {
    const s = loadSave();
    s.scores.push({ name: (name || "PILOTO").slice(0, 12).toUpperCase(), score, wave, at: Date.now() });
    s.scores.sort((a, b) => b.score - a.score || a.at - b.at);
    s.scores = s.scores.slice(0, 10);
    writeSave(s);
    return s.scores;
  }

  /* ---------- WebAudio ---------- */
  const SFX = {
    ctx: null,
    muted: loadSave().muted,
    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
    },
    tone(freq, dur, type, gain, slide) {
      if (this.muted || !this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
      g.gain.setValueAtTime((gain || 0.08) * 0.7, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, gain, freq) {
      if (this.muted || !this.ctx) return;
      const t = this.ctx.currentTime;
      const n = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
      const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource(); src.buffer = n;
      const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 800;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime((gain || 0.12) * 0.7, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.ctx.destination);
      src.start(t); src.stop(t + dur + 0.02);
    },
    shoot() { this.tone(880, 0.06, "square", 0.04, 420); },
    boom() { this.noise(0.28, 0.2, 500); this.tone(140, 0.3, "sine", 0.12, 50); },
    boss() { this.tone(70, 0.8, "sawtooth", 0.1, 40); this.noise(0.4, 0.15, 200); },
    pickup() { this.tone(523, 0.08, "triangle", 0.08); setTimeout(() => this.tone(784, 0.1, "triangle", 0.08), 80); },
    hit() { this.tone(220, 0.15, "sawtooth", 0.08, 80); },
    wave() { this.tone(196, 0.25, "triangle", 0.07, 392); },
    combo() { this.tone(988, 0.07, "square", 0.05); },
    nova() { this.noise(0.5, 0.25, 900); this.tone(80, 0.6, "sine", 0.16, 30); }
  };

  /* ---------- assets ---------- */
  const IM = {};
  function loadImg(name, path) {
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => { IM[name] = im; res(im); };
      im.onerror = () => { IM[name] = null; res(null); };
      im.src = ROOT + path;
    });
  }
  function preload() {
    const jobs = [
      loadImg("player", "sprites/player.webp"),
      loadImg("scout", "sprites/scout.webp"),
      loadImg("raider", "sprites/raider.webp"),
      loadImg("titan", "sprites/titan.webp"),
      loadImg("boltP", "sprites/bolt-player.webp"),
      loadImg("boltE", "sprites/bolt-enemy.webp"),
      loadImg("explosion", "sprites/explosion.webp"),
      loadImg("missile", "sprites/missile.webp"),
      loadImg("missileGiant", "sprites/missile-giant.webp"),
      loadImg("mine", "sprites/mine.webp"),
      loadImg("station", "sprites/station.webp"),
      loadImg("nebula", "planets/nebula.webp"),
      loadImg("earth", "planets/earth.webp"),
      loadImg("mars", "planets/mars.webp"),
      loadImg("saturn", "planets/saturn.webp"),
      loadImg("neptune", "planets/neptune.webp"),
      loadImg("moon", "planets/moon.webp"),
      loadImg("og", "og.jpg")
    ];
    ["spread", "shield", "turbo"].forEach((k) => jobs.push(loadImg("pickup-" + k, "sprites/pickup-" + k + ".webp")));
    Object.keys(ERA_SPRITES).forEach((e) => ERA_SPRITES[e].forEach((s) => jobs.push(loadImg(s, "sprites/" + s + ".webp"))));
    Object.values(BOSS_SPR).forEach((s) => jobs.push(loadImg(s, "sprites/" + s + ".webp")));
    return Promise.all(jobs);
  }

  function pool(factory, n) {
    const a = [];
    for (let i = 0; i < n; i++) a.push(factory());
    return {
      a,
      spawn(fn) {
        for (let i = 0; i < a.length; i++) if (!a[i].alive) { fn(a[i]); a[i].alive = true; return a[i]; }
        return null;
      },
      each(fn) { for (let i = 0; i < a.length; i++) if (a[i].alive) fn(a[i]); }
    };
  }

  /* ---------- overlay ---------- */
  function inject() {
    if (document.getElementById("jogo-cybershift")) return;
    const el = document.createElement("div");
    el.id = "jogo-cybershift";
    el.className = "game-overlay";
    el.setAttribute("hidden", "");
    el.innerHTML = `
      <canvas id="cs-canvas" aria-label="Campo de batalha CYBERSHIFT"></canvas>
      <button type="button" class="game-close hit" data-cs-fechar>Fechar</button>
      <div class="game-ui">
        <div class="game-hud" data-cs-hud hidden>
          <div>PTS <b data-cs-score>0</b></div>
          <div>ONDA <b data-cs-wave>01</b></div>
          <div>COMBO <b data-cs-combo>x1</b></div>
          <div>VIDAS <b data-cs-lives>3</b></div>
        </div>
        <div class="game-banner" data-cs-banner></div>
        <div class="game-caption" data-cs-caption></div>
        <div class="game-center">
          <div class="game-panel" data-cs-menu>
            <p class="eyebrow" style="color:#5ec8d8;letter-spacing:.42em;font-size:.7rem;margin:0">PROTOCOLO GUARDIÃO</p>
            <h2>CYBERSHIFT</h2>
            <p class="sub">Transforme. Dispare. Sobreviva às ondas mecânicas.</p>
            <div class="game-actions">
              <button type="button" class="gbtn gbtn-go" data-cs-play>Jogar</button>
              <button type="button" class="gbtn gbtn-alt" data-cs-scores>Recordes</button>
              <button type="button" class="gbtn gbtn-alt" data-cs-mute></button>
            </div>
            <div class="hint">
              <div><span>Mover</span><span>WASD / setas / arrastar</span></div>
              <div><span>Disparo</span><span>Automático</span></div>
              <div><span>Pausa</span><span>Esc ou P</span></div>
              <div><span>Recorde</span><span data-cs-high>0</span></div>
            </div>
            <div class="game-actions" style="margin-top:.8rem">
              <button type="button" class="gbtn gbtn-cyan" data-cs-install hidden>Instalar o jogo</button>
            </div>
            <p class="ios-tip" data-cs-ios hidden>No iPhone ou iPad, no Safari: toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</p>
            <p class="sub" data-cs-installed hidden style="margin-top:.7rem">Aberto como aplicativo neste aparelho.</p>
            <div class="dl-sec">
              <a class="gbtn gbtn-alt" data-cs-dl-jogo download>Baixar o jogo</a>
            </div>
          </div>
          <div class="game-panel" data-cs-pause hidden>
            <h2>PAUSA</h2>
            <p class="sub">O setor ficou em silêncio. Por enquanto.</p>
            <div class="game-actions">
              <button type="button" class="gbtn gbtn-go" data-cs-resume>Continuar</button>
              <button type="button" class="gbtn gbtn-alt" data-cs-menu-btn>Menu principal</button>
            </div>
          </div>
          <div class="game-panel" data-cs-over hidden>
            <h2>SINAL PERDIDO</h2>
            <p class="sub">Missão falhou. A onda chegou mais fundo.</p>
            <p style="letter-spacing:.14em;margin:.8rem 0 0">PTS <b data-cs-over-score>0</b> · ONDA <b data-cs-over-wave>1</b></p>
            <form data-cs-form style="margin-top:.8rem">
              <input type="text" maxlength="12" placeholder="Indicativo (PILOTO)" data-cs-name
                style="width:100%;height:44px;border-radius:8px;border:1px solid #2a2e38;background:#12141a;color:#e8eaef;text-align:center;letter-spacing:.14em;text-transform:uppercase">
              <button type="submit" class="gbtn gbtn-cyan" style="margin-top:.5rem">Gravar recorde</button>
            </form>
            <div class="game-actions">
              <button type="button" class="gbtn gbtn-go" data-cs-again>Jogar de novo</button>
              <a class="gbtn gbtn-alt" data-cs-share href="#" target="_blank" rel="noopener noreferrer" style="display:grid;place-items:center;text-decoration:none">Mandar recorde no WhatsApp</a>
              <button type="button" class="gbtn gbtn-alt" data-cs-menu-btn2>Menu principal</button>
            </div>
          </div>
          <div class="game-panel" data-cs-board hidden>
            <h2 style="font-size:1.1rem">TÁBUA DE PONTUAÇÃO</h2>
            <p class="sub">Os dez melhores indicativos deste aparelho.</p>
            <ol data-cs-list style="text-align:left;padding:0;list-style:none;margin:1rem 0 0"></ol>
            <div class="game-actions"><button type="button" class="gbtn gbtn-alt" data-cs-back>Voltar</button></div>
          </div>
        </div>
      </div>
      <div class="touch-stick" data-cs-stick hidden>
        <div class="touch-knob" data-cs-knob></div>
      </div>
    `;
    document.body.appendChild(el);
  }

  /* ---------- game ---------- */
  const Game = {
    ready: false,
    mode: "menu",
    raf: 0,
    last: 0,
    w: 1, h: 1, dpr: 1,
    keys: new Set(),
    moveX: 0, moveY: 0,
    pointer: { on: false, x: 0, y: 0 },
    stick: { on: false, x: 0, y: 0, id: -1 },
    reduced: false,
    planets: [],

    async boot(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      this.bloom = document.createElement("canvas");
      this.bctx = this.bloom.getContext("2d");
      this.bullets = pool(() => ({ alive: false, x: 0, y: 0, vx: 0, vy: 0, r: 4, dmg: 1, from: 1, ttl: 1, hue: 50 }), 280);
      this.enemies = pool(() => ({ alive: false }), 64);
      this.pickups = pool(() => ({ alive: false }), 12);
      this.fx = pool(() => ({ alive: false }), 420);
      this.floaters = pool(() => ({ alive: false }), 24);
      this.drones = [];
      await preload();
      this.ready = true;
      this.stars = this.makeStars();
      this.planets = ["saturn", "earth", "mars", "neptune", "moon"].filter((k) => IM[k]).map((k, i) => ({
        k, x: 0.15 + i * 0.18, y: 0.18 + (i % 3) * 0.2, s: 40 + i * 18, z: 0.15 + i * 0.05, p: Math.random() * 1000
      }));
      this.resize();
    },

    makeStars() {
      const layers = [[80, 0.25, 1], [50, 0.55, 1.6], [30, 1.0, 2.2]];
      return layers.map(([n, z, sz]) => {
        const a = [];
        for (let i = 0; i < n; i++) a.push({ x: Math.random(), y: Math.random(), s: sz * (0.5 + Math.random()) });
        return { z, a };
      });
    },

    resize() {
      const el = this.canvas;
      const r = el.getBoundingClientRect();
      this.w = Math.max(320, r.width || window.innerWidth);
      this.h = Math.max(320, r.height || window.innerHeight);
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.floor(this.w * this.dpr);
      el.height = Math.floor(this.h * this.dpr);
      this.bloom.width = Math.floor(this.w * 0.5);
      this.bloom.height = Math.floor(this.h * 0.5);
      if (this.player && !this.player.x) {
        this.player.x = this.w / 2;
        this.player.y = this.h * 0.8;
      }
    },

    reset() {
      this.score = 0; this.wave = 1; this.combo = 0; this.comboT = 0;
      this.banner = ""; this.bannerT = 0; this.caption = "";
      this.trauma = 0; this.nuke = 0; this.slow = 0;
      this.drones = [];
      this.player = { x: this.w / 2, y: this.h * 0.8, vx: 0, vy: 0, r: 18, fireCd: 0, lives: 3, inv: 0, shield: 0, spread: 0, turbo: 0, flash: 0 };
      this.bullets.a.forEach((o) => (o.alive = false));
      this.enemies.a.forEach((o) => (o.alive = false));
      this.pickups.a.forEach((o) => (o.alive = false));
      this.fx.a.forEach((o) => (o.alive = false));
      this.floaters.a.forEach((o) => (o.alive = false));
      this.queueWave(1);
    },

    announce(t, cap) {
      this.banner = t; this.bannerT = 2.4;
      if (cap) { this.caption = cap; this.captionT = 3.2; }
    },

    queueWave(w) {
      this.wave = w;
      this.spawnQ = [];
      const era = ERA(w);
      const race = RACES[(w - 1) % RACES.length];
      const boss = w % 5 === 0;
      this.announce(
        (w === 1 ? `${ERA_NAME(era)} — ${race.name} — ONDA 01` : `NÍVEL ${w} — ${ERA_NAME(era)} — ${race.name}`),
        w === 1
          ? "Guerreiros. O combate começou. Destruam o Guardião."
          : boss
            ? "TITÃ DETECTADO. O setor treme."
            : "Nova linha no campo. Transformar e atacar."
      );
      SFX.wave();
      const nScout = 4 + Math.min(8, w);
      const nRaid = Math.max(0, w - 1);
      const nEra = Math.max(0, Math.floor((w - 2) / 1.2));
      for (let i = 0; i < nScout; i++) this.spawnQ.push({ kind: "scout", t: 0.25 * i, side: i % 2 ? -1 : 1 });
      for (let i = 0; i < nRaid; i++) this.spawnQ.push({ kind: "raider", t: 0.4 + 0.35 * i, side: i % 2 ? 1 : -1 });
      if (w >= 3) this.spawnQ.push({ kind: "brute", t: 1.4, side: 0 });
      for (let i = 0; i < nEra; i++) this.spawnQ.push({ kind: era, t: 1.6 + 0.5 * i, side: i % 2 ? 1 : -1 });
      if (w >= 4 && w % 4 === 0) this.spawnQ.push({ kind: "titan", t: 2.2, side: 0 });
      if (boss) this.spawnQ.push({ kind: "colossus", t: 3.2, side: 0, boss: true });
      this.spawnClock = 0;
      this.clearT = 0;
    },

    spawnEnemy(kind, side, boss) {
      const era = ERA(this.wave);
      const st = Object.assign({}, STAT[kind] || STAT.scout);
      let spr = st.spr;
      if (kind === era) {
        const list = ERA_SPRITES[era];
        spr = list[Math.floor(Math.random() * list.length)];
      }
      if (kind === "colossus") spr = BOSS_SPR[era];
      const hpMul = 1 + (this.wave - 1) * (kind === "colossus" ? 0.22 : 0.08);
      this.enemies.spawn((e) => {
        e.kind = kind;
        e.spr = spr;
        e.boss = !!boss;
        e.x = this.w * (side < 0 ? 0.2 : side > 0 ? 0.8 : 0.5) + (Math.random() * 80 - 40);
        e.y = -40 - Math.random() * 40;
        e.vx = 0; e.t = Math.random() * Math.PI;
        e.hp = Math.round(st.hp * hpMul);
        e.maxHp = e.hp;
        e.r = st.r * (boss ? 1 : 1);
        e.speed = st.speed + this.wave * 3;
        e.fireCd = 0.6 + Math.random();
        e.score = st.score;
        e.w = st.w; e.h = st.h;
        e.flash = 0;
        e.pattern = boss ? "boss" : kind === "raider" ? "zag" : kind === "scout" ? "dive" : "hold";
      });
      if (boss) { SFX.boss(); this.trauma = Math.min(1, this.trauma + 0.55); }
    },

    shootPlayer() {
      const p = this.player;
      const frenesi = this.combo >= 10;
      const rate = (p.turbo > 0 ? 0.07 : 0.14) * (frenesi ? 0.65 : 1) * (this.slow > 0 ? 0.85 : 1);
      p.fireCd = rate;
      const shots = p.spread > 0 ? 5 : 1;
      const spread = p.spread > 0 ? 0.28 : 0;
      for (let i = 0; i < shots; i++) {
        const ang = -Math.PI / 2 + (shots === 1 ? 0 : (i - (shots - 1) / 2) * spread);
        this.bullets.spawn((b) => {
          b.x = p.x; b.y = p.y - 16;
          b.vx = Math.cos(ang) * 620;
          b.vy = Math.sin(ang) * 620;
          b.r = 5; b.dmg = 1; b.from = 1; b.ttl = 1.4; b.hue = 48;
        });
      }
      this.drones.forEach((d) => {
        this.bullets.spawn((b) => {
          b.x = d.x; b.y = d.y; b.vx = 0; b.vy = -700; b.r = 4; b.dmg = 1; b.from = 1; b.ttl = 1.2; b.hue = 180;
        });
      });
      SFX.shoot();
    },

    enemyFire(e) {
      const aim = Math.atan2(this.player.y - e.y, this.player.x - e.x);
      const n = e.boss ? 5 : 1;
      for (let i = 0; i < n; i++) {
        const a = aim + (n === 1 ? 0 : (i - (n - 1) / 2) * 0.22);
        const spd = e.boss ? 240 : 280;
        this.bullets.spawn((b) => {
          b.x = e.x; b.y = e.y + 10;
          b.vx = Math.cos(a) * spd; b.vy = Math.sin(a) * spd;
          b.r = e.boss ? 8 : 5; b.dmg = 1; b.from = 0; b.ttl = 4; b.hue = e.boss ? 8 : 200;
        });
      }
    },

    explode(x, y, n, hue, big) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (big ? 180 : 90) * (0.3 + Math.random());
        this.fx.spawn((p) => {
          p.x = x; p.y = y;
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
          p.life = 0.4 + Math.random() * 0.5;
          p.age = 0; p.size = (big ? 8 : 3) + Math.random() * 4;
          p.hue = hue; p.kind = Math.random() < 0.3 ? "shard" : "spark";
        });
      }
      this.trauma = Math.min(1, this.trauma + (big ? 0.45 : 0.18));
    },

    drop(kind, x, y) {
      this.pickups.spawn((p) => { p.kind = kind; p.x = x; p.y = y; p.vy = 70; p.r = 16; p.t = 0; });
    },

    kill(e) {
      const mul = 1 + Math.min(9, this.combo) * 0.25;
      const got = Math.round(e.score * mul);
      this.score += got;
      this.combo += 1;
      this.comboT = 1.4;
      this.pop("+" + got, e.x, e.y);
      if (this.combo === 10 || this.combo === 20) {
        this.announce(this.combo >= 20 ? "LENDÁRIO NO SETOR" : "VOCÊ ESTÁ NO COMANDO");
        SFX.combo();
      }
      this.explode(e.x, e.y, e.boss ? 70 : 22, e.boss ? 20 : 50, e.boss);
      SFX.boom();
      e.alive = false;
      if (Math.random() < (e.boss ? 1 : 0.18)) {
        const kinds = ["spread", "shield", "turbo", "nova", "drone", "slow"];
        this.drop(kinds[Math.floor(Math.random() * kinds.length)], e.x, e.y);
      }
    },

    pop(text, x, y) {
      this.floaters.spawn((f) => { f.text = text; f.x = x; f.y = y; f.age = 0; f.life = 0.8; });
    },

    hurt() {
      const p = this.player;
      if (p.inv > 0) return;
      if (p.shield > 0) { p.shield = 0; p.inv = 1.1; SFX.hit(); this.explode(p.x, p.y, 16, 180, false); return; }
      p.lives -= 1; p.inv = 1.6; p.flash = 0.3;
      this.trauma = Math.min(1, this.trauma + 0.6);
      SFX.hit();
      if (p.lives <= 0) this.gameOver();
    },

    gameOver() {
      this.mode = "over";
      this.syncUI();
    },

    takePickup(p) {
      p.alive = false;
      SFX.pickup();
      const pl = this.player;
      if (p.kind === "spread") { pl.spread = 8; this.announce("DISPARO MÚLTIPLO"); }
      else if (p.kind === "shield") { pl.shield = 8; this.announce("ESCUDO ENERGON"); }
      else if (p.kind === "turbo") { pl.turbo = 6; this.announce("TURBO"); }
      else if (p.kind === "nova") {
        this.announce("NOVA DO VAZIO");
        this.nuke = 0.6; SFX.nova();
        this.enemies.each((e) => { e.hp -= 8; e.flash = 0.2; if (e.hp <= 0) this.kill(e); });
        this.bullets.a.forEach((b) => { if (!b.from) b.alive = false; });
        this.trauma = 1;
      } else if (p.kind === "drone") {
        this.announce("DRONES EM ÓRBITA");
        if (this.drones.length < 3) this.drones.push({ ang: this.drones.length * 2.1, x: pl.x, y: pl.y });
      } else if (p.kind === "slow") {
        this.slow = 4; this.announce("DILATAÇÃO TEMPORAL");
      }
    },

    step(dt) {
      if (this.mode !== "play") return;
      const timeScale = this.slow > 0 ? 0.45 : 1;
      const eDt = dt * timeScale;
      const p = this.player;
      let ix = this.moveX, iy = this.moveY;
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) ix -= 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) ix += 1;
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) iy -= 1;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) iy += 1;
      if (this.pointer.on) {
        ix += (this.pointer.x - p.x) / 80;
        iy += (this.pointer.y - p.y) / 80;
      }
      const len = Math.hypot(ix, iy);
      if (len > 1) { ix /= len; iy /= len; }
      const spd = (p.turbo > 0 ? 420 : 300);
      p.vx = ix * spd; p.vy = iy * spd;
      p.x = Math.max(24, Math.min(this.w - 24, p.x + p.vx * dt));
      p.y = Math.max(40, Math.min(this.h - 28, p.y + p.vy * dt));
      p.fireCd -= dt;
      if (p.fireCd <= 0) this.shootPlayer();
      p.inv = Math.max(0, p.inv - dt);
      p.flash = Math.max(0, p.flash - dt);
      p.spread = Math.max(0, p.spread - dt);
      p.shield = Math.max(0, p.shield - dt);
      p.turbo = Math.max(0, p.turbo - dt);
      this.slow = Math.max(0, this.slow - dt);
      this.nuke = Math.max(0, this.nuke - dt);
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
      this.bannerT = Math.max(0, this.bannerT - dt);
      this.captionT = Math.max(0, (this.captionT || 0) - dt);
      this.trauma *= Math.pow(0.0008, dt);

      this.drones.forEach((d, i) => {
        d.ang += dt * 2.4;
        const rad = 42 + i * 10;
        d.x = p.x + Math.cos(d.ang) * rad;
        d.y = p.y + Math.sin(d.ang) * rad;
      });

      this.spawnClock += eDt;
      this.spawnQ = this.spawnQ.filter((s) => {
        if (this.spawnClock >= s.t) { this.spawnEnemy(s.kind, s.side, s.boss); return false; }
        return true;
      });

      this.enemies.each((e) => {
        e.t += eDt;
        if (e.pattern === "dive") { e.y += e.speed * eDt; e.x += Math.sin(e.t * 2) * 40 * eDt; }
        else if (e.pattern === "zag") { e.y += e.speed * 0.7 * eDt; e.x += Math.sin(e.t * 3) * 120 * eDt; }
        else if (e.pattern === "boss") {
          e.y += (e.y < 130 ? 40 : 0) * eDt;
          e.x = this.w / 2 + Math.sin(e.t * 0.7) * (this.w * 0.32);
        } else {
          e.y += Math.min(e.speed, 70) * eDt;
          e.x += Math.sin(e.t) * 30 * eDt;
          if (e.y > 160) e.y = 160 + Math.sin(e.t * 0.5) * 20;
        }
        if (e.x < 30) e.x = 30;
        if (e.x > this.w - 30) e.x = this.w - 30;
        e.flash = Math.max(0, e.flash - dt);
        e.fireCd -= eDt;
        if (e.y > 40 && e.fireCd <= 0) {
          e.fireCd = (STAT[e.kind] ? STAT[e.kind].fire : 1.4) * (0.85 + Math.random() * 0.3);
          this.enemyFire(e);
        }
        if (e.y > this.h + 60) e.alive = false;
        const dx = e.x - p.x, dy = e.y - p.y;
        if (dx * dx + dy * dy < (e.r + p.r) * (e.r + p.r)) this.hurt();
      });

      this.bullets.each((b) => {
        b.x += b.vx * eDt; b.y += b.vy * eDt; b.ttl -= eDt;
        if (b.ttl <= 0 || b.x < -20 || b.x > this.w + 20 || b.y < -40 || b.y > this.h + 40) { b.alive = false; return; }
        if (b.from) {
          this.enemies.each((e) => {
            if (!b.alive) return;
            const dx = e.x - b.x, dy = e.y - b.y;
            if (dx * dx + dy * dy < (e.r + b.r) * (e.r + b.r)) {
              b.alive = false; e.hp -= b.dmg; e.flash = 0.12;
              if (e.hp <= 0) this.kill(e);
            }
          });
        } else {
          const dx = p.x - b.x, dy = p.y - b.y;
          if (dx * dx + dy * dy < (p.r + b.r) * (p.r + b.r)) { b.alive = false; this.hurt(); }
        }
      });

      this.pickups.each((u) => {
        u.y += u.vy * dt; u.t += dt;
        if (u.y > this.h + 30) u.alive = false;
        const dx = u.x - p.x, dy = u.y - p.y;
        if (dx * dx + dy * dy < (u.r + p.r) * (u.r + p.r)) this.takePickup(u);
      });

      this.fx.each((q) => {
        q.age += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 30 * dt;
        q.vx *= 0.98; if (q.age >= q.life) q.alive = false;
      });
      this.floaters.each((f) => { f.age += dt; f.y -= 28 * dt; if (f.age >= f.life) f.alive = false; });

      if (this.spawnQ.length === 0) {
        let live = 0;
        this.enemies.each(() => { live++; });
        if (live === 0) {
          this.clearT += dt;
          if (this.clearT > 1.15) this.queueWave(this.wave + 1);
        }
      }
      this.syncHud();
    },

    drawSpr(name, x, y, w, h, flash) {
      const im = IM[name];
      const ctx = this.ctx;
      if (im) {
        ctx.save();
        if (flash) ctx.filter = "brightness(2.2)";
        ctx.drawImage(im, x - w / 2, y - h / 2, w, h);
        ctx.restore();
      } else {
        ctx.fillStyle = flash ? "#fff" : "#5ec8d8";
        ctx.beginPath(); ctx.arc(x, y, w / 2, 0, Math.PI * 2); ctx.fill();
      }
    },

    render(now) {
      const ctx = this.ctx;
      const t = now / 1000;
      let sx = 0, sy = 0;
      if (!this.reduced && this.trauma > 0.01) {
        const m = this.trauma * this.trauma * 18;
        sx = (Math.random() * 2 - 1) * m;
        sy = (Math.random() * 2 - 1) * m;
      }
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = "#07080c";
      ctx.fillRect(0, 0, this.w, this.h);

      ctx.save();
      ctx.translate(sx * 0.3, sy * 0.3);
      if (IM.nebula) {
        const nw = this.w * 1.3, nh = this.h * 1.1;
        const ny = ((t * 8) % nh);
        ctx.globalAlpha = 0.45;
        ctx.drawImage(IM.nebula, -this.w * 0.15, ny - nh, nw, nh);
        ctx.drawImage(IM.nebula, -this.w * 0.15, ny, nw, nh);
        ctx.globalAlpha = 1;
      }
      this.planets.forEach((pl) => {
        const x = ((pl.x * this.w + t * 8 * pl.z + sx * pl.z) % (this.w + 120)) - 60;
        const y = (pl.y * this.h + Math.sin(t * 0.2 + pl.p) * 12);
        if (IM[pl.k]) { ctx.globalAlpha = 0.7; ctx.drawImage(IM[pl.k], x, y, pl.s, pl.s); ctx.globalAlpha = 1; }
      });
      this.stars.forEach((layer) => {
        ctx.fillStyle = "rgba(232,234,239,.85)";
        layer.a.forEach((s) => {
          const y = ((s.y * this.h + t * 18 * layer.z + sy * layer.z) % this.h);
          const x = s.x * this.w;
          ctx.fillRect(x, y, s.s, s.s);
        });
      });
      ctx.restore();

      ctx.save();
      ctx.translate(sx, sy);

      this.pickups.each((u) => {
        const bob = Math.sin(u.t * 4) * 4;
        const key = u.kind === "nova" || u.kind === "drone" || u.kind === "slow" ? "pickup-turbo" : "pickup-" + (PICK_SPR[u.kind] ? u.kind : "shield");
        const map = { spread: "pickup-spread", shield: "pickup-shield", turbo: "pickup-turbo", nova: "pickup-turbo", drone: "pickup-shield", slow: "pickup-spread" };
        this.glow(u.x, u.y + bob, 22, "rgba(94,200,216,.45)");
        this.drawSpr(map[u.kind] || "pickup-shield", u.x, u.y + bob, 36, 36);
      });

      this.enemies.each((e) => this.drawSpr(e.spr, e.x, e.y, e.w, e.h, e.flash > 0));
      this.bullets.each((b) => {
        this.glow(b.x, b.y, b.from ? 14 : 12, b.from ? "rgba(243,211,106,.6)" : "rgba(94,200,216,.5)");
        this.drawSpr(b.from ? "boltP" : "boltE", b.x, b.y, b.from ? 16 : 14, b.from ? 28 : 24);
      });

      const p = this.player;
      if (p) {
        if (p.shield > 0) {
          ctx.strokeStyle = "rgba(94,200,216,.8)";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, 28 + Math.sin(t * 8) * 2, 0, Math.PI * 2); ctx.stroke();
          this.glow(p.x, p.y, 34, "rgba(94,200,216,.25)");
        }
        if (p.inv <= 0 || Math.floor(p.inv * 12) % 2 === 0) {
          this.drawSpr("player", p.x, p.y, 48, 48, p.flash > 0);
        }
        this.drones.forEach((d) => { this.glow(d.x, d.y, 12, "rgba(94,200,216,.6)"); this.drawSpr("boltP", d.x, d.y, 16, 16); });
      }

      this.fx.each((q) => {
        const a = 1 - q.age / q.life;
        ctx.fillStyle = `hsla(${q.hue},90%,65%,${a})`;
        ctx.globalCompositeOperation = "lighter";
        ctx.beginPath(); ctx.arc(q.x, q.y, q.size * a, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      });
      ctx.fillStyle = "#f3d36a";
      ctx.font = "700 14px Orbitron, sans-serif";
      ctx.textAlign = "center";
      this.floaters.each((f) => {
        ctx.globalAlpha = 1 - f.age / f.life;
        ctx.fillText(f.text, f.x, f.y);
        ctx.globalAlpha = 1;
      });

      if (this.nuke > 0) {
        ctx.fillStyle = `rgba(232,234,239,${this.nuke * 0.65})`;
        ctx.fillRect(-20, -20, this.w + 40, this.h + 40);
      }
      const vg = ctx.createRadialGradient(this.w/2, this.h/2, this.h*0.25, this.w/2, this.h/2, this.h*0.75);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,.45)");
      ctx.fillStyle = vg;
      ctx.fillRect(-20, -20, this.w + 40, this.h + 40);
      ctx.restore();

      /* cheap bloom: copy highlights at low res */
      if (!this.reduced && this.mode === "play") {
        const b = this.bctx;
        b.globalCompositeOperation = "source-over";
        b.fillStyle = "#000";
        b.fillRect(0, 0, this.bloom.width, this.bloom.height);
        b.drawImage(this.canvas, 0, 0, this.bloom.width, this.bloom.height);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.35;
        ctx.drawImage(this.bloom, sx, sy, this.w, this.h);
        ctx.restore();
      }
    },

    glow(x, y, r, col) {
      const g = this.ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col);
      g.addColorStop(1, "rgba(0,0,0,0)");
      this.ctx.fillStyle = g;
      this.ctx.globalCompositeOperation = "lighter";
      this.ctx.beginPath(); this.ctx.arc(x, y, r, 0, Math.PI * 2); this.ctx.fill();
      this.ctx.globalCompositeOperation = "source-over";
    },

    loop: null,
    startLoop() {
      this.last = performance.now();
      const tick = (now) => {
        this.raf = requestAnimationFrame(tick);
        let dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        this.step(dt);
        this.render(now);
        this.syncBanners();
      };
      this.loop = tick;
      this.raf = requestAnimationFrame(tick);
    },
    stopLoop() { cancelAnimationFrame(this.raf); },

    syncHud() {
      const $ = (s) => document.querySelector(s);
      const s = $("[data-cs-score]");
      if (s) s.textContent = String(this.score || 0);
      const w = $("[data-cs-wave]");
      if (w) w.textContent = String(this.wave || 1).padStart(2, "0");
      const c = $("[data-cs-combo]");
      if (c) c.textContent = "x" + (1 + Math.min(9, this.combo || 0) * 0.25).toFixed(2).replace(/\.00$/, "");
      const l = $("[data-cs-lives]");
      if (l) l.textContent = String((this.player && this.player.lives) || 0);
    },
    syncBanners() {
      const b = document.querySelector("[data-cs-banner]");
      const c = document.querySelector("[data-cs-caption]");
      if (b) b.textContent = this.bannerT > 0 ? this.banner : "";
      if (c) c.textContent = (this.captionT || 0) > 0 ? this.caption : "";
    },
    syncUI() {
      const q = (s) => document.querySelector(s);
      const mode = this.mode;
      q("[data-cs-hud]").hidden = mode !== "play" && mode !== "pause";
      q("[data-cs-menu]").hidden = mode !== "menu";
      q("[data-cs-pause]").hidden = mode !== "pause";
      q("[data-cs-over]").hidden = mode !== "over";
      q("[data-cs-board]").hidden = mode !== "scores";
      const stick = q("[data-cs-stick]");
      if (stick) stick.hidden = mode !== "play";
      q("[data-cs-high]").textContent = String(topScore());
      q("[data-cs-mute]").textContent = SFX.muted ? "Som desligado" : "Som ligado";
      if (mode === "over") {
        q("[data-cs-over-score]").textContent = String(this.score);
        q("[data-cs-over-wave]").textContent = String(this.wave);
        const share = q("[data-cs-share]");
        const txt = `Fiz ${this.score} pontos no CYBERSHIFT (onda ${this.wave})!`;
        if (share) share.href = "https://wa.me/?text=" + encodeURIComponent(txt);
      }
      if (mode === "scores") {
        const list = q("[data-cs-list]");
        const rows = loadSave().scores;
        list.innerHTML = rows.length
          ? rows.map((r, i) => `<li style="display:grid;grid-template-columns:2rem 1fr auto;gap:.6rem;padding:.4rem 0;border-bottom:1px solid #2a2e38"><span style="color:#8b909c">${i + 1}</span><span>${r.name}</span><b style="color:#5ec8d8">${r.score}</b></li>`).join("")
          : '<li class="sub">Nenhum recorde ainda. Abra fogo.</li>';
      }
    }
  };

  /* bind loop after object exists */
  /* (startLoop already defined) */

  function isStandalone() {
    return !!(window.CS_STANDALONE || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone);
  }
  function isIOS() {
    const ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function downloadLinks() {
    if (window.CS_DOWNLOADS) return window.CS_DOWNLOADS;
    return { jogo: "cybershift-jogo.zip" };
  }
  function wireDownloads(box) {
    const dl = downloadLinks();
    const j = box.querySelector("[data-cs-dl-jogo]");
    if (j && dl.jogo) { j.href = dl.jogo; j.hidden = false; }
  }
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.querySelectorAll("[data-cs-install]").forEach((b) => { b.hidden = false; });
  });
  function syncInstallUI(box) {
    if (!box) return;
    const inst = box.querySelector("[data-cs-install]");
    const ios = box.querySelector("[data-cs-ios]");
    const done = box.querySelector("[data-cs-installed]");
    if (isStandalone()) {
      if (inst) inst.hidden = true;
      if (ios) ios.hidden = true;
      if (done) done.hidden = false;
      box.classList.add("is-standalone");
      return;
    }
    if (done) done.hidden = true;
    if (isIOS() && ios) ios.hidden = false;
    if (inst && deferredPrompt) inst.hidden = false;
  }

  function openGame() {
    inject();
    const box = document.getElementById("jogo-cybershift");
    box.removeAttribute("hidden");
    box.classList.add("is-on");
    if (isStandalone()) box.classList.add("is-standalone");
    document.body.style.overflow = "hidden";
    wireDownloads(box);
    syncInstallUI(box);
    const canvas = document.getElementById("cs-canvas");
    const go = async () => {
      if (!Game.ready) await Game.boot(canvas);
      Game.mode = "menu";
      Game.syncUI();
      Game.resize();
      Game.stopLoop();
      Game.startLoop();
    };
    go();
    SFX.unlock();
  }
  function closeGame() {
    if (isStandalone() || window.CS_STANDALONE) return;
    const box = document.getElementById("jogo-cybershift");
    if (!box) return;
    Game.stopLoop();
    Game.mode = "menu";
    box.classList.remove("is-on");
    box.setAttribute("hidden", "");
    document.body.style.overflow = "";
  }

  function bind() {
    inject();
    document.addEventListener("click", (e) => {
      const a = e.target.closest("[data-abrir-jogo]");
      if (a) { e.preventDefault(); openGame(); }
      const inst = e.target.closest("[data-cs-install]");
      if (inst && deferredPrompt) {
        e.preventDefault();
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(() => { deferredPrompt = null; inst.hidden = true; });
      }
    });
    const box = document.getElementById("jogo-cybershift");
    box.addEventListener("click", (e) => {
      if (e.target.closest("[data-cs-fechar]")) closeGame();
      if (e.target.closest("[data-cs-play]") || e.target.closest("[data-cs-again]")) {
        SFX.unlock(); Game.reset(); Game.mode = "play"; Game.syncUI();
      }
      if (e.target.closest("[data-cs-resume]")) { Game.mode = "play"; Game.syncUI(); }
      if (e.target.closest("[data-cs-menu-btn]") || e.target.closest("[data-cs-menu-btn2]") || e.target.closest("[data-cs-back]")) {
        Game.mode = "menu"; Game.syncUI();
      }
      if (e.target.closest("[data-cs-scores]")) { Game.mode = "scores"; Game.syncUI(); }
      if (e.target.closest("[data-cs-mute]")) {
        SFX.unlock();
        SFX.muted = !SFX.muted;
        const s = loadSave(); s.muted = SFX.muted; writeSave(s);
        Game.syncUI();
      }
    });
    box.querySelector("[data-cs-form]").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = box.querySelector("[data-cs-name]").value;
      addScore(name, Game.score, Game.wave);
      Game.mode = "scores";
      Game.syncUI();
    });

    window.addEventListener("keydown", (e) => {
      if (!box.classList.contains("is-on")) return;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
      Game.keys.add(e.code);
      if (e.code === "Escape" || e.code === "KeyP") {
        if (Game.mode === "play") { Game.mode = "pause"; Game.syncUI(); }
        else if (Game.mode === "pause") { Game.mode = "play"; Game.syncUI(); }
        else if (e.code === "Escape") closeGame();
      }
      if (e.code === "KeyM") {
        SFX.muted = !SFX.muted;
        const s = loadSave(); s.muted = SFX.muted; writeSave(s);
        Game.syncUI();
      }
    });
    window.addEventListener("keyup", (e) => Game.keys.delete(e.code));
    window.addEventListener("blur", () => { Game.keys.clear(); if (Game.mode === "play" && box.classList.contains("is-on")) { Game.mode = "pause"; Game.syncUI(); } });
    window.addEventListener("resize", () => Game.ready && Game.resize());

    const canvas = box.querySelector("#cs-canvas");
    const toLocal = (ev) => {
      const r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (Game.mode !== "play") return;
      canvas.setPointerCapture(e.pointerId);
      const p = toLocal(e);
      Game.pointer.on = true; Game.pointer.x = p.x; Game.pointer.y = p.y;
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!Game.pointer.on) return;
      const p = toLocal(e);
      Game.pointer.x = p.x; Game.pointer.y = p.y;
    });
    const up = () => { Game.pointer.on = false; };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    const stick = box.querySelector("[data-cs-stick]");
    const knob = box.querySelector("[data-cs-knob]");
    const setKnob = (dx, dy) => {
      const m = Math.min(40, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      knob.style.left = 37 + Math.cos(a) * (m || 0) + "px";
      knob.style.top = 37 + Math.sin(a) * (m || 0) + "px";
    };
    stick.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      stick.setPointerCapture(e.pointerId);
      Game.stick.on = true; Game.stick.id = e.pointerId;
    });
    stick.addEventListener("pointermove", (e) => {
      if (!Game.stick.on) return;
      const r = stick.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const m = Math.hypot(dx, dy) || 1;
      const rad = 40;
      if (m > rad) { dx = (dx / m) * rad; dy = (dy / m) * rad; }
      Game.moveX = dx / rad; Game.moveY = dy / rad;
      setKnob(dx, dy);
    });
    const stickUp = () => { Game.stick.on = false; Game.moveX = 0; Game.moveY = 0; setKnob(0, 0); };
    stick.addEventListener("pointerup", stickUp);
    stick.addEventListener("pointercancel", stickUp);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();

  if (window.CS_STANDALONE) {
    const start = () => openGame();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }

  window.CYBERSHIFT = { open: openGame, close: closeGame, game: Game };
})();
