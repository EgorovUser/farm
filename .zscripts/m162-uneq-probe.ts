/** диагностический пробник M16.2 чека 23: почему unequip вернул ошибку */
import { makeSeededVillageGame, giveItems, readVillageSlice } from '../src/selfchecks/village-fixture';

async function main(): Promise<void> {
  const f = await makeSeededVillageGame('v162-uneq');
  const open = f.player['player.addXp'] as unknown as (n: number, s: string) => unknown;
  void open;
  f.player['player.addXp'](60000, 'probe.gate');
  const rAch = f.quests['quests.unlockAch']('ach_homestead_master') as { ok: boolean; error?: string };
  console.log('ach:', JSON.stringify(rAch));
  f.village['village.state']();
  const give = giveItems(f, 'iron_sword', 1);
  console.log('give:', JSON.stringify(give));
  const list1 = f.inv['inventory.list']() as Array<{ iid: string; defId: string; qty: number; quality: { tier: string; value: number } }>;
  console.log('inv before:', JSON.stringify(list1.map((e) => ({ d: e.defId, t: e.quality.tier, v: e.quality.value }))));
  const rEq = f.village['village.equip']('villager_varvara', 'iron_sword') as { ok: boolean; value?: unknown; error?: string };
  console.log('equip:', JSON.stringify(rEq));
  const slice = await readVillageSlice(f);
  console.log('equipped:', JSON.stringify(slice?.equipped));
  const rOff = f.village['village.equip']('villager_varvara', 'off') as { ok: boolean; value?: unknown; error?: string };
  console.log('off:', JSON.stringify(rOff));
  const list2 = f.inv['inventory.list']() as Array<{ defId: string; qty: number; quality: { tier: string; value: number } }>;
  console.log('inv after:', JSON.stringify(list2.map((e) => ({ d: e.defId, t: e.quality.tier, v: e.quality.value }))));
  f.dispose();
}

void main();
