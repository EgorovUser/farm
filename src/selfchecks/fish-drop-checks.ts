/**
 * Self-checks M07 «Рыбалка» — часть 2: роллы/удача/капы/гейты/приманки.
 *
 * Покрытие (бриф §3.7): lucky-веса по канону 02 §6 (×(1+luck/100) только к
 * lucky; luck −100 обнуляет — никаких отрицательных весов/NaN); монте-карло
 * luck (удочка +40% — редкая категория тяжелее); гейт-рыба 10 000 роллов —
 * ноль; Легендарная приманка — гарант rare+ живой серией; Икра — редкие
 * тяжелее + клёв медленнее; Мотыль — события тяжелее; кап maxFishRarity
 * Бамбуковой — веса epic+ = 0 через шину; сундук/событие/мусор — сценарный
 * РНГ buildCastPlan.
 */
import { DROP_CATEGORIES, POND_FISH, TRASH_ITEMS, CHEST_TABLE, FISHING_EVENTS } from '@/content/fishing/fish';
import { FISHING_TABLE } from '@/content/balance/fishing';
import {
  applyBiteSpeed,
  buildCastPlan,
  categoryWeights,
  pickRarity,
  rarityWeights,
} from '@/game/modules/fishing/logic/rolls';
import { check, type CheckResult } from './types';
import { buyAndEquip, equippedOf, makeSeededFishGame, makeScriptRng, type FishFixture, type R } from './fish-fixture';
import { runFishLuckChecks } from './fish-luck-checks';
import type { FishCtxInfo } from '@/game/modules/fishing/logic/rolls';

const noCtxInfo: FishCtxInfo = { baitDefId: null, rodTier: 0, playerLevel: 1, hasAchievement: () => false };

/** фикс-игра с ФИКС-saveId (детерминизм ривен-роллов удочек между прогонами);
 *  донор с пустыми срезами → кошелёк 0 — грант на покупки снасти */
async function makeFishGameSeedHelper(): Promise<FishFixture> {
  const f = await makeSeededFishGame('m071-drop');
  f.game.wallet.grant('gold', 10_000);
  return f;
}

export async function runFishDropChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const luckChecks = await runFishLuckChecks();

  // ------------------------------------------------ 4. Икра: +25% редкость / −10% клёв
  {
    // точный оракул БЕЗ удочки (нет ривен-inc — только flat-моды наживки):
    // luck = 25 ровно, biteSpeed = −10 ровно
    const f = await makeFishGameSeedHelper();
    await buyAndEquip(f, 'caviar_bait', 'bait');
    const luck = f.game.statBus.resolve({ stat: 'fishing.luck.rare', ctx: f.game.time.ctx('player') });
    const speed = f.game.statBus.resolve({ stat: 'fishing.bite.speed', ctx: f.game.time.ctx('player') });
    const w = rarityWeights(f.game.statBus, f.game.time.ctx('player'));
    const bite = applyBiteSpeed(FISHING_TABLE, 5, speed);
    // качественное усиление: с удочкой (flat 5 + ривен-inc) веса rare+ только тяжелее
    await buyAndEquip(f, 'walnut_rod', 'rod');
    const wRod = rarityWeights(f.game.statBus, f.game.time.ctx('player'));
    results.push(
      check('Икра: baitProvider flat +25 → luck 25 / bite.speed −10 (без удочки — точный оракул); веса rare 12.5 / epic 5 / legendary 1.125; клёв 5с → 5.5с; с удочкой rare+ тяжелее', () =>
        luck === 25 && speed === -10 &&
        w.find((e) => e.rarity === 'rare')!.weight === 12.5 &&
        w.find((e) => e.rarity === 'epic')!.weight === 5 &&
        w.find((e) => e.rarity === 'legendary')!.weight === 1.125 &&
        bite === 5.5 &&
        wRod.find((e) => e.rarity === 'rare')!.weight > 12.5, {
        expected: 'luck 25; веса 12.5/5/1.125; клёв 5.5; с удочкой тяжелее',
        actual: `luck ${luck}; speed ${speed}; rare ${w.find((e) => e.rarity === 'rare')!.weight} (с удочкой ${wRod.find((e) => e.rarity === 'rare')!.weight.toFixed(2)}); клёв 5 → ${bite}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 5. Мотыль: события тяжелее
  {
    const f = await makeFishGameSeedHelper();
    await buyAndEquip(f, 'bamboo_rod', 'rod');
    await buyAndEquip(f, 'moth_bait', 'bait');
    const ctx = f.game.time.ctx('player');
    const w = categoryWeights(DROP_CATEGORIES, f.game.statBus, ctx);
    results.push(
      check('Светящийся мотыль: fishing.luck.event +50 → вес категории «событие» 3 → 4.5', () =>
        w.find((e) => e.def.id === 'event')!.weight === 4.5, {
        expected: 'event 4.5',
        actual: `event ${w.find((e) => e.def.id === 'event')!.weight}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 6. кап maxFishRarity Бамбуковой
  {
    const f = await makeFishGameSeedHelper();
    await buyAndEquip(f, 'bamboo_rod', 'rod');
    const ctx = f.game.time.ctx('player');
    const w = rarityWeights(f.game.statBus, ctx);
    results.push(
      check('кап maxFishRarity Бамбуковой (rare): flat-минусы baseStats → веса epic/legendary/mythic = 0 через шину (НЕ if-ом); common/uncommon без изменений', () =>
        w.find((e) => e.rarity === 'common')!.weight === 60 &&
        w.find((e) => e.rarity === 'uncommon')!.weight === 25 &&
        w.find((e) => e.rarity === 'rare')!.weight > 0 &&
        w.find((e) => e.rarity === 'epic')!.weight === 0 &&
        w.find((e) => e.rarity === 'legendary')!.weight === 0 &&
        w.find((e) => e.rarity === 'mythic')!.weight === 0, {
        expected: '60/25/rare>0/0/0/0',
        actual: w.map((e) => `${e.rarity}:${Number(e.weight.toFixed(2))}`).join(' '),
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 7. Легендарная приманка: гарант rare+
  {
    const f = await makeFishGameSeedHelper();
    await buyAndEquip(f, 'walnut_rod', 'rod');
    await buyAndEquip(f, 'legendary_bait', 'bait');
    const ctx = f.game.time.ctx('player');
    const w = rarityWeights(f.game.statBus, ctx);
    // живая серия: 8 забросов — все редкости rare+ (после исчерпания стека
    // покупаем и надеваем новую наживку — расход ровно 1 за заброс)
    let allRarePlus = true;
    let casts = 0;
    for (let i = 0; i < 8; i++) {
      const buy = f.fish['fish.buy']('legendary_bait', 1) as R<{ iid: string }>;
      if (!buy.ok) {
        allRarePlus = false;
        break;
      }
      if (equippedOf(f, 'bait') === null) {
        const eq = f.inv['inventory.equip'](buy.value.iid, 'bait') as R<unknown>;
        if (!eq.ok) {
          allRarePlus = false;
          break;
        }
      }
      const c = f.fish['fish.cast']() as R<{ rarity: string | null }>;
      if (!c.ok) {
        allRarePlus = false;
        break;
      }
      casts += 1;
      if (c.value.rarity !== null && !['rare', 'epic', 'legendary', 'mythic'].includes(c.value.rarity)) {
        allRarePlus = false;
      }
    }
    results.push(
      check('Легендарная приманка: гарант rare+ (моды −60/−25 → веса common/uncommon = 0, rare+ без изменений); живая серия 8 забросов — все rare+', () =>
        w.find((e) => e.rarity === 'common')!.weight === 0 &&
        w.find((e) => e.rarity === 'uncommon')!.weight === 0 &&
        w.find((e) => e.rarity === 'rare')!.weight >= 10 &&
        allRarePlus && casts === 8, {
        expected: 'веса 0/0/rare+≥10; серия 8/8 rare+',
        actual: `${w.map((e) => `${e.rarity}:${Number(e.weight.toFixed(2))}`).join(' ')}; серия ${casts}/8 allRarePlus=${String(allRarePlus)}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 8. сундук/событие/мусор: сценарный РНГ
  {
    const f = await makeFishGameSeedHelper();
    const ctx = f.game.time.ctx('player');
    // накопление: trash 25 | small 65 | medium 85 | rare 93 | treasure 97 | event 100
    const mkPlan = (script: number[]) =>
      buildCastPlan({
        rngBus: makeScriptRng(script) as never,
        statBus: f.game.statBus,
        ctx,
        table: FISHING_TABLE,
        categories: DROP_CATEGORIES,
        fish: POND_FISH,
        trash: TRASH_ITEMS,
        chest: CHEST_TABLE,
        events: FISHING_EVENTS,
        location: 'pond',
        ctxInfo: noCtxInfo,
      });
    const treasure = mkPlan([0.965]); // → сокровище
    const event = mkPlan([0.985]); // → событие
    const trash = mkPlan([0.1]); // → мусор
    results.push(
      check('сценарный РНГ buildCastPlan: сокровище → сундук-запись с qty в диапазоне; событие → мини-данные; мусор → предмет-мусор', () =>
        treasure.category === 'treasure' && treasure.chest !== null &&
        treasure.chestQty !== null && treasure.chestQty >= treasure.chest.qty[0] && treasure.chestQty <= treasure.chest.qty[1] &&
        event.category === 'event' && event.event !== null && event.event.text.length > 0 &&
        trash.category === 'trash' && trash.trash !== null && TRASH_ITEMS.some((t) => t.id === trash.trash!.id), {
        expected: 'treasure+qty∈[3,6]/event+text/trash-предмет',
        actual: `${treasure.category} ${treasure.chest?.defId}×${treasure.chestQty}; ${event.category} ${event.event?.id}; ${trash.category} ${trash.trash?.id}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 9. pickRarity: гарант при нулевых весах
  {
    results.push(
      check('pickRarity: все веса нули → rare ([DECISION] гарант приманки побеждает кап удочки)', () =>
        pickRarity(
          [
            { rarity: 'common', weight: 0 },
            { rarity: 'uncommon', weight: 0 },
            { rarity: 'rare', weight: 0 },
            { rarity: 'epic', weight: 0 },
          ],
          0.42,
        ) === 'rare'),
    );
  }

  return [...luckChecks, ...results];
}

