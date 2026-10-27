/**
 * Self-checks M02 «Инвентарь», часть 2 (сеанс M02.2, бриф §2.8): группа
 * «M02 · Экипировка, провайдер и гейты». Слоты из данных, equip/unequip (D21/D30),
 * событие item.equipped, гейты требований (карточка §3), equipmentProvider
 * (карточка §5, D22/D31, оракулы руками: base + flat; base × (1 + inc/100)),
 * инварианты D30, сейв-раундтрип с экипировкой.
 */
import { ManualClock } from '@/kernel/di/clock';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { createGame, type Game } from '@/game/bootstrap';
import { INVENTORY_TABLE } from '@/content/balance/inventory';
import { MOD_TYPES } from '@/content/mods/registry';
import type { ItemInstance } from '@/game/modules/inventory/state';
import type { InventoryInfo } from '@/game/modules/inventory/store';
import { check, group, type CheckGroup, type CheckResult } from './types';
import { runInventoryEquipSaveChecks } from './inventory-equip-save-checks';

const T0 = new Date(2024, 0, 1, 12, 0, 0, 0).getTime();

interface EquipFixture {
  game: Game;
  api: Record<string, (...args: unknown[]) => unknown>;
  dispose(): void;
}

function makeEquipGame(storage: MemoryStorage = new MemoryStorage()): EquipFixture {
  const game = createGame(new ManualClock(T0), storage);
  const api = game.modules.get('inventory')?.api ?? {};
  return { game, api, dispose: () => game.dispose() };
}

type R<T> = { ok: true; value: T } | { ok: false; error: string };

function addQ(api: EquipFixture['api'], defId: string, tier: string, value: number, qty: number): R<{ entries: number }> {
  return api['inventory.add'](defId, tier, value, qty, 'selfcheck') as R<{ entries: number }>;
}

function equip(api: EquipFixture['api'], iid: string, slot: string): R<{ defId: string; iid: string; slot: string }> {
  return api['inventory.equip'](iid, slot) as R<{ defId: string; iid: string; slot: string }>;
}

function unequip(api: EquipFixture['api'], slot: string): R<{ defId: string; iid: string; slot: string }> {
  return api['inventory.unequip'](slot) as R<{ defId: string; iid: string; slot: string }>;
}

function list(api: EquipFixture['api']): ItemInstance[] {
  return api['inventory.list']() as ItemInstance[];
}

function info(api: EquipFixture['api']): InventoryInfo {
  return api['inventory.info']() as InventoryInfo;
}

function equippedView(api: EquipFixture['api']): Array<{ slot: string; slotName: string; entry: ItemInstance }> {
  return api['inventory.equipped']() as Array<{ slot: string; slotName: string; entry: ItemInstance }>;
}

function resolveAttack(f: EquipFixture): number {
  return f.game.statBus.resolve({ stat: 'combat.attack', ctx: f.game.time.ctx('player') });
}

/** поднять уровень до 5 (гейт меча): 115+132+152+175 = 574 XP суммарно */
function levelTo5(f: EquipFixture): void {
  f.game.modules.call('player', 'player.addXp', 600, 'selfcheck');
}

export async function runInventoryEquipChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];

  // --- 1. контент: слоты из данных, реестр модов указывает на существующие базы
  const f1 = makeEquipGame();
  const slotIds = INVENTORY_TABLE.equipmentSlots.map((s) => s.id);
  results.push(
    check('слоты экипировки из данных: 8 строк карточки §2, id уникальны', () =>
      INVENTORY_TABLE.equipmentSlots.length === 8 && new Set(slotIds).size === 8),
  );
  const bases = new Set(f1.game.statBus.listStats());
  results.push(
    check('реестр ModTypeDef: все stat указывают на существующие базы (бриф §2.6)', () =>
      MOD_TYPES.length >= 2 && MOD_TYPES.every((m) => bases.has(m.stat))),
  );

  // --- 2. гейты требований (карточка §3): отказ до уровня с причиной, успех после
  const g1 = addQ(f1.api, 'iron_sword', 'D', 50, 1);
  const swordIid = g1.ok ? list(f1.api)[0].iid : '';
  const gateRefuse = equip(f1.api, swordIid, 'weapon');
  results.push(
    check('гейт: экип меча на ур. 1 — отказ с причиной «требуется уровень 5»', () =>
      !gateRefuse.ok && gateRefuse.error.includes('требуется уровень 5')),
  );
  levelTo5(f1);
  const gatePass = equip(f1.api, swordIid, 'weapon');
  results.push(
    check('гейт: после большого XP (600 → ур. 5) экип проходит', () => gatePass.ok),
  );

  // --- 3. слоты: несоответствие типа, неизвестный слот/iid, занятый слот.
  // Порядок проверок equip: занятость/экипированность раньше типа — пробы
  // несоответствия идут по ПУСТЫМ слотам и НЕэкипированным записям
  const pick = addQ(f1.api, 'iron_pickaxe', 'C', 40, 1);
  const pickIid = pick.ok ? list(f1.api).find((it) => it.defId === 'iron_pickaxe')?.iid ?? '' : '';
  const wrongSlot = equip(f1.api, pickIid, 'armor');
  results.push(
    check('несоответствие типа: кирка в слот «Броня» — отказ с причиной', () =>
      !wrongSlot.ok && wrongSlot.error.includes('не подходит в слот')),
  );
  const otherSword = addQ(f1.api, 'iron_sword', 'C', 60, 1);
  const otherIid = otherSword.ok ? list(f1.api).find((it) => it.defId === 'iron_sword')?.iid ?? '' : '';
  const swordInPickaxe = equip(f1.api, otherIid, 'pickaxe');
  results.push(
    check('меч в слот «Кирка» — отказ с причиной + подсказка subType (проба брифа §2.2)', () =>
      !swordInPickaxe.ok &&
      swordInPickaxe.error.includes('не подходит в слот') &&
      swordInPickaxe.error.includes('subType: pickaxe')),
  );
  const unknownSlot = equip(f1.api, pickIid, 'gauntlet');
  results.push(
    check('неизвестный слот — отказ с перечнем доступных', () =>
      !unknownSlot.ok && unknownSlot.error.includes('доступны:')),
  );
  const unknownIid = equip(f1.api, 'iron_sword#999', 'weapon');
  results.push(
    check('неизвестный iid — отказ «не найден в инвентаре»', () =>
      !unknownIid.ok && unknownIid.error.includes('не найден')),
  );
  const occupied = equip(f1.api, otherIid, 'weapon');
  results.push(
    check('занятый слот — отказ «занят … сначала снимите» (авто-подмены нет, D30)', () =>
      !occupied.ok && occupied.error.includes('занят') && occupied.error.includes('сначала снимите')),
  );
  const reEquip = equip(f1.api, swordIid, 'weapon');
  results.push(
    check('повторный экип той же записи — отказ «уже экипирована»', () =>
      !reEquip.ok && reEquip.error.includes('уже экипирована')),
  );

  // --- 4. Аксессуар ×2 + экипировка стака наживки целиком (D30)
  const a1 = addQ(f1.api, 'lucky_charm', 'D', 10, 1);
  const a2 = addQ(f1.api, 'lucky_charm', 'D', 20, 1);
  const charms = list(f1.api).filter((it) => it.defId === 'lucky_charm');
  const acc1 = a1.ok && charms[0] ? equip(f1.api, charms[0].iid, 'accessory') : { ok: false, error: 'x' };
  const acc2 = a2.ok && charms[1] ? equip(f1.api, charms[1].iid, 'accessory2') : { ok: false, error: 'x' };
  results.push(
    check('Аксессуар ×2: два разных сокровища экипированы одновременно', () => {
      if (!acc1.ok || !acc2.ok) return false;
      const slots = equippedView(f1.api).map((e) => e.slot);
      return slots.includes('accessory') && slots.includes('accessory2');
    }),
  );
  const baitAdd = addQ(f1.api, 'worm_bait', 'B', 30, 30);
  const baitIid = baitAdd.ok ? list(f1.api).find((it) => it.defId === 'worm_bait')?.iid ?? '' : '';
  const baitEquip = equip(f1.api, baitIid, 'bait');
  results.push(
    check('экипировка записи ЦЕЛИКОМ: стак наживки ×30 ушёл в слот одной записью', () => {
      if (!baitEquip.ok) return false;
      const inSlot = equippedView(f1.api).find((e) => e.slot === 'bait');
      return inSlot !== undefined && inSlot.entry.qty === 30;
    }),
  );

  // --- 5. событие item.equipped: ровно одно, payload; unequip — без события + invalidate.stat
  let equippedEvents = 0;
  let captured: Record<string, unknown> | null = null;
  const offEq = f1.game.bus.subscribe('item.equipped', (p) => {
    equippedEvents++;
    captured = p as Record<string, unknown>;
  });
  const armor = addQ(f1.api, 'leather_armor', 'B', 44, 1);
  const armorIid = armor.ok ? list(f1.api).find((it) => it.defId === 'leather_armor')?.iid ?? '' : '';
  equip(f1.api, armorIid, 'armor');
  offEq();
  results.push(
    check('событие item.equipped: ровно одно с payload { defId, iid, slot, quality }', () => {
      if (equippedEvents !== 1 || !captured) return false;
      const q = captured.quality as { tier?: unknown } | undefined;
      return (
        captured.defId === 'leather_armor' &&
        captured.iid === armorIid &&
        captured.slot === 'armor' &&
        q?.tier === 'B'
      );
    }),
  );
  let itemEventsOnUnequip = 0;
  const offU1 = f1.game.bus.subscribe('item.equipped', () => itemEventsOnUnequip++);
  const offU2 = f1.game.bus.subscribe('item.consumed', () => itemEventsOnUnequip++);
  const offU3 = f1.game.bus.subscribe('item.acquired', () => itemEventsOnUnequip++);
  const offU4 = f1.game.bus.subscribe('item.sold', () => itemEventsOnUnequip++);
  let invalidations = 0;
  const offInv = f1.game.bus.subscribe('invalidate.stat', () => invalidations++);
  const un1 = unequip(f1.api, 'armor');
  offU1();
  offU2();
  offU3();
  offU4();
  offInv();
  results.push(
    check('unequip: БЕЗ события (лента item.* пуста) + invalidate.stat опубликован (D21)', () =>
      un1.ok && itemEventsOnUnequip === 0 && invalidations >= 1),
  );

  // --- 6. провайдер (карточка §5, D31/D22) — оракулы руками
  const f2 = makeEquipGame();
  levelTo5(f2);
  const before = resolveAttack(f2); // база 5 (кулаки)
  const sw = addQ(f2.api, 'iron_sword', 'D', 50, 1);
  const swIid = sw.ok ? list(f2.api)[0].iid : '';
  equip(f2.api, swIid, 'weapon');
  const withSword = resolveAttack(f2); // 5 + flat 12 = 17
  results.push(
    check('провайдер baseStats → flat: resolve combat.attack = базе 5 + 12 = 17', () =>
      before === 5 && withSword === 17),
  );
  const stamp = f2.api['inventory.mod'](swIid, 'atk_power', 25) as R<{ type: string; value: number }>;
  const withRoll = resolveAttack(f2); // 17 × (1 + 25/100) = 21.25 → round 21
  results.push(
    check('провайдер rolledMods → inc (D31): 17 × 1.25 = 21.25 → 21', () =>
      stamp.ok && withRoll === 21),
  );
  const dur0 = f2.api['inventory.dur'](swIid, 0) as R<{ current: number; max: number }>;
  const broken = resolveAttack(f2); // сломан → модов нет → база 5
  results.push(
    check('сломан-гейт D22: dur 0 → предмет в слоте, модов НЕТ, resolve = базе 5', () =>
      dur0.ok && broken === 5),
  );
  const stampRange = f2.api['inventory.mod'](swIid, 'atk_power', 99) as R<unknown>;
  results.push(
    check('dev-штамп mod: значение вне границ ModTypeDef — отказ', () => !stampRange.ok),
  );
  const back = unequip(f2.api, 'weapon');
  results.push(
    check('снятие возвращает моды к базе: unequip → resolve = 5 (интеграционный карточки §7)', () =>
      back.ok && resolveAttack(f2) === 5),
  );

  // --- 7. инварианты D30: невидимость, вместимость, защита изъятия, возврат сверх capacity
  const f3 = makeEquipGame();
  levelTo5(f3);
  addQ(f3.api, 'iron_sword', 'D', 50, 2); // две записи меча
  const swords = list(f3.api).filter((it) => it.defId === 'iron_sword');
  const usedBefore = info(f3.api).used;
  const e3 = equip(f3.api, swords[0].iid, 'weapon');
  results.push(
    check('экипированный НЕ виден в inv list (D30)', () =>
      e3.ok && !list(f3.api).some((it) => it.iid === swords[0].iid) && list(f3.api).some((it) => it.iid === swords[1].iid)),
  );
  results.push(
    check('экипированный НЕ занимает вместимость: used до/после экипа одинаковы', () =>
      usedBefore === 2 && info(f3.api).used === 1),
  );
  const rmBoth = f3.api['inventory.remove']('iron_sword', 2, 'selfcheck') as R<unknown>;
  results.push(
    check('изъятие экипированного — отказ «сначала снимите» (транзакционно, без потерь)', () =>
      !rmBoth.ok && rmBoth.error.includes('сначала снимите')),
  );
  const rmOne = f3.api['inventory.remove']('iron_sword', 1, 'selfcheck') as R<unknown>;
  results.push(
    check('изъятие в пределах рюкзака: снята НЕэкипированная запись, экипированная цела', () => {
      if (!rmOne.ok) return false;
      const view = equippedView(f3.api);
      return view.length === 1 && view[0].entry.iid === swords[0].iid && list(f3.api).length === 0;
    }),
  );
  // полный рюкзак: 20 оберегов (по записи) + вернуть меч → 21/20 (легально по D28)
  for (let i = 0; i < 20; i++) addQ(f3.api, 'lucky_charm', 'D', 10 + i, 1);
  const full = info(f3.api);
  const un3 = unequip(f3.api, 'weapon');
  results.push(
    check('unequip при полном рюкзаке: запись возвращается СВЕРХ capacity (D28)', () =>
      full.used === 20 && full.capacity === 20 && un3.ok && info(f3.api).used === 21),
  );

  // --- сейв-подгруппа: раундтрип с экипировкой + идемпотентность (§2.7)
  results.push(...(await runInventoryEquipSaveChecks()));

  f1.dispose();
  f2.dispose();
  f3.dispose();

  return group('M02 · Экипировка, провайдер и гейты (часть 2)', results);
}
