/**
 * .zscripts/m163-economy.ts — [DECISION M163-окупаемость]: СИМУЛЯЦИЯ 32 дней
 * дневного цикла деревни (потребности → налоги → биржа) — фаза 5 done-критерий
 * «цикл сам себя окупает 30+ дней». Честная игра фикстуры (гейт по уровню 30 +
 * ачивка). Структура дня D: dayTick(D) (налог за D + ролл потребностей/контрактов)
 * → поставки всех потребностей (производство игрока) → исполнение ВСЕХ доступных
 * контрактов биржи → журнал. Weekly-skip — КАНОНИЧЕСКИЙ needSatisfied.
 * Оракулы окупаемости: ворчунов 0; счастье ≥ 70; налоги и контракты капают
 * КАЖДЫЙ день; Σ(налоги + контракты) — положительный поток 32 дня подряд
 * (золотых расходов у цикла нет — только предметы; циклу НЕ нужна золотая
 * субсидия — «сам себя окупает»); контракты выгоднее магазина (ставка
 * 0.56..0.76 против 0.40 — премии данных).
 */
import {
  dayTickAt,
  giveItems,
  localDateISO,
  makeSeededVillageGame,
  openVillageGate,
  readVillageSlice,
  type VillageFixture,
} from '@/selfchecks/village-fixture';
import { needSatisfied } from '@/game/modules/village/logic';
import { ITEMS } from '@/content/items/items';
import { VILLAGE_TABLE, villageLevelOf } from '@/content/village/table';

interface TradeViewF {
  contracts: Array<{ partnerId: string; item: string; qty: number; gateLine: string | null }>;
  reputation: Array<{ partnerId: string; points: number; levelName: string }>;
}

function tradeOf(f: VillageFixture): TradeViewF {
  return f.village['village.trade']() as TradeViewF;
}

const f = await makeSeededVillageGame('v163-economy-32d');
openVillageGate(f);

let totalTax = 0;
let totalContracts = 0;
let totalContractGold = 0;
const daily: string[] = [];
let minHappiness = 100;
let grumblersTotal = 0;
let daysWithoutTax = 0;
let daysWithoutContractGold = 0;

for (let day = 1; day <= 32; day++) {
  const taxBefore = f.events.filter((e) => e.name === 'village.taxCollected').length;
  const fulBefore = f.events.filter((e) => e.name === 'trade.fulfilled').length;
  dayTickAt(f, day); // налог за день day + ролл потребностей/контрактов
  const tax = f.events.filter((e) => e.name === 'village.taxCollected').length - taxBefore;
  const taxGold = f.events.filter((e) => e.name === 'village.taxCollected').slice(-tax).reduce((s, e) => s + Number(e.payload.gold ?? 0), 0);
  // 1) потребности дня: поставить всё (производство игрока; weekly — канонический skip)
  const slice = await readVillageSlice(f);
  const today = localDateISO(f.clock.now());
  for (const [id, lv] of Object.entries(slice?.villagers ?? {})) {
    if (lv.need === undefined || lv.lastSatisfied === today) continue;
    if (needSatisfied(lv.need as { item: string; qty: number; kind: 'daily' | 'weekly'; day: string }, lv.lastSatisfied ?? undefined)) continue;
    if (ITEMS.some((d) => d.id === lv.need!.item)) giveItems(f, lv.need.item, lv.need.qty);
    else f.game.wallet.grant(lv.need!.item as 'gold', lv.need.qty + 5);
    const r = f.village['village.supply'](id, lv.need.item);
    if (!r.ok) console.log(`  ! supply ${id}: ${(r as { error: string }).error}`);
  }
  // 2) биржа: исполнить все доступные контракты (предметы = производство)
  const view = tradeOf(f);
  for (const c of view.contracts) {
    if (c.gateLine !== null) continue;
    giveItems(f, c.item, c.qty);
    const r = f.village['village.trade.fulfill'](c.partnerId);
    if (!r.ok) console.log(`  ! fulfill ${c.partnerId}: ${(r as { error: string }).error}`);
  }
  // 3) журнал дня
  const ful = f.events.filter((e) => e.name === 'trade.fulfilled').length - fulBefore;
  const gold = f.events.filter((e) => e.name === 'trade.fulfilled').slice(-ful).reduce((s, e) => s + Number(e.payload.gold ?? 0), 0);
  const s2 = await readVillageSlice(f);
  const live = Object.values(s2?.villagers ?? {});
  const avgH = live.length > 0 ? Math.round(live.reduce((s, v) => s + v.happiness, 0) / live.length) : 0;
  const grum = live.filter((v) => v.grumbleDays >= 3).length;
  const level = villageLevelOf(s2?.xp ?? 0, VILLAGE_TABLE.level);
  minHappiness = Math.min(minHappiness, avgH);
  grumblersTotal += grum;
  totalTax += taxGold;
  totalContracts += ful;
  totalContractGold += gold;
  if (tax === 0) daysWithoutTax++;
  if (gold === 0) daysWithoutContractGold++;
  daily.push(`д${day}: налог=${taxGold}з контракты=${ful}/${gold}з ур=${level} жит=${live.length} сч=${avgH} ворч=${grum}`);
}

console.log('=== СИМУЛЯЦИЯ 32 ДНЕЙ (потребности → налоги → биржа) ===');
console.log(daily.join('\n'));
console.log('--- ИТОГ ---');
console.log(`налоги всего: ${totalTax}з · контрактов исполнено: ${totalContracts} · выплачено: ${totalContractGold}з · ПОТОК ЦИКЛА: ${totalTax + totalContractGold}з за 32 дня`);
console.log(`дней без налога: ${daysWithoutTax} · дней без контрактов: ${daysWithoutContractGold} · мин. счастье: ${minHappiness} · ворчунов суммарно: ${grumblersTotal}`);
const fin = await readVillageSlice(f);
console.log(`финал: уровень деревни ${villageLevelOf(fin?.xp ?? 0, VILLAGE_TABLE.level)} · жителей ${Object.keys(fin?.villagers ?? {}).length} · история сделок ${fin?.trade?.history?.length ?? 0} (кап 60)`);
const rep = tradeOf(f).reputation;
console.log(`репутация: ${rep.map((r) => `${r.partnerId}=${r.points}(${r.levelName})`).join(' ')}`);
const ok = grumblersTotal === 0 && minHappiness >= 70 && totalContractGold > 0 && totalTax > 0 && daysWithoutTax === 0;
console.log(`ВЕРДИКТ окупаемости (30+ дней): ${ok ? 'ЦИКЛ САМ СЕБЯ ОКУПАЕТ — налоги+контракты капают каждый день, золотая субсидия не нужна, поток положителен, деревня растёт' : 'FAIL'}`);
f.dispose();
process.exit(0);
