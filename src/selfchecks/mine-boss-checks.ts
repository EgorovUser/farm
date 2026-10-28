/**
 * Группа «M12 Шахта» · ЧАСТЬ 2/2 сеанса M12.2 — боссы: фазы движка + golden
 * + босс-бой API + расклад bossKilled/bossLoot (бриф G1/G2/G5/G8, Δ-часть).
 * Оркестратор — mine-checks.ts (группа не плодится: 46 групп целы).
 */
import { check, type CheckResult } from './types';
import { MINE_TABLE } from '@/content/mine/table';
import { MINE_BOSSES } from '@/content/mine/bosses';
import { MINE_LAYERS } from '@/content/mine/layers';
import { MINE_MOBS } from '@/content/mine/mobs';
import { resolveFight } from '@/game/modules/mine/logic/fight';
import { buildBossEnemy } from '@/game/modules/mine/logic/enemies';
import {
  makeSeededMineGame,
  eventsOf,
  walletOf,
  mineStateOf,
  lastRollOf,
  fightOf,
  SHIELD_GEAR,
  scriptRoll,
  type MineFixture,
} from './mine-fixture';
import { runMineLootCapChecks } from './mine-lootcap-checks';

type R<T> = { ok: true; value: T } | { ok: false; error: string };

interface BossView {
  header: string;
  rounds: string[];
  outcome: string;
  loot: {
    gold: number;
    ore: { defId: string; qty: number };
    trophy: string;
    aPlus: { defId: string; tier: string; granted: boolean };
    wear?: string;
  } | null;
}

const bossOf = (id: string) => {
  const b = MINE_BOSSES.find((x) => x.id === id);
  if (b === undefined) throw new Error(`босс ${id} не найден`);
  return b;
};

/** баф канала ядра (BUF-1: штатный Buff-канал; пробам боёв — усиление) */
function buffWin(f: MineFixture, atk = 100, def = 100): void {
  const now = f.game.time.now();
  f.game.buffs.add(
    { id: 'selfcheck.mine.atk', source: { kind: 'buff', refId: 'selfcheck' }, stat: 'combat.attack', op: 'flat', value: atk },
    now,
  );
  f.game.buffs.add(
    { id: 'selfcheck.mine.def', source: { kind: 'buff', refId: 'selfcheck' }, stat: 'combat.defense', op: 'flat', value: def },
    now,
  );
}

/** выдать кирку + экипировать (витрина M02 → тир качества); предыдущая
 *  кирка снимается (слот один — «занят» не должен ломать серию замен) */
function equipPickaxe(f: MineFixture, tier: 'D' | 'B' | 'A' | 'S'): string {
  const eq = (f.inv['inventory.equipped'] as () => Array<{ slot: string; entry: { iid: string } }>)();
  if (eq.some((e) => e.slot === 'pickaxe')) {
    (f.inv['inventory.unequip'] as (slot: string) => R<unknown>)('pickaxe'); // слот, НЕ iid
  }
  (f.inv['inventory.add'] as (d: string, t: string, v: number, q: number, s: string) => R<{ iids: string[] }>)(
    'iron_pickaxe',
    tier,
    50,
    1,
    'selfcheck',
  );
  const list = (f.inv['inventory.list'] as () => Array<{ iid: string; defId: string }>)();
  const pick = list.findLast((i) => i.defId === 'iron_pickaxe')!;
  (f.inv['inventory.equip'] as (iid: string, slot: string) => R<unknown>)(pick.iid, 'pickaxe');
  return pick.iid;
}

export async function runMineBossChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 16. фаза «королева»: заморозка
  {
    const queen = buildBossEnemy(bossOf('spider_queen'), 1, MINE_TABLE, []);
    queen.hp = 100_000;
    queen.maxHp = 100_000;
    const player = { hp: 100_000, maxHp: 100_000, atk: 1, def: 0, speed: 10 };
    // сценарий: заморозка → верх (ролл 0.0); все атаки королевы — верх (pair[0]);
    // блок роллится 0.0 (верх без ограничений / центр при скованной верхней)
    const roll = scriptRoll({ 'mine:boss:freeze:spider_queen': 0.0, 'mine:attack:spider_queen': 0.0, 'mine:block': 0.0 });
    const out = resolveFight({ player, enemies: [queen], gear: SHIELD_GEAR, table: MINE_TABLE, roll });
    const announces = out.rounds.filter((r) => r.freeze !== undefined);
    const frozenRecs = out.rounds.filter((r) => r.frozen !== undefined);
    const firstFrozen = frozenRecs.slice(0, 3);
    const afterFrozen = out.rounds.filter((r) => r.attacker === 'enemy' && r.frozen === undefined && r.freeze === undefined);
    const ok3 = firstFrozen.map((r) => r.frozen!.left);
    results.push(
      check('фаза «королева» G1: заморозка ОДНОГО направления блока на 3 хода — объявление (заморожено: верх, 3 хода), затем РОВНО 3 скованных защиты с обратным счётом 3 → 2 → 1, блок в замороженном направлении НЕВОЗМОЖЕН (ролл по двум оставшимся: blockDir ≠ верх), после истечения верх снова доступен (блок верх без скована)', () =>
        announces.length >= 1 &&
        announces[0]!.freeze!.dir === 'top' && announces[0]!.freeze!.left === 3 &&
        firstFrozen.length === 3 &&
        JSON.stringify(ok3) === JSON.stringify([3, 2, 1]) &&
        firstFrozen.every((r) => r.frozen!.dir === 'top' && r.blockDir !== 'top') &&
        afterFrozen.length >= 1 && afterFrozen.some((r) => r.blockDir === 'top'), {
        expected: 'объявление top/3; скованные 3→2→1; blockDir ≠ top в скованных; после — top доступен',
        actual: `объявлений ${announces.length}; счёт ${ok3.join('→')}; скованных ${frozenRecs.length}; после-скованных ${afterFrozen.length}`,
      }),
    );
  }

  // ------------------------------------------------ 17. фаза «владыка»: пропуск → двойной
  {
    const guardian = buildBossEnemy(bossOf('stone_guardian'), 1, MINE_TABLE, []);
    guardian.hp = 100_000;
    guardian.maxHp = 100_000;
    const player = { hp: 100_000, maxHp: 100_000, atk: 1, def: 0, speed: 10 };
    const roll = scriptRoll({ 'mine:attack:stone_guardian': 0.0 });
    const out = resolveFight({ player, enemies: [guardian], gear: { ...SHIELD_GEAR, hasShield: false }, table: MINE_TABLE, roll });
    const enemyRounds = out.rounds.filter((r) => r.attacker === 'enemy');
    const skips = enemyRounds.filter((r) => r.skipped === true);
    const doubles = enemyRounds.filter((r) => r.double === true);
    const hits = enemyRounds.filter((r) => r.skipped !== true && r.double !== true);
    const base = 13; // atk владыки против def 0 (данные)
    results.push(
      check('фаза «владыка» G1: каждый 3-й ход — ПРОПУСК (счётчик фазы в логе честности, урона нет), следующий удар — ДВОЙНОЙ (×2 от формулы); обычные удары — одинарные', () =>
        enemyRounds.length >= 8 &&
        skips.length >= 2 &&
        skips.every((r) => r.damage === 0) &&
        doubles.length >= 2 &&
        doubles.every((r) => r.damage === base * 2) &&
        hits.length >= 2 &&
        hits.every((r) => r.damage === base) &&
        enemyRounds[2]!.skipped === true && enemyRounds[3]!.double === true, {
        expected: 'пропуски без урона; двойные = 26; обычные = 13; Р3 пропуск → Р4 двойной',
        actual: `раундов врага ${enemyRounds.length}; пропусков ${skips.length}; двойных ${doubles.length} (по ${doubles[0]?.damage ?? '—'}); обычных ${hits.length}`,
      }),
    );
  }

  // ------------------------------------------------ 18. фаза «змей»: вызов элитки + первый живой
  {
    const serpent = buildBossEnemy(bossOf('deep_serpent'), 1, MINE_TABLE, MINE_MOBS);
    const total = serpent.maxHp; // 154 на слое 1 (данные)
    const player = { hp: 100_000, maxHp: 100_000, atk: 90, def: 0, speed: 10 };
    const roll = scriptRoll({ 'mine:attack:deep_serpent': 1.0, 'mine:attack:spider#s1': 1.0, 'mine:attack:player': 0.5 });
    const out = resolveFight({ player, enemies: [serpent], gear: { ...SHIELD_GEAR, hasShield: false }, table: MINE_TABLE, roll });
    const summons = out.rounds.filter((r) => r.summon !== undefined);
    const summonKeys = new Set(out.enemies.map((e) => e.key));
    const dotRounds = out.rounds.filter((r) => r.dot !== undefined && r.enemyKey === 'spider#s1');
    results.push(
      check('фаза «змей» G1: при падении HP ниже 50% вызывает элитку M12.1 (ядовитый паук, HP слоя; ключ spider#s1) — призыв в логе раунда удара; стая-адресация [DECISION G11]: цель игрока — ПЕРВЫЙ живой (змей), после его смерти — призыв; DOT ядовитого сквозь ходы', () =>
        summons.length === 1 &&
        summons[0]!.summon!.key === 'spider#s1' && summons[0]!.summon!.elite === 'venomous' &&
        summons[0]!.enemyHp < total * 0.5 &&
        summonKeys.has('spider#s1') &&
        out.enemies[0]!.key === 'deep_serpent' && out.enemies[0]!.killed &&
        out.enemies[1]!.key === 'spider#s1' &&
        dotRounds.length >= 1 &&
        out.rounds.filter((r) => r.attacker === 'player' && r.enemyKey === 'deep_serpent').length >=
          out.rounds.filter((r) => r.attacker === 'player' && r.enemyKey === 'spider#s1').length, {
        expected: 'призыв ×1 при HP < 50%; ключ spider#s1; цель — первый живой; яд жив',
        actual: `призывов ${summons.length}; HP призыва ${summons[0] !== undefined ? summons[0]!.enemyHp : '—'}/${total}; врагов ${out.enemies.length}; ядовитых ходов ${dotRounds.length}`,
      }),
    );
  }

  // ------------------------------------------------ 19. босс = данные без кода (карточка §7)
  {
    const synthetic = buildBossEnemy(
      {
        id: 'test_boss',
        name: 'Тестовый босс',
        hpBase: 50,
        atk: 5,
        def: 0,
        speed: 1,
        attackDirs: [['top', 'mid']],
        tags: ['enemy:test_boss'],
        drops: [],
        boss: true,
        gold: [1, 2],
        aPlus: ['iron_sword'],
        freeze: { onTurn: 1, everyTurns: 2, turns: 1 },
        summon: { mobId: 'spider', elite: 'venomous', atHpBelow: 0.9, max: 1 },
      },
      1,
      MINE_TABLE,
      // мобы передаются обёрткой; движок + buildBossEnemy — без кода под нового босса
      [{ id: 'spider', name: 'Паук', hpBase: 30, atk: 6, def: 0, speed: 14, attackDirs: [['top', 'mid']], tags: ['mine'], gold: [2, 5], drops: [] }],
    );
    const player = { hp: 100_000, maxHp: 100_000, atk: 30, def: 0, speed: 10 };
    const roll = scriptRoll({ 'mine:boss:freeze:test_boss': 0.5, 'mine:attack:test_boss': 0.5, 'mine:attack:spider#s1': 0.5, 'mine:attack:player': 0.5 });
    const out = resolveFight({ player, enemies: [synthetic], gear: { ...SHIELD_GEAR, hasShield: false }, table: MINE_TABLE, roll });
    results.push(
      check('босс = данные без кода (карточка §7-тест, G8): синтетический 4-й босс (freeze + summon, те же три вида фаз) собирается buildBossEnemy и бьётся движком БЕЗ правки кода — фазы срабатывают, бой завершается исходом', () =>
        (out.result === 'win' || out.result === 'loss') &&
        out.rounds.some((r) => r.freeze !== undefined) &&
        out.rounds.some((r) => r.summon !== undefined), {
        expected: 'исход есть; freeze и summon сработали',
        actual: `${out.result}; раундов ${out.rounds.length}; freeze ${out.rounds.filter((r) => r.freeze !== undefined).length}; summon ${out.rounds.filter((r) => r.summon !== undefined).length}`,
      }),
    );
  }

  // ------------------------------------------------ 20. golden босс фикс-сид ×2 + живой roll.log
  {
    const f = await makeSeededMineGame('m122-golden');
    const pickIid = equipPickaxe(f, 'B');
    buffWin(f);
    const b1 = f.mine['mine.boss'](1, 12345) as R<BossView>;
    const l1 = lastRollOf(f, 'mine:boss:freeze:spider_queen');
    // между прогонами: стартовые условия идентичны (HP и прочность кирки —
    // живое состояние, износ различил бы строки витрины)
    (f.player['player.healHp'] as (n: number, r: string) => unknown)(100, 'selfcheck');
    (f.inv['inventory.dur'] as (iid: string, n: number) => R<unknown>)(pickIid, 100);
    const b2 = f.mine['mine.boss'](1, 12345) as R<BossView>;
    results.push(
      check('golden босс-фаза фикс-сид ×2 (карточка §7, G7): mine boss 1 --seed 12345 ×2 — витрины ПОСТРОЧНО идентичны (фазы королевы в логе), исход тот же; сид-ролл заморозки зеркалится в roll.log (стрим mine:boss:freeze:spider_queen жив)', () =>
        b1.ok && b2.ok &&
        JSON.stringify(b1.value.rounds) === JSON.stringify(b2.value.rounds) &&
        b1.value.outcome === b2.value.outcome &&
        l1 !== null, {
        expected: '×2 построчно идентичны; roll.log жив',
        actual: `${b1.ok && b2.ok ? (JSON.stringify(b1.value.rounds) === JSON.stringify(b2.value.rounds) ? '×2 идентичны' : 'РАЗЛИЧАЮТСЯ') : 'ошибка api'}; раундов ${b1.ok ? b1.value.rounds.length : 0}; freeze-ролл ${l1}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 21. босс-бой API: bossKilled + атомарный bossLoot
  {
    const f = await makeSeededMineGame('m122-bossloot');
    equipPickaxe(f, 'B');
    buffWin(f);
    const goldBefore = walletOf(f);
    const invBefore = (f.inv['inventory.list'] as () => Array<{ iid: string; defId: string; quality?: { tier: string }; qty: number }>)();
    const qtyOf = (defId: string) => invBefore.filter((i) => i.defId === defId).reduce((s, i) => s + i.qty, 0);
    const oreBefore = qtyOf('copper_ore');
    const trophyBefore = qtyOf('trophy_mine_1');
    const r = f.mine['mine.boss'](1, 777) as R<BossView>;
    const killed = eventsOf(f, 'mine.bossKilled');
    const lootTx = eventsOf(f, 'wallet.transaction').filter((e) => e.eventId === 'mine.bossLoot');
    const invAfter = (f.inv['inventory.list'] as () => Array<{ iid: string; defId: string; quality?: { tier: string }; qty: number }>)();
    const qtyAfter = (defId: string) => invAfter.filter((i) => i.defId === defId).reduce((s, i) => s + i.qty, 0);
    const aPlusEntry = invAfter.find((i) => i.defId === (killed[0]?.loot as { itemAPlus: string } | undefined)?.itemAPlus);
    const boss = bossOf('spider_queen');
    const st = mineStateOf(f);
    results.push(
      check('босс-бой API (G2/G5): победа над королевой → mine.bossKilled РОВНО ×1 {bossId, bossType: bossId, layer: 1, loot {gold ∈ [30,60], itemAPlus ∈ таблицы, ore copper_ore, trophy trophy_mine_1}}; атомарная транзакция mine.bossLoot (золото+руда+трофей — кошелёк/рюкзак до/после); A+-предмет ровно ×1 КАЧЕСТВА A; счётчики: fights +1, bossKills +1, kills/deaths целы; XP-канал — событие (не награда ачивки)', () =>
        r.ok && r.value.outcome.startsWith('ПОБЕДА') &&
        killed.length === 1 &&
        killed[0]!.bossId === 'spider_queen' && killed[0]!.bossType === 'spider_queen' && killed[0]!.layer === 1 &&
        (killed[0]!.loot as { gold: number }).gold >= boss.gold[0] && (killed[0]!.loot as { gold: number }).gold <= boss.gold[1] &&
        boss.aPlus.includes((killed[0]!.loot as { itemAPlus: string }).itemAPlus) &&
        (killed[0]!.loot as { ore: { defId: string } }).ore.defId === 'copper_ore' &&
        (killed[0]!.loot as { trophy: string }).trophy === 'trophy_mine_1' &&
        lootTx.length === 1 &&
        walletOf(f) === goldBefore + (killed[0]!.loot as { gold: number }).gold &&
        qtyAfter('copper_ore') === oreBefore + (killed[0]!.loot as { ore: { qty: number } }).ore.qty &&
        qtyAfter('trophy_mine_1') === trophyBefore + 1 &&
        aPlusEntry !== undefined && aPlusEntry.quality?.tier === 'A' &&
        st.fights === 1 && st.bossKills === 1 && st.kills === 0 && st.deaths === 0, {
        expected: 'bossKilled ×1 с раскладом; bossLoot ×1; A+ тир A; 1/1/0/0',
        actual: `killed ${killed.length}; tx ${lootTx.length}; A+ ${aPlusEntry?.defId ?? '—'} (${aPlusEntry?.quality?.tier ?? '—'}); статы ${st.fights}/${st.kills}/${st.bossKills}/${st.deaths}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 22. фазовый счётчик M01 + слои данных
  {
    const f = await makeSeededMineGame('m122-counter');
    equipPickaxe(f, 'B');
    buffWin(f);
    f.mine['mine.boss'](1, 5150) as R<BossView>; // королева — открывает слой 2 (ачивка)
    f.mine['mine.boss'](2, 31337) as R<BossView>; // владыка — счётчик stone_guardian
    const total = f.game.stats.get('mine.bosses.total');
    const stone = f.game.stats.get('mine.bosses.stone_guardian');
    const layer3 = MINE_LAYERS[2]!;
    results.push(
      check('фазовый счётчик M01 жив (payload bossType): победы над королевой и владыкой → счётчики mine.bosses.total = 2 и mine.bosses.stone_guardian = 1 (фильтр bossType — фаза 0, counters.ts НЕ правился); данные слоёв: 9 слоёв подряд, боссы циклом королева/владыка/змей, руда медь→олово→железо→серебро', () =>
        total === 2 && stone === 1 &&
        MINE_LAYERS.length === 9 &&
        MINE_LAYERS.every((l, i) => l.layer === i + 1) &&
        layer3.bossId === 'deep_serpent' && layer3.ore.defId === 'tin_ore' &&
        MINE_LAYERS[6]!.ore.defId === 'silver_ore', {
        expected: 'total 2; stone_guardian 1; 9 слоёв; цикл боссов; руда по слоям',
        actual: `total ${total}; stone ${stone}; слоёв ${MINE_LAYERS.length}; L3 ${layer3.bossId}/${layer3.ore.defId}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 31. [FIX-M12] граница вместимости
  // (тело — mine-lootcap-checks.ts, распил по wc-гигиене, прецедент b4af909)
  results.push(...(await runMineLootCapChecks()));

  return results;
}
