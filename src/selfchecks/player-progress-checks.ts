/**
 * Self-checks M01 · прогресс (карточка §4–§6, §8): кривые XP из данных,
 * уровень 1→60, навыки от событий (заточка качает даже при провале),
 * перки через провайдер, счётчики по конфигу, сейв-срез игрока.
 * [FIX-M01 · DEBT-19] оракул кривой навыка читает данные — литералов в проверке нет.
 */
import { PLAYER_TABLE } from '@/content/player/progression';
import { SKILLS_TABLE } from '@/content/player/skills';
import { COUNTERS_TABLE } from '@/content/player/counters';
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame } from '@/game/bootstrap';
import { check, group, type CheckGroup, type CheckResult } from './types';
import { makePlayerGame } from './player-fixture';

/** ручной оракул кривой уровня: xpToNext(L) = round(xpBase × (1+g)^L) */
function manualXpToNext(level: number): number {
  const { xpBase, growthPercent } = PLAYER_TABLE.level;
  return Math.round(xpBase * (1 + growthPercent / 100) ** level);
}

/** сколько XP нужно суммарно, чтобы подняться с уровня 1 до target включительно */
function manualTotalXp(target: number): number {
  let sum = 0;
  for (let l = 1; l < target; l++) sum += manualXpToNext(l);
  return sum;
}

export function runPlayerXpChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const f = makePlayerGame();

  // кривая из данных: 100 × 1.15^L (карточка §4)
  results.push(
    check('кривая: xpToNext(1) = 115 = 100 × 1.15 (из данных)', () => {
      const snap = f.snapshot();
      return snap.progress.xpNeed === manualXpToNext(1) && snap.progress.xpNeed === 115;
    }),
  );
  results.push(
    check('кривая: xpToNext(10) = 405 (данные, не хардкод)', () => manualXpToNext(10) === 405),
  );

  // события → XP по таблице данных (§4): сбор 5, квест 50–500 из пейлоада
  f.game.bus.publish('farm.cropHarvested', { crop: 'wheat', qty: 1 });
  results.push(
    check('событие farm.cropHarvested → +5 XP (таблица данных)', () => f.snapshot().progress.xp === 5, {
      expected: '5',
      actual: String(f.snapshot().progress.xp),
    }),
  );
  f.game.bus.publish('quest.completed', { xp: 250 });
  results.push(
    check('квест несёт XP в пейлоаде: quest.completed {xp: 250} → +250', () => {
      const p = f.snapshot().progress;
      return p.level > 1 || p.xp >= 255; // 255 XP на кривой уровня 1 = уровень 2+
    }),
  );

  // levelUp: событие с номером уровня (добираем ровно до следующего порога)
  let levelUps = 0;
  let lastLevel = 0;
  f.game.bus.subscribe('player.levelUp', (p) => {
    levelUps++;
    lastLevel = (p as { level: number }).level;
  });
  const before3 = f.snapshot().progress;
  f.api['player.addXp'](before3.xpNeed - before3.xp, 'selfcheck');
  const after3 = f.snapshot().progress;
  results.push(
    check('addXp: ровно до следующего уровня, событие levelUp дошёл', () => after3.level === before3.level + 1 && levelUps >= 1 && lastLevel === after3.level, {
      expected: `уровень ${before3.level + 1}`,
      actual: `уровень ${after3.level}, levelUp ×${levelUps}, последний ${lastLevel}`,
    }),
  );

  // уровень 1 → 60 одним большим XP (карточка §8: тест уровня с 1 по 60)
  const f2 = makePlayerGame();
  const total = manualTotalXp(60);
  f2.api['player.addXp'](total, 'selfcheck');
  const s60 = f2.snapshot().progress;
  results.push(
    check('тест уровня 1 → 60: суммарный XP из кривой поднимает ровно до 60', () => s60.level === 60, {
      expected: 'уровень 60',
      actual: `уровень ${s60.level}`,
    }),
  );
  results.push(
    check('кап уровня 60 (из данных): лишний XP не поднимает выше', () => {
      f2.api['player.addXp'](Number.MAX_SAFE_INTEGER / 2, 'selfcheck.overflow');
      const after = f2.snapshot().progress;
      return after.level === 60 && after.xp <= after.xpNeed;
    }),
  );

  // XP-кривая и уровень — только из данных: в таблице нет чисел-хардкодов кода
  results.push(
    check('источник кривой — content/player/progression.ts (xpBase 100, рост 15%)', () => PLAYER_TABLE.level.xpBase === 100 && PLAYER_TABLE.level.growthPercent === 15),
  );

  f.dispose();
  f2.dispose();
  return group('M01 · XP и уровень (карточка §4, §8)', results);
}

export function runPlayerSkillChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const f = makePlayerGame();

  // кривая навыка — из данных (карточка §5; DEBT-19: оракул без литералов)
  const farming = f.api['skills.get']('farming') as { xpNeed: number };
  results.push(
    check('кривая навыка: xpToNext(0) = skillXpBase из данных', () => farming.xpNeed === manualSkillXpToNext(0), {
      expected: String(manualSkillXpToNext(0)),
      actual: String(farming.xpNeed),
    }),
  );

  // событие → XP навыка (манифест подписок в данных)
  f.game.bus.publish('farm.cropHarvested', { crop: 'wheat', qty: 1 });
  const farmingAfter = f.api['skills.get']('farming') as { xp: number };
  results.push(
    check('farm.cropHarvested → Фермерство +5 (XP навыка)', () => farmingAfter.xp === 5, {
      expected: '5',
      actual: String(farmingAfter.xp),
    }),
  );

  // заточка качает кузнечество даже при провале: подписка на forge.attempt (§5)
  f.game.bus.publish('forge.attempt', { level: 3, success: false });
  const smithing = f.api['skills.get']('smithing') as { xp: number };
  results.push(
    check('forge.attempt (провал!) → Кузнечество +3 — стаж есть всегда', () => smithing.xp === 3, {
      expected: '3',
      actual: String(smithing.xp),
    }),
  );

  // 9 навыков из карточки §5
  const names = SKILLS_TABLE.map((s) => s.name).join(',');
  results.push(
    check('в данных все 9 навыков карточки', () =>
      names.includes('Фермерство') &&
      names.includes('Рыболовство') &&
      names.includes('Рыбоводство') &&
      names.includes('Животноводство') &&
      names.includes('Крафт') &&
      names.includes('Кузнечество') &&
      names.includes('Горняк') &&
      names.includes('Боец') &&
      names.includes('Торговля') &&
      SKILLS_TABLE.length === 9),
  );

  // перки: порог навыка 10 → модификатор на СУЩЕСТВУЮЩУЮ базу fishing.luck.rare
  const luckBefore = f.game.statBus.resolve({ stat: 'fishing.luck.rare', ctx: f.game.time.ctx('player') });
  results.push(check('без навыка fishing.luck.rare = 0 (база)', () => luckBefore === 0));
  f.api['skills.addXp']('fishing', manualSkillTotalXp(10), 'selfcheck');
  const fishing = f.api['skills.get']('fishing') as { level: number };
  const luckAfter = f.game.statBus.resolve({ stat: 'fishing.luck.rare', ctx: f.game.time.ctx('player') });
  results.push(
    check('порог 10 Рыболовства → fishing.luck.rare 0 → 10 (провайдер player.skills)', () => fishing.level === 10 && luckAfter === 10, {
      expected: 'уровень 10, удача 10',
      actual: `уровень ${fishing.level}, удача ${luckAfter}`,
    }),
  );

  // perLevel: N копий модификатора за N уровней (провайдер напрямую — стат
  // action.fishing.efficiency опишет M07, резолва пока нет, П5)
  const provider = f.game.statBus.providerIds().includes('player.skills');
  results.push(check('провайдер player.skills зарегистрирован в шине', () => provider));

  // трассировка порога видна как модификатор навыка
  const trace = f.game.statBus.resolveTrace({ stat: 'fishing.luck.rare', ctx: f.game.time.ctx('player') });
  results.push(
    check('трассировка: порог skill.fishing.thr10 применён (источник skill:fishing)', () =>
      trace.mods.some((m) => m.id === 'skill.fishing.thr10' && m.applied)),
  );

  // уровень игрока в ctx: resolve с реальными extras игрока (MISS-4)
  const extras = f.api['player.ctxExtras']() as Record<string, unknown>;
  results.push(
    check('ctxExtras: player:level и skill:fishing видны шине', () =>
      typeof extras['player:level'] === 'number' && extras['skill:fishing'] === 10),
  );

  f.dispose();
  return group('M01 · Навыки от использования (§5)', results);
}

/** кривая навыка из данных: xpToNext(L) = round(skillXpBase × skillXpGrowth^L) */
function manualSkillXpToNext(level: number): number {
  return Math.round(PLAYER_TABLE.skillXpBase * PLAYER_TABLE.skillXpGrowth ** level);
}

/** суммарный XP навыка до уровня target включительно — кривая из данных */
function manualSkillTotalXp(target: number): number {
  let sum = 0;
  for (let l = 0; l < target; l++) sum += manualSkillXpToNext(l);
  return sum;
}

export function runPlayerCounterChecks(): CheckGroup {
  const results: CheckResult[] = [];
  const f = makePlayerGame();

  // счётчики по конфигу данных: фильтры и valueKey (карточка §6).
  // [M06.2 · FIX M06-OBS-1] синтетика приведена к ЖИВОМУ payload фермы
  // { defId, qty } (поле crop умерло с M05): пшеница даёт предмет
  // wheat_grain (yields дефа); репы в контенте нет — turnip-счётчик УДАЛЁН
  // [M07.2 · D2 · Task 45]: публикации defId turnip больше ничего не тикают
  // (устаревший ключ в старых сейвах молча игнорируется)
  f.game.bus.publish('farm.cropHarvested', { defId: 'wheat_grain', qty: 3 });
  f.game.bus.publish('farm.cropHarvested', { defId: 'turnip', qty: 2 });
  results.push(
    check('harvest.total = 5 (valueKey qty суммирует)', () => f.game.stats.get('harvest.total') === 5, {
      expected: '5',
      actual: String(f.game.stats.get('harvest.total')),
    }),
  );
  results.push(
    check('harvest.wheat = 3 (фильтр defId wheat_grain — живой yield пшеницы, FIX M06-OBS-1); harvest.turnip удалён из конфига [M07.2 · D2] — turnip-события НЕ тикают (соседи живы)', () =>
      f.game.stats.get('harvest.wheat') === 3 && (f.game.stats.get('harvest.turnip') ?? 0) === 0),
  );

  // valueKey отсутствует в пейлоаде → +1 (П5: неизвестное — рядовой случай)
  f.game.bus.publish('fish.caught', { species: 'perch' });
  results.push(
    check('fish.caught без qty → +1 (П5)', () => f.game.stats.get('fish.total') === 1),
  );
  // [M07.2 · F15] фильтр вида чинен species → defId (живой payload M07);
  // счётчики видов ×16 — fish.<fishId>
  f.game.bus.publish('fish.caught', { defId: 'perch', qty: 1 });
  results.push(check('фильтр вида: fish.perch = 1 (defId-фильтр, живой payload M07)', () => f.game.stats.get('fish.perch') === 1 && f.game.stats.get('fish.total') === 2));

  // смерть игрока → счётчик player.deaths (событие с died: true)
  f.api['player.setHp'](0);
  results.push(
    check('player.setHp(0) → player.deaths = 1 (фильтр {died: true})', () => f.game.stats.get('player.deaths') === 1),
  );
  f.api['player.setHp'](10);
  results.push(
    check('лечение счётчик смертей не трогает', () => f.game.stats.get('player.deaths') === 1),
  );

  // событие смерти несёт тег death (карточка §3)
  let deathTag = '';
  f.game.bus.subscribe('player.hpChanged', (p) => {
    const rec = p as { died: boolean; tags: string[] };
    if (rec.died) deathTag = rec.tags.join(',');
  });
  f.api['player.setHp'](0);
  results.push(check('событие смерти несёт тег death (репорт, M13 решает)', () => deathTag === 'death'));

  // счётчики в манифесте (statsCounters) соответствуют конфигу
  const manifestCounters = f.game.modules.get('player')?.manifest.statsCounters ?? [];
  results.push(
    check('манифест statsCounters = конфигу счётчиков', () => manifestCounters.length === COUNTERS_TABLE.length && manifestCounters.includes('player.deaths')),
  );

  f.dispose();
  return group('M01 · Счётчики ядра (§6)', results);
}

export async function runPlayerSaveChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // roundtrip среза игрока: энергия/HP/XP/уровень/навыки переживают save→load
  const clock = new ManualClock(new Date(2024, 0, 1, 12, 0, 0, 0).getTime());
  const g1 = createGame(clock, new MemoryStorage());
  const api1 = g1.modules.get('player')?.api ?? {};
  api1['player.setEnergy'](42);
  api1['player.setHp'](31);
  api1['player.addXp'](manualTotalXp(4), 'selfcheck');
  api1['skills.addXp']('fishing', manualSkillTotalXp(2), 'selfcheck');
  g1.stats.bump('harvest.total', 7);
  await g1.save.save();
  g1.dispose();

  const clock2 = new ManualClock(new Date(2024, 0, 1, 12, 0, 0, 0).getTime());
  const g2 = createGame(clock2, new MemoryStorage());
  // подкладываем сейв g1 в хранилище g2: грузим напрямую из файла-экспорта
  const json = g1.save.exportJson(); // dispose уже сохранил; экспорт из мёртвого ок (чистые данные)
  await g2.save.importJson(json);
  const api2 = g2.modules.get('player')?.api ?? {};
  const snap2 = api2['player.snapshot']() as {
    energy: { current: number };
    hp: { current: number };
    progress: { level: number };
    skills: Array<{ id: string; level: number }>;
  };
  results.push(
    check('roundtrip: энергия 42 и HP 31 восстановлены', () => snap2.energy.current === 42 && snap2.hp.current === 31, {
      expected: '42 / 31',
      actual: `${snap2.energy.current} / ${snap2.hp.current}`,
    }),
  );
  results.push(check('roundtrip: уровень 4 восстановлен', () => snap2.progress.level === 4));
  results.push(
    check('roundtrip: Рыболовство уровень 2 восстановлен', () => (snap2.skills.find((s) => s.id === 'fishing')?.level ?? 0) === 2),
  );
  results.push(check('roundtrip: счётчики (kernel.stats) восстановлены', () => g2.stats.get('harvest.total') === 7));
  results.push(check('roundtrip: версия сейва 15 [M12.1 · v15]', () => g2.save.info().saveVersion === 15)); // [M15 · v9 → M05.1 · v10 → M06.1 · v11 → M07.1 · v12 → M08 · v13] срезы quests/farm/pen/fishing + workers [M11 · v14]
  results.push(check('roundtrip: срез player в списке срезов', () => g2.save.info().slices.includes('player')));

  g2.dispose();
  return group('M01 · Сейв-срез игрока (§8)', results);
}
