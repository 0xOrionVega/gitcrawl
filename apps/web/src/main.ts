import '@fontsource/press-start-2p/400.css';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/600.css';
import './styles.css';

import type { DungeonSpec, RepoRef } from '@gitcrawl/shared';
import { $, clear, h, isTouchDevice } from './util/dom';
import { bus, ensureGame, getDungeon, setDialogOpen, setPaused, startDungeon } from './game/host';
import { audio } from './audio/audio';
import { Hud } from './ui/hud';
import { Dialog } from './ui/dialog';
import { mountToasts, toast } from './ui/toast';
import { TouchControls } from './ui/touch';
import { renderLanding, rememberRepo, renderLocalHelp } from './ui/landing';
import { renderLoading } from './ui/loading';
import { renderMenu } from './ui/menu';
import { renderEnd } from './ui/end';
import { renderReport } from './ui/report';
import { renderVersus, renderVersusForm } from './ui/versus';
import { renderHall, hallFromFixtures } from './ui/hall';
import { navigate, onRouteChange, parseRoute, playPath, type Route } from './ui/router';
import { loadDungeon, loadFixture, loadFixtureIndex, loadLocalDungeon, LoadError } from './data/load';
import { getDaily, getHall } from './data/api';
import { clips, clipsSupported } from './record/clip';
import { DEMO, EMBEDDED } from './config';
import type { RunStats } from './game/types';

const app = $('#app');
const gameEl = $('#game');
const screen = $('#screen');
const menuEl = $('#menu');

let hud: Hud;
let dialog: Dialog;
let touch: TouchControls;

interface Run {
  ref: RepoRef;
  spec: DungeonSpec;
  explore: boolean;
  daily: boolean;
  ended: boolean;
}
let run: Run | null = null;
let lastRouteKey = '';
let attractSpec: DungeonSpec | null = null;

function showScreen(kind: 'landing' | 'loading' | 'page' | null) {
  screen.className = kind ? `overlay ${kind}` : 'overlay';
  screen.hidden = kind === null;
}

function closeMenu() {
  menuEl.hidden = true;
  clear(menuEl);
}

async function startAttract(preferred?: DungeonSpec) {
  if (preferred) {
    attractSpec = preferred;
  } else if (!attractSpec) {
    const index = await loadFixtureIndex();
    const pick = index.find((e) => e.fullName === 'facebook/react') ?? index[0];
    attractSpec = pick ? await loadFixture(pick.fullName) : null;
  }
  if (attractSpec) startDungeon(attractSpec, 'attract');
}

function leaveRun() {
  run = null;
  hud.hide();
  touch.hide();
  dialog.hide();
  closeMenu();
  audio.stopMusic();
  void clips.finishRolling();
}

// ---------------------------------------------------------------- routes
async function render(force = false) {
  const route = parseRoute();
  const key = JSON.stringify(route);
  if (!force && key === lastRouteKey) return;
  lastRouteKey = key;
  closeMenu();
  dialog.hide();
  switch (route.name) {
    case 'home':
      leaveRun();
      document.title = 'gitcrawl: play any GitHub repo as a dungeon';
      showScreen('landing');
      renderLanding(screen, landingActions);
      void startAttract();
      break;
    case 'play':
      await play(route.ref, route.explore, route.daily, route.priv);
      break;
    case 'report':
      await reportPage(route.ref);
      break;
    case 'vs':
      await versusPage(route);
      break;
    case 'hall':
      await hallPage();
      break;
    case 'daily':
      await dailyRaid();
      break;
    case 'local':
      await localRun();
      break;
  }
}

const landingActions = {
  play: (ref: RepoRef) => navigate(playPath(ref)),
  daily: () => navigate('/daily'),
  versus: () => navigate('/vs'),
  hall: () => navigate('/hall'),
  local: () => {
    showScreen('landing');
    renderLocalHelp(screen, () => renderLanding(screen, landingActions), (ref: RepoRef) => navigate(playPath(ref, { priv: true })));
  },
};

async function fetchSpec(ref: RepoRef, title: string, priv = false): Promise<DungeonSpec | null> {
  showScreen('loading');
  const loader = renderLoading(screen, title);
  try {
    return await loadDungeon(ref, loader.step, { priv });
  } catch (err) {
    let message = err instanceof LoadError ? err.message : `Something went wrong: ${(err as Error).message}`;
    const actions = [
      { label: 'Try again', run: () => void render(true) },
      { label: 'Back home', run: () => navigate('/') },
    ];
    if (DEMO && err instanceof LoadError && err.code === 'network') {
      message = `This demo can't reach GitHub from here, so it can only open the dungeons it ships with. The full site builds any public repo.`;
      actions.splice(0, 1, { label: 'Play facebook/react', run: () => navigate('/r/facebook/react') });
    } else if (err instanceof LoadError && err.code === 'rate_limited') {
      actions.splice(1, 0, { label: 'Play facebook/react', run: () => navigate('/r/facebook/react') });
    }
    loader.fail(message, actions);
    return null;
  }
}

async function play(ref: RepoRef, explore: boolean, daily: boolean, priv = false) {
  leaveRun();
  const spec = await fetchSpec(ref, `${ref.owner}/${ref.name}`, priv);
  if (!spec) return;
  beginRun(spec, ref, explore, daily);
}

function beginRun(spec: DungeonSpec, ref: RepoRef, explore: boolean, daily: boolean) {
  rememberRepo(spec.repo.fullName);
  document.title = `${spec.repo.fullName}: ${spec.title.name} | gitcrawl`;
  run = { ref, spec, explore, daily, ended: false };
  showScreen(null);
  clips.setLabel(spec.repo.fullName);
  hud.show(spec);
  if (isTouchDevice()) touch.show();
  startDungeon(spec, explore ? 'explore' : 'play');
}

async function reportPage(ref: RepoRef) {
  leaveRun();
  const spec = await fetchSpec(ref, `Loot report: ${ref.owner}/${ref.name}`);
  if (!spec) return;
  void startAttract(spec);
  showReport(spec, false);
}

function showReport(spec: DungeonSpec, fromRun: boolean) {
  showScreen('page');
  clear(screen);
  const back = fromRun
    ? h('button', { class: 'btn primary', onclick: () => resumeFromPage() }, 'Back to the dungeon')
    : h('button', { class: 'btn primary', onclick: () => navigate(playPath({ owner: spec.repo.owner, name: spec.repo.name })) }, 'Enter the dungeon');
  screen.append(
    h(
      'div',
      { class: 'page-inner' },
      h('div', { class: 'topbar' }, h('button', { class: 'home', onclick: () => navigate('/') }, 'gitcrawl'), back),
      h('h1', { class: 'victory-title' }, `Loot report: ${spec.repo.fullName}`),
      h('p', { class: 'victory-sub' }, spec.title.tagline),
      renderReport(spec),
    ),
  );
  screen.scrollTop = 0;
}

function resumeFromPage() {
  showScreen(null);
  setPaused(false);
  if (run) hud.root.hidden = false;
}

async function versusPage(route: Extract<Route, { name: 'vs' }>) {
  leaveRun();
  const actions = {
    compare: (a: RepoRef, b: RepoRef) => navigate(`/vs/${a.owner}/${a.name}/${b.owner}/${b.name}`),
    play: (ref: RepoRef) => navigate(playPath(ref)),
    home: () => navigate('/'),
  };
  void startAttract();
  if (!route.a || !route.b) {
    showScreen('page');
    renderVersusForm(screen, actions, { a: route.a, b: route.b });
    return;
  }
  const a = await fetchSpec(route.a, `${route.a.owner}/${route.a.name} vs ${route.b.owner}/${route.b.name}`);
  if (!a) return;
  const b = await fetchSpec(route.b, `${route.a.owner}/${route.a.name} vs ${route.b.owner}/${route.b.name}`);
  if (!b) return;
  showScreen('page');
  renderVersus(screen, a, b, actions);
}

async function hallPage() {
  leaveRun();
  void startAttract();
  showScreen('page');
  clear(screen);
  screen.append(h('div', { class: 'page-inner' }, h('p', {}, 'Counting the shame…')));
  const index = await loadFixtureIndex();
  const fromApi = await getHall();
  const data = fromApi && fromApi.biggestBosses.length > 0 ? fromApi : hallFromFixtures(index);
  renderHall(screen, data, (ref) => navigate(playPath(ref)), () => navigate('/'));
}

async function dailyRaid() {
  const daily = await getDaily();
  let repo = daily?.repo ?? null;
  if (!repo) {
    const index = await loadFixtureIndex();
    if (index.length > 0) {
      const day = Math.floor(Date.now() / 86_400_000);
      repo = index[day % index.length].fullName;
    }
  }
  if (!repo) {
    navigate('/', true);
    return;
  }
  const [owner, name] = repo.split('/');
  toast(`Today's raid: ${repo}`, 'gold');
  navigate(playPath({ owner, name }, { daily: true }), true);
}

async function localRun() {
  leaveRun();
  showScreen('loading');
  const loader = renderLoading(screen, 'Your local dungeon');
  const spec = await loadLocalDungeon();
  if (!spec) {
    loader.fail('No local dungeon found. Run npx gitcrawl-cli inside a git repo to create one.', [{ label: 'Back home', run: () => navigate('/') }]);
    return;
  }
  beginRun(spec, { owner: spec.repo.owner, name: spec.repo.name }, false, false);
}

// ---------------------------------------------------------------- menu
function openMenu() {
  if (!run || run.ended) return;
  const scene = getDungeon();
  if (!scene) return;
  setPaused(true);
  menuEl.hidden = false;
  renderMenu(menuEl, { explore: scene.getMode() === 'explore', muted: audio.muted, canRecord: clipsSupported() && !EMBEDDED }, {
    resume: () => {
      closeMenu();
      setPaused(false);
    },
    toggleExplore: () => {
      const s = getDungeon();
      if (!s || !run) return;
      const next = s.getMode() === 'explore' ? 'play' : 'explore';
      s.setMode(next);
      run.explore = next === 'explore';
      closeMenu();
      setPaused(false);
    },
    report: () => {
      closeMenu();
      if (run) {
        hud.root.hidden = true;
        showReport(run.spec, true);
      }
    },
    record: () => {
      closeMenu();
      setPaused(false);
      void recordClip();
    },
    restart: () => {
      closeMenu();
      if (run) beginRun(run.spec, run.ref, run.explore, run.daily);
    },
    leave: () => navigate('/'),
    map: () => {
      closeMenu();
      setPaused(false);
      hud.openBigMap();
    },
  });
}

async function recordClip() {
  if (!clipsSupported()) {
    toast("This browser can't record clips.", 'bad');
    return;
  }
  if (clips.recording) return;
  hud.setRecording(true);
  toast('Recording the next 10 seconds. Make it count.', 'info');
  const clip = await clips.recordFor(10_000);
  hud.setRecording(false);
  if (clip && run) {
    toast('Clip ready.', 'good', { label: 'Download', href: clip.url, download: `gitcrawl-${run.spec.repo.name}.${clip.ext}` });
  }
}

// ---------------------------------------------------------------- events
function wireBus() {
  bus.on('dialog', (p) => {
    if (p) dialog.show(p);
    else dialog.hide();
    setDialogOpen(!!p);
  });
  bus.on('toast', (p) => toast(p.text, p.tone));
  bus.on('boss', (p) => {
    if (p.state === 'start' && clipsSupported() && !EMBEDDED) clips.startRolling();
  });
  bus.on('victory', (stats: RunStats) => {
    if (!run) return;
    run.ended = true;
    const current = run;
    void clips.finishRolling().then(() => {
      window.setTimeout(() => {
        if (run !== current) return;
        hud.hide();
        touch.hide();
        dialog.hide();
        setPaused(true);
        showScreen('page');
        renderEnd(
          screen,
          current.spec,
          stats,
          {
            playAgain: () => beginRun(current.spec, current.ref, false, current.daily),
            explore: () => beginRun(current.spec, current.ref, true, false),
            home: () => navigate('/'),
            versus: () => navigate(`/vs/${current.spec.repo.owner}/${current.spec.repo.name}`),
          },
          { daily: current.daily, ref: current.ref },
        );
      }, 900);
    });
  });
  dialog.setOnClose(() => setDialogOpen(false));
}

function wireKeys() {
  window.addEventListener('keydown', (ev) => {
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (ev.key === 'Escape') {
      if (hud.closeBigMap()) return;
      if (dialog.open) {
        dialog.hide();
        return;
      }
      if (!menuEl.hidden) {
        closeMenu();
        setPaused(false);
        return;
      }
      if (run && !run.ended && screen.hidden) openMenu();
    } else if (ev.key === 'm' || ev.key === 'M') {
      audio.toggleMute();
    } else if ((ev.key === 'Tab' || ev.key === 'Map') && run && screen.hidden) {
      ev.preventDefault();
      if (!hud.closeBigMap()) hud.openBigMap();
    }
  });
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && run && !run.ended && screen.hidden && menuEl.hidden) openMenu();
  });
}

async function boot() {
  const fonts = Promise.all([document.fonts.load('16px "Press Start 2P"'), document.fonts.load('16px "Pixelify Sans"')]).catch(() => undefined);
  await Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]);
  await ensureGame(gameEl);
  hud = new Hud(app, {
    onMenu: () => openMenu(),
    onRecord: () => void recordClip(),
    onInteract: () => getDungeon()?.interact(),
  });
  dialog = new Dialog(app);
  mountToasts(app);
  touch = new TouchControls(app);
  wireBus();
  wireKeys();
  onRouteChange(() => void render());
  await render(true);
  if (DEMO) document.documentElement.dataset.demo = '1';
}

void boot();
