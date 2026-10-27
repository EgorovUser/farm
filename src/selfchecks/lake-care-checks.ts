/**
 * Self-checks M08 «Озеро» — часть 1b (экономика F8 + покупка Корма +
 * перекрёстный оракул выравнивания pen). Расщепление lake-checks по
 * 01 §6 (файл превысил 300 строк).
 */
import { LAKE_TABLE } from '@/content/balance/lake';
import { mutationBonusOf as penMutationBonusOf } from '@/game/modules/pen/logic/breeding';
import { mutationBonusOf, childTierOf } from '@/game/modules/lake/logic/breeding';
import type { QualityTier } from '@/shared/types/ids';
import { check, type CheckResult } from './types';
import { eventsOf, giveFish, lakeView, makeSeededLakeGame, type R } from './lake-fixture';

export async function runLakeCareChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 7. экономика: harvest → acquire lake → продажа 40%
  {
    const f = await makeSeededLakeGame('m081-economy');
    f.game.wallet.grant('gold', 100);
    const fish = giveFish(f, 'crucian', 'B'); // Карась 6з · common ×1 · B ×1.35
    f.lake['lake.release'](fish.ok ? fish.value : '');
    const harvested = f.lake['lake.harvest'](0) as R<{ fishId: string; quality: string }>;
    const acquired = eventsOf(f, 'item.acquired').filter((e) => e.source === 'lake');
    const gold0 = f.game.wallet.get('gold');
    const sell = f.inv['inventory.sell']('crucian', 1) as R<{ gold: number }>;
    results.push(
      check('экономика: lake.harvest → item.acquired источник lake (тир B переносится, слот свободен, статы harvested 1); продажа — штатный sell-канон: Карась B = round(6 × 1 × 1.35 × 0.4) = 3з (PriceBus, ставка 40%)', () =>
        harvested.ok && harvested.value.quality === 'B' &&
        acquired.length === 1 && acquired[0]!.defId === 'crucian' && (acquired[0]!.quality as { tier: string }).tier === 'B' &&
        lakeView(f).slots.used === 0 && lakeView(f).stats.harvested === 1 &&
        sell.ok && sell.value.gold === 3 && f.game.wallet.get('gold') - gold0 === 3, {
        expected: 'acquire lake B / sell 3з',
        actual: `harvest ${harvested.ok ? harvested.value.quality : harvested.error}; acquire ${acquired.length}; sell ${sell.ok ? sell.value.gold : sell.error}з`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 8. lake.buy feed: 3з из shop.currencyGoods
  {
    const f = await makeSeededLakeGame('m081-buy');
    f.game.wallet.grant('gold', 7);
    const buy = f.lake['lake.buy']('feed', 2) as R<{ qty: number; pricePerUnit: number }>;
    const tx = eventsOf(f, 'wallet.transaction').filter((e) => e.eventId === 'lake.buy');
    const goldAfter = f.game.wallet.get('gold');
    const poor = f.lake['lake.buy']('feed', 5) as R<unknown>;
    const wrong = f.lake['lake.buy']('worm', 1) as R<unknown>;
    results.push(
      check('lake.buy feed: Корм ×2 за 6з (3з/шт — единый источник shop.currencyGoods, прецедент «Симбиоза»; tx lake.buy, БЕЗ энергии); золота 7 → 1, Корм 2; нехватка золота — отказ; чужой товар — отказ «только Корм»', () =>
        buy.ok && buy.value.qty === 2 && buy.value.pricePerUnit === 3 &&
        f.game.wallet.get('feed') === 2 && tx.length === 1 && goldAfter === 1 &&
        !poor.ok && !wrong.ok && wrong.error.includes('только Корм'), {
        expected: '×2 за 6з / Корм 2 / золото 1 / отказы живы',
        actual: `${buy.ok ? `${buy.value.qty}×${buy.value.pricePerUnit}з` : buy.error}; Корм ${f.game.wallet.get('feed')}; золото ${goldAfter}; poor ${poor.ok}; wrong ${wrong.ok}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 9. выравнивание pen: окна совпадают (единая формула)
  {
    const probes = [0, 0.5, 0.889, 0.89, 0.9, 0.985, 0.99, 0.999, 1];
    const same = probes.every(
      (p) => mutationBonusOf(p, LAKE_TABLE.breeding.mutation) === penMutationBonusOf(p),
    );
    const corridor: Array<[QualityTier, number, QualityTier]> = [
      ['B', 0, 'C'], ['B', 1, 'B'], ['B', 2, 'A'], ['SS', 2, 'SS'], ['A', 2, 'S'], ['D', 2, 'C'],
    ];
    results.push(
      check('выравнивание pen [M08 · 89/10/1]: окна озера и загона СОВПАДАЮТ на сетке роллов (включая границы 0.889/0.89/0.985/0.99/0.999/1 — ЕДИНАЯ формула по букве M06 §4); кламп D..SS: B+2→A (ВЫШЕ родителя — решение №3), SS+2→SS (кап), A+2→S, D+2→C', () =>
        same && corridor.every(([p, b, e]) => childTierOf(p, b) === e), {
        expected: 'окна идентичны ×9 проб; коридор 6/6',
        actual: `окна ${String(same)}; коридор ${corridor.filter(([p, b, e]) => childTierOf(p, b) === e).length}/6`,
      }),
    );
  }

  return results;
}
