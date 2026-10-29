/** .zscripts/m163-debug.ts — разбор падения raiseVillageToLevel (check 35) */
import { makeSeededVillageGame, openVillageGate, readVillageSlice, satisfyVillageNeeds, dayTickAt, localDateISO, giveItems, type R } from '@/selfchecks/village-fixture';

const f = await makeSeededVillageGame('v163-market');
openVillageGate(f);
for (let day = 0; day < 5; day++) {
  const slice = await readVillageSlice(f);
  console.log(`=== день ${day}: clock ${localDateISO(f.clock.now())} xp=${slice?.xp}`);
  for (const [id, lv] of Object.entries(slice?.villagers ?? {})) {
    console.log(`  ${id}: need=${lv.need?.item}×${lv.need?.qty}(${lv.need?.kind}, day=${lv.need?.day}) lastSat=${lv.lastSatisfied ?? '—'}`);
  }
  try {
    await satisfyVillageNeeds(f);
    console.log(`  satisfy ok → xp теперь ${(await readVillageSlice(f))?.xp}`);
  } catch (e) {
    console.log(`  THROW: ${(e as Error).message}`);
    break;
  }
  dayTickAt(f, day + 1);
}
f.dispose();
process.exit(0);
