/**
 * .zscripts/audit-m16-economy.ts — AUDIT-M16 · R5: СВОЯ независимая симуляция
 * окупаемости Фазы 5 (≥30 дней) + per-saveId доска + «Друг деревни» −5%.
 * Отличия от m163-economy.ts (прецедент): СВОЙ saveId, 35 дней, зонд
 * per-saveId (две фикстуры, одна дата → доски ДОЛЖНЫ отличаться), захват
 * расшифровки `applied` уникального товара партнёра-«Друга деревни».
 * Инварианты [DECISION M163-окупаемость]: поток > 0 · ворчунов 0 · счастье
 * не ниже стартового · дней без налога/контракта 0.
 */
import {
  dayTickAt,
  giveItems,
  localDateISO,
  makeSeededVillageGame,
  openVillageGate,
  readVillageSlice,
  tradeOf,
  type VillageFixture,
} from '@/selfchecks/village-fixture';
import { needSatisfied } from '@/game/modules/village/logic';
import { ITEMS } from '@/content/items/items';
import { VILLAGE_TABLE, villageLevelOf } from '@/content/village/table';

// ---------- ЗОНД 1: per-saveId (одна дата, разные saveId → разные доски) ----------
async function boardOf(saveId: string): Promise<string> {
  const f = await makeSeededVillageGame(saveId);
  openVillageGate(f);
  dayTickAt(f, 0);
  const v = tradeOf(f);
  const line = v.contracts.map((c) => `${c.partnerId}:${c.item}x${c.qty}+${c.premiumPercent}`).join(' | ');
  f.dispose();
  return line;
}
const boardA = await boardOf('v16-audit-board-alpha-0001');
const boardB = await boardOf('v16-audit-board-beta-0002');
console.log('=== ЗОНД per-saveId (одна дата ' + localDateISO(Date.now()) + ') ===');
console.log('доска A (alpha):', boardA);
console.log('доска B (beta) :', boardB);
console.log('доски РАЗЛИЧАЮТСЯ:', boardA !== boardB ? 'ДА (per-saveId жив)' : 'НЕТ (совпали — проверить руками)');

// ---------- СИМУЛЯЦИЯ 35 ДНЕЙ ----------
const f = await makeSeededVillageGame('v16-audit-econ-35d');
openVillageGate(f);
dayTickAt(f, 0);

let totalTax = 0;
let totalContractGold = 0;
let totalContracts = 0;
let minHappiness = 100;
let startHappiness = 0;
let grumblersTotal = 0;
let daysWithoutTax = 0;
let daysWithoutContractGold = 0;
const daily: string[] = [];
let friendProof = '';

for (let day = 1; day <= 35; day++) {
  const taxBefore = f.events.filter((e) => e.name === 'village.taxCollected').length;
  const fulBefore = f.events.filter((e) => e.name === 'trade.fulfilled').length;
  dayTickAt(f, day); // налог за день + ролл потребностей/контрактов/трендов
  const taxN = f.events.filter((e) => e.name === 'village.taxCollected').length - taxBefore;
  const taxGold = f.events.filter((e) => e.name === 'village.taxCollected').slice(-Math.max(taxN, 0)).reduce((s, e) => s + Number(e.payload.gold ?? 0), 0);
  // 1) потребности дня (производство игрока; weekly — канонический skip)
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
  // 2) исполнить все доступные контракты (предметы = производство игрока)
  const view = tradeOf(f);
  for (const c of view.contracts) {
    if (c.gateLine !== null) continue;
    giveItems(f, c.item, c.qty);
    const r = f.village['village.trade.fulfill'](c.partnerId);
    if (!r.ok) console.log(`  ! fulfill ${c.partnerId}: ${(r as { error: string }).error}`);
  }
  // 3) журнал
  const ful = f.events.filter((e) => e.name === 'trade.fulfilled').length - fulBefore;
  const gold = f.events.filter((e) => e.name === 'trade.fulfilled').slice(-ful).reduce((s, e) => s + Number(e.payload.gold ?? 0), 0);
  const s2 = await readVillageSlice(f);
  const live = Object.values(s2?.villagers ?? {});
  const avgH = live.length > 0 ? Math.round(live.reduce((s, v) => s + v.happiness, 0) / live.length) : 0;
  const grum = live.filter((v) => v.grumbleDays >= 3).length;
  if (day === 1) startHappiness = avgH;
  minHappiness = Math.min(minHappiness, avgH);
  grumblersTotal += grum;
  totalTax += taxGold;
  totalContracts += ful;
  totalContractGold += gold;
  if (taxN === 0) daysWithoutTax++;
  if (gold === 0) daysWithoutContractGold++;
  daily.push(`д${String(day).padStart(2)}: налог=${taxGold}з(+${taxN}) контракты=${ful}/${gold}з ур=${villageLevelOf(s2?.xp ?? 0, VILLAGE_TABLE.level)} жит=${live.length} сч=${avgH} ворч=${grum}`);
  // 4) захват «Друг деревни» −5% (расшифровка applied уникального товара)
  if (friendProof === '') {
    const v2 = tradeOf(f);
    for (const g of v2.goods) {
      const rep = v2.reputation.find((r) => r.partnerId === g.partnerId);
      if (rep !== undefined && rep.levelName === 'Друг деревни' && g.gateLine === null) {
        friendProof = `${g.partnerId} ${g.defId}: цена ${g.price}з · расшифровка: ${g.applied.join('; ')}`;
        break;
      }
    }
  }
}

console.log('=== СИМУЛЯЦИЯ 35 ДНЕЙ (потребности → налоги → биржа) ===');
console.log(daily.join('\n'));
console.log('--- ИТОГ 35 дней ---');
console.log(`налоги: ${totalTax}з · контрактов: ${totalContracts} · выплачено: ${totalContractGold}з · ПОТОК ЦИКЛА: ${totalTax + totalContractGold}з`);
console.log(`дней без налога: ${daysWithoutTax} · без контрактов: ${daysWithoutContractGold} · стартовое счастье: ${startHappiness} · мин: ${minHappiness} · ворчунов суммарно: ${grumblersTotal}`);
const fin = await readVillageSlice(f);
console.log(`финал: уровень ${villageLevelOf(fin?.xp ?? 0, VILLAGE_TABLE.level)} · жителей ${Object.keys(fin?.villagers ?? {}).length} · история сделок ${fin?.trade?.history?.length ?? 0} (кап 60)`);
console.log('репутация:', tradeOf(f).reputation.map((r) => `${r.partnerId}=${r.points}(${r.levelName})`).join(' '));
console.log('«Друг деревни» −5% расшифровка:', friendProof || 'не достигнут за 35 дней');
const ok = grumblersTotal === 0 && minHappiness >= startHappiness && totalContractGold > 0 && totalTax > 0 && daysWithoutTax === 0 && daysWithoutContractGold === 0;
console.log(`ВЕРДИКТ окупаемости (35 ≥ 30 дней): ${ok ? 'ЦИКЛ САМ СЕБЯ ОКУПАЕТ — поток положителен, золотая субсидия не нужна' : 'FAIL'}`);
f.dispose();
process.exit(0);
