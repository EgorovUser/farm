/** .zscripts/m163-debug4.ts — почему налоги = 0 в симуляции? */
import { dayTickAt, makeSeededVillageGame, openVillageGate, readVillageSlice } from '@/selfchecks/village-fixture';

const f = await makeSeededVillageGame('v163-tax-probe');
openVillageGate(f);
console.log('events после гейта:', f.events.filter((e) => e.name === 'village.taxCollected').length);
dayTickAt(f, 1);
console.log('events после dayTick(1):', f.events.filter((e) => e.name === 'village.taxCollected').length);
console.log('payloads:', JSON.stringify(f.events.filter((e) => e.name === 'village.taxCollected').map((e) => e.payload)));
const slice = await readVillageSlice(f);
console.log('need.days:', Object.entries(slice?.villagers ?? {}).map(([id, v]) => `${id}:${v.need?.day}`).join(' '));
// прямой резолв налога
const stat = f.game.statBus.resolve({ stat: 'village.tax.gold', ctx: { tags: [], now: f.clock.now(), extra: {} } } as never);
console.log('resolve village.tax.gold =', stat);
dayTickAt(f, 2);
console.log('events после dayTick(2):', f.events.filter((e) => e.name === 'village.taxCollected').length);
f.dispose();
process.exit(0);
