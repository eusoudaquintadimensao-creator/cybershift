/* Service worker do PWA CYBERSHIFT — jogo offline. */
const CACHE = "cybershift-v2";
const PRECACHE = [
  "./index.html",
  "./cybershift.js",
  "./favicon.svg",
  "./fonts/orbitron-0.woff2",
  "./fonts/orbitron.css",
  "./game.css",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./manifest.webmanifest",
  "./og.jpg",
  "./planets/earth.webp",
  "./planets/mars.webp",
  "./planets/moon.webp",
  "./planets/nebula.webp",
  "./planets/neptune.webp",
  "./planets/saturn.webp",
  "./sprites/alien-bio.webp",
  "./sprites/alien-bone.webp",
  "./sprites/alien-brute.webp",
  "./sprites/alien-crystal.webp",
  "./sprites/alien-hex.webp",
  "./sprites/alien-insect.webp",
  "./sprites/alien-kraken.webp",
  "./sprites/alien-needle.webp",
  "./sprites/alien-orb.webp",
  "./sprites/alien-saucer.webp",
  "./sprites/base-dead.webp",
  "./sprites/base-depot.webp",
  "./sprites/bolt-enemy.webp",
  "./sprites/bolt-player.webp",
  "./sprites/colossus-crystal.webp",
  "./sprites/colossus-insect.webp",
  "./sprites/colossus-kraken.webp",
  "./sprites/cosmic-crystal.webp",
  "./sprites/cosmic-nebula.webp",
  "./sprites/cosmic-serpent.webp",
  "./sprites/cosmic-void.webp",
  "./sprites/explosion.webp",
  "./sprites/mech-ape.webp",
  "./sprites/mech-jet.webp",
  "./sprites/mech-tank.webp",
  "./sprites/mech-truck.webp",
  "./sprites/mech-warrior.webp",
  "./sprites/mine-prox.webp",
  "./sprites/mine-spike.webp",
  "./sprites/mine.webp",
  "./sprites/missile-cluster.webp",
  "./sprites/missile-giant.webp",
  "./sprites/missile-heavy.webp",
  "./sprites/missile-swarm.webp",
  "./sprites/missile.webp",
  "./sprites/pickup-shield.webp",
  "./sprites/pickup-spread.webp",
  "./sprites/pickup-turbo.webp",
  "./sprites/player.webp",
  "./sprites/raider.webp",
  "./sprites/rock.webp",
  "./sprites/sat-dead.webp",
  "./sprites/scout.webp",
  "./sprites/station.webp",
  "./sprites/titan.webp",
  "./sprites/wreck-cargo.webp",
  "./sprites/wreck-fighter.webp"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (const url of PRECACHE) {
      try { await c.add(url); } catch (e) { /* arquivo ausente não derruba o SW */ }
    }
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // não cachear tiles de mapa nem zip
  if (url.pathname.endsWith(".zip") || /tile\.openstreetmap\.org/.test(url.hostname)) return;
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok && url.origin === location.origin) {
        const c = await caches.open(CACHE);
        c.put(req, res.clone());
      }
      return res;
    } catch (e) {
      if (cached) return cached;
      if (req.mode === "navigate") {
        const fallback = await caches.match("./index.html") || await caches.match("index.html");
        if (fallback) return fallback;
      }
      throw e;
    }
  })());
});
