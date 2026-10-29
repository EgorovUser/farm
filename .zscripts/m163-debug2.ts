/** .zscripts/m163-debug2.ts — разбор падения чека 33 (тренды/премия в PriceBus) */
import { VILLAGE_TRADE, premiumWithTrend } from '@/content/village/trade';
import { ITEMS } from '@/content/items/items';
import { makeSeededVillageGame, openVillageGate } from '@/selfchecks/village-fixture';

const f = await makeSeededVillageGame('v163-trends');
openVillageGate(f);
const view = f.village['village.trade']() as {
  trends: Array<{ defId: string; kind: 'abundance' | 'deficit' }>;
  contracts: Array<{ partnerId: string; item: string; qty: number; premiumPercent: number }>;
};
const now = f.clock.now();
console.log('тренды:', JSON.stringify(view.trends));
for (const t of view.trends) {
  const def = ITEMS.find((d) => d.id === t.defId) as { id: string; basePrice: number; rarity: string } & Record<string, unknown>;
  const bd = f.game.priceBus.buyPrice(def as never, {
    ctx: { buyer: 'player', now, tags: ['trade'], extra: { partner: 'lesnaya_zastava' } },
  });
  console.log(`${t.defId} (${t.kind}): applied =`, JSON.stringify(bd.applied.map((m) => ({ id: m.id, kind: m.kind, group: m.group, value: m.value }))));
}
const c = view.contracts.find((r) => r.partnerId === 'lesnaya_zastava')!;
console.log('контракт лесной:', JSON.stringify(c));
const trend = view.trends.find((t) => t.defId === c.item)?.kind;
const expected = premiumWithTrend(c.premiumPercent, trend, VILLAGE_TRADE.trends.contractSwingPercent);
console.log('тренд контракта:', String(trend), '→ ожидаемая премия:', expected);
const def = ITEMS.find((d) => d.id === c.item) as Record<string, unknown>;
const sell = f.game.priceBus.sellPrice(def as never, {
  qualityTier: null,
  ctx: { buyer: 'player', now, tags: ['trade'], extra: { partner: 'lesnaya_zastava', contract: true } },
});
console.log('sell applied:', JSON.stringify(sell.applied.map((m) => ({ id: m.id, kind: m.kind, value: m.value }))));
const sellNo = f.game.priceBus.sellPrice(def as never, {
  qualityTier: null,
  ctx: { buyer: 'player', now, tags: ['trade'], extra: { partner: 'lesnaya_zastava' } },
});
console.log('sell без contract applied:', JSON.stringify(sellNo.applied.map((m) => ({ id: m.id }))));
f.dispose();
process.exit(0);
