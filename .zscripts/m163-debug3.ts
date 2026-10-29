/** .zscripts/m163-debug3.ts — разбор чека 29 (ротация) по шагам */
import { dayTickAt, localDateISO, makeSeededVillageGame, openVillageGate, readVillageSlice, VILLAGE_T0 } from '@/selfchecks/village-fixture';

const f = await makeSeededVillageGame('v163-rotate');
openVillageGate(f);
const lazy = await readVillageSlice(f);
console.log('lazy.trade:', lazy?.trade, 'lazy.rep:', lazy?.reputation);
const day0 = localDateISO(VILLAGE_T0);
const before = f.village['village.trade']() as { day: string; contracts: unknown[]; trends: unknown[] };
const slice0 = await readVillageSlice(f);
console.log('day0:', day0, '| slice0.day:', slice0?.trade?.day, '| contracts:', Object.keys(slice0?.trade?.contracts ?? {}).length, '| trends:', Object.keys(slice0?.trade?.trends ?? {}).length, '| rerolls:', slice0?.trade?.rerolls);
const snap0 = JSON.stringify(slice0?.trade?.contracts);
dayTickAt(f, 0);
const slice0b = await readVillageSlice(f);
console.log('после реплея того же дня: contracts идентичны:', JSON.stringify(slice0b?.trade?.contracts) === snap0);
dayTickAt(f, 1);
const day1 = localDateISO(VILLAGE_T0 + 86_400_000);
const slice1 = await readVillageSlice(f);
console.log('day1:', day1, '| slice1.day:', slice1?.trade?.day, '| rerolls:', slice1?.trade?.rerolls);
const afterNewDay = f.village['village.trade']() as { day: string };
console.log('view.day после нового дня:', afterNewDay.day);
console.log('контракты изменились:', JSON.stringify(slice1?.trade?.contracts) !== snap0);
console.log('тренды изменились:', JSON.stringify(slice1?.trade?.trends) !== JSON.stringify(slice0?.trade?.trends));
f.dispose();
process.exit(0);
