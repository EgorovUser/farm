/**
 * Self-checks M10.2 «Карточки уровней» (бриф §4.6, карточка §5/§7):
 * роллы×3 (бюджет 4×L, теги card:forge, target R4), auto-выбор/ручной
 * выбор/отказ (declineBonus R7), заморозка/восстановление, события
 * levelUp/cardChosen + паритет манифеста (R6), монте-карло полного цикла
 * L0..L50 (три инварианта §7), разложение шанса (гигиена §1.1), контент
 * карточных модов (реестр, данные). Хелперы — forge-fixture.
 */
import { check, group, type CheckGroup, type CheckResult } from './types';
import { FORGE_TABLE } from '@/content/balance/forging';
import { chanceBreakdownOf } from '@/game/modules/forge/outcome';
import { createForgeManifest } from '@/game/modules/forge/manifest';
import { MOD_TYPES } from '@/content/mods/registry';
import { MODFORGE_TABLE } from '@/content/balance/modforge';
import { mulberry32 } from '@/shared/utils/rng';
import { MemoryStorage } from '@/kernel/save/storage-drivers';
import { runForgeMonteCarlo } from './forge-mc-part';
import { runForgeCardsLiveChecks } from './forge-cards-live';
import {
  addXp,
  attempt,
  setupSharpenable,
  autoCards,
  backpack,
  buyForgeSetup,
  firstIid,
  force,
  forgeCard,
  giveItem,
  grantGold,
  makeForgeGame,
  makeSeededForgeGame,
  type R,
} from './forge-fixture';

export async function runForgeCardsChecks(): Promise<CheckGroup> {
  const results: CheckResult[] = [];
  const T = FORGE_TABLE;

  // ------------------------------------------- 1/2. карточные роллы: бюджет/теги/target/детерминизм
  const rolledEvents: Array<Record<string, unknown>> = [];
  const runCardLevel = async (saveId: string) => {
    const { f, iid } = await setupSharpenable(saveId);
    const evs: Array<Record<string, unknown>> = [];
    const off = f.game.bus.subscribe('modforge.rolled', (p) => evs.push(p as Record<string, unknown>));
    force(f, 'success');
    const a = attempt(f, iid); // L1: бюджет 4×1 = 4
    force(f, 'off');
    off();
    f.dispose();
    return { a, evs };
  };
  const c1 = await runCardLevel('m102-cards-a');
  const c2 = await runCardLevel('m102-cards-a'); // тот же saveId — детерминизм
  results.push(
    check('карточные роллы: levelUp → modforge.rollFor ×3 (бюджет 4×L, теги card:forge, target {item, iid})', () => {
      if (!c1.a.ok || c1.a.value.cards === null) return false;
      const cardEvents = c1.evs.filter((e) => e.source === 'modforge.rollFor');
      if (cardEvents.length !== 3) return false;
      return cardEvents.every((e) => {
        const target = e.target as { kind: string; refId: string } | null;
        return (
          e.budget === 4 &&
          JSON.stringify(e.scopeTags) === JSON.stringify(['card:forge']) &&
          target?.kind === 'item' &&
          target?.refId === (c1.a.ok ? c1.a.value.iid : '')
        );
      });
    }, { expected: '3 события, budget 4, card:forge, target = iid', actual: `${c1.evs.filter((e) => e.source === 'modforge.rollFor').length} событий` }),
  );
  results.push(
    check('детерминизм карточек: тот же saveId → те же роллы (стримы forge:card:seq)', () => {
      const a = c1.evs.filter((e) => e.source === 'modforge.rollFor').map((e) => JSON.stringify(e.rolls));
      const b = c2.evs.filter((e) => e.source === 'modforge.rollFor').map((e) => JSON.stringify(e.rolls));
      return a.length === 3 && JSON.stringify(a) === JSON.stringify(b);
    }),
  );
  results.push(
    check('auto-режим (§7): карточка выбрана и применена сразу (receipt: offered + chosen из скоупа card:forge)', () => {
      if (!c1.a.ok || c1.a.value.cards === null) return false;
      const chosen = c1.a.value.cards.chosen;
      if (chosen === null) return false;
      const cards = c1.a.value.cards;
      return (
        cards.offered === true &&
        cards.restored === false &&
        chosen.length > 0 &&
        chosen.every((r) => CARD_TYPE_IDS.has(r.type))
      );
    }),
  );
  // отдельная проба формы записей: из инвентаря (from/forgeLevel проставляет движок)
  {
    const { f, iid } = await setupSharpenable('m102-cards-form');
    force(f, 'success');
    const a = attempt(f, iid);
    force(f, 'off');
    const rec = backpack(f).find((i) => i.iid === iid);
    results.push(
      check('выбор: append в rolledMods (from forge, forgeLevel L); существующие моды не тронуты', () => {
        if (!a.ok || a.value.cards === null || a.value.cards.chosen === null || !rec) return false;
        const forgeMods = (rec.rolledMods ?? []).filter((m) => (m as { from?: string }).from === 'forge');
        return (
          forgeMods.length > 0 &&
          forgeMods.every((m) => (m as { forgeLevel?: number }).forgeLevel === 1) &&
          a.value.cards !== null &&
          JSON.stringify(forgeMods) === JSON.stringify(a.value.cards.chosen)
        );
      }),
    );
    f.dispose();
  }

  // ------------------------------------------- 3. initial не тронуты + quality не мутирован (П2)
  {
    // iron_pickaxe — предмет С modSlots (uncommon 16): стартовые роллы через
    // производственный шов rollItem → setRolls, затем карточный append поверх
    const f = await makeSeededForgeGame('m102-cards-initial');
    giveItem(f, 'iron_pickaxe', 'D', 0);
    const iid = firstIid(f, 'iron_pickaxe');
    addXp(f, 600);
    grantGold(f, 5000);
    f.inv['inventory.add']('iron_ingot', 'D', 0, 200, 'selfcheck.m10');
    buyForgeSetup(f);
    f.game.modules.get('craft')?.api['craft.buy']('anvil');
    const rollR = f.game.modules.get('modforge')?.api['modforge.rollItem']('iron_pickaxe', 'selfcheck:m102:init') as R<{ rolls: Array<{ type: string; value: number; from?: string }> }>;
    const setR = f.inv['inventory.setRolls'](iid, rollR?.ok ? rollR.value.rolls : []) as R<unknown>;
    const initialCount = rollR?.ok ? rollR.value.rolls.length : 0;
    force(f, 'success');
    const a = attempt(f, iid);
    force(f, 'off');
    const rec = backpack(f).find((i) => i.iid === iid);
    results.push(
      check('П2/канон M03: initial-роллы сохранены при карточном append; quality записи не мутирована (D/0)', () =>
        setR.ok && rollR !== undefined && rollR.ok && initialCount > 0 &&
        a.ok && a.value.cards?.chosen !== null &&
        rec !== undefined &&
        (rec.rolledMods ?? []).filter((m) => m.from === 'initial').length === initialCount &&
        (rec.rolledMods ?? []).filter((m) => m.from === 'forge').length === (a.value.cards?.chosen?.length ?? 0) &&
        rec.quality.tier === 'D' && rec.quality.value === 0),
    );
    f.dispose();
  }

  // ------------------------------------------- 4. отказ: declineBonus (R7) + одноразовость + F5
  {
    const storage = new MemoryStorage();
    const f = await makeSeededForgeGame('m102-decline', storage);
    giveItem(f, 'iron_sword', 'D', 0);
    const iid = firstIid(f, 'iron_sword');
    addXp(f, 600);
    grantGold(f, 5000);
    f.inv['inventory.add']('iron_ingot', 'D', 0, 200, 'selfcheck.m10');
    buyForgeSetup(f);
    f.game.modules.get('craft')?.api['craft.buy']('anvil');
    autoCards(f, 'off');
    force(f, 'success');
    const up = attempt(f, iid); // L1, предложение ждёт
    force(f, 'off');
    const before = f.forge['forge.stats'](iid) as R<{ breakdown: { decline: number; chance: number } }>;
    const dec = forgeCard(f, 'decline', iid);
    const after = f.forge['forge.stats'](iid) as R<{ breakdown: { decline: number; chance: number } }>;
    f.dispose(); // сохраняет (declineBonus в срезе)
    const f2 = makeForgeGame(storage);
    await f2.game.init();
    const iid2 = firstIid(f2, 'iron_sword');
    const restored = f2.forge['forge.stats'](iid2) as R<{ breakdown: { decline: number; chance: number } }>;
    // одноразовость: попытка потребляет бонус
    force(f2, 'fail');
    const consumed = attempt(f2, iid2);
    force(f2, 'off');
    const postConsume = f2.forge['forge.stats'](iid2) as R<{ breakdown: { decline: number } }>;
    results.push(
      check('отказ (R7): declineBonus +2% к следующей попытке; F5-раундтрип; одноразовость (попытка обнулила)', () =>
        up.ok && up.value.cards?.offered === true &&
        dec.ok && (dec.value as { declined?: boolean }).declined === true &&
        before.ok && before.value.breakdown.decline === 0 &&
        // [R7-оракул] буква брифа: +2% (0.02) — хардкод, не чтение данных
        after.ok && Math.abs(after.value.breakdown.decline - 0.02) < 1e-9 &&
        after.value.breakdown.chance > before.value.breakdown.chance &&
        restored.ok && Math.abs(restored.value.breakdown.decline - 0.02) < 1e-9 &&
        consumed.ok && consumed.value.breakdown.decline === T.cards.declineBonus &&
        postConsume.ok && postConsume.value.breakdown.decline === 0),
    );
    f2.dispose();
  }

  // живые пробы заморозки/edge/событий — forge-cards-live.ts (расщепление 01 §6)
  results.push(...(await runForgeCardsLiveChecks()));

  // монте-карло §7 — forge-mc-part.ts (расщепление 01 §6: файл > 300 строк)
  results.push(...runForgeMonteCarlo());

  // ------------------------------------------- 9. разложение шанса (гигиена §1.1)
  results.push(
    check('разложение §1.1: сумма компонентов = итогу (круг 105 + отказ 2пп: 0.30+0.05+0.05+0.02=0.42; клэмп 0.95)', () => {
      const a = chanceBreakdownOf(10, 1, T, 105, 0.02);
      const b = chanceBreakdownOf(0, 18, T, 100, 0.02); // 0.90+0.90+0+0.02 → кап
      const c = chanceBreakdownOf(10, 0, T, 100, 0); // без круга и отказа
      const near = (v: number, x: number) => Math.abs(v - x) < 1e-9;
      return (
        near(a.base + a.pity + a.circle + a.decline, 0.42) && near(a.chance, 0.42) && a.capped === false &&
        b.capped === true && near(b.chance, 0.95) &&
        near(c.base + c.pity + c.circle + c.decline, c.chance) && c.capped === false
      );
    }),
  );

  // ------------------------------------------- 10. контент карточных модов (данные, §5)
  results.push(
    check('контент §5: двуполярные карточные моды (дебафы возможны) + особые свойства со спец-тегами; negChance формы byRarity', () => {
      const byId = new Map(MOD_TYPES.map((m) => [m.id, m] as const));
      const might = byId.get('might_card');
      const guard = byId.get('guard_card');
      const prophetic = byId.get('prophetic_strike');
      const ore = byId.get('ore_sense');
      const vampiric = byId.get('vampiric');
      return (
        might !== undefined && might.maxNegative < 0 && might.scopeTags.includes('card:forge') &&
        guard !== undefined && guard.maxNegative < 0 &&
        prophetic !== undefined && prophetic.scopeTags.includes('special') && prophetic.maxPositive === 20 &&
        ore !== undefined && ore.scopeTags.includes('special') &&
        vampiric !== undefined && vampiric.scopeTags.includes('special') &&
        MOD_TYPES.filter((m) => m.scopeTags.includes('card:forge')).length === 5 &&
        MODFORGE_TABLE.byRarity.uncommon.negChance > 0
      );
    }),
  );

  // ------------------------------------------- 11. MISS-2 (закрыт M15.2): дебаф-карточка применяется
  // баг M10.2∩M03.2: дебаф-запись публиковалась БЕЗ forgeLevel → rolls-port
  // отвергал партию ЦЕЛИКОМ (карточка терялась при живом уровне). Фикс —
  // маркер в дебаф-записи (modforge/roll.ts). Детерминизм: охота сида брифа —
  // mulberry32(0) × uncommon-форма (negChance 0.1) × бюджет 4×L1 × card:forge
  // → дебаф might_card −0.9 + баф prophetic_strike +4.2 (обе записи forge L1)
  {
    const { f, iid } = await setupSharpenable('m102-miss2');
    const modforge = f.game.modules.get('modforge')?.api ?? {};
    const roll = modforge['modforge.rollFor']({
      budget: 4,
      scopeTags: ['card:forge'],
      rarity: 'uncommon',
      from: 'forge',
      forgeLevel: 1,
      rng: mulberry32(0),
    }) as R<{ rolls: Array<{ type: string; value: number; from: string; forgeLevel?: number }> }>;
    const debuff = roll.ok ? roll.value.rolls.find((r) => r.value < 0) : undefined;
    const apply = (roll.ok ? f.inv['inventory.setRolls'](iid, roll.value.rolls) : { ok: false, error: 'ролл недоступен' }) as R<unknown>;
    const rec = backpack(f).find((i) => i.iid === iid);
    results.push(
      check('MISS-2 (закрыт M15.2): дебаф-карточка применяется — дебаф-запись несёт forgeLevel, rolls-port принимает партию целиком (сид 0: might_card −0.9)', () =>
        roll.ok && debuff !== undefined && debuff.forgeLevel === 1 &&
        apply.ok && rec !== undefined &&
        (rec.rolledMods ?? []).some((m) => m.value < 0 && m.forgeLevel === 1 && m.from === 'forge'),
        { expected: 'дебаф c forgeLevel применён в rolledMods', actual: roll.ok ? JSON.stringify(roll.value.rolls) : roll.error }),
    );
    f.dispose();
  }

  void rolledEvents;
  return group('M10 · Карточки уровней (§5)', results);
}

/** id карточных модов реестра (скоуп card:forge) */
const CARD_TYPE_IDS = new Set(['might_card', 'guard_card', 'prophetic_strike', 'ore_sense', 'vampiric']);
