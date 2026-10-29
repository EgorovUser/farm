/** диагностический пробник M16.2 чека 22: математика сил экипа */
import { makeSeededVillageGame, giveItems, readVillageSlice } from '../src/selfchecks/village-fixture';
import { defenseStrengthOf } from '../src/content/village/raid';

async function main(): Promise<void> {
  const f = await makeSeededVillageGame('v162-equip');
  f.player['player.addXp'](60000, 'probe.gate');
  f.quests['quests.unlockAch']('ach_homestead_master');
  f.village['village.state']();
  giveItems(f, 'iron_sword', 1);
  giveItems(f, 'leather_armor', 1);
  giveItems(f, 'buckler', 1);
  type E = { iid: string; defId: string; qty: number; quality: { tier: string; value: number } };
  const before = f.inv['inventory.list']() as E[];
  console.log('before:', JSON.stringify(before.map((e) => ({ d: e.defId, t: e.quality.tier, v: e.quality.value }))));
  const rV = f.village['village.equip']('villager_varvara', 'iron_sword');
  const rM = f.village['village.equip']('villager_miron', 'leather_armor');
  const rZ = f.village['village.equip']('villager_zoya', 'buckler');
  console.log('equips:', JSON.stringify([rV, rM, rZ].map((r) => (r as { ok: boolean }).ok)));
  const slice = await readVillageSlice(f);
  console.log('slice.equipped:', JSON.stringify(slice?.equipped));
  const after = f.inv['inventory.list']() as E[];
  console.log('after:', JSON.stringify(after.map((e) => ({ d: e.defId, t: e.quality.tier, v: e.quality.value }))));
  const raid = f.village['village.raid']() as { defense: { total: number; buildings: number; villagers: Array<{ id: string; strength: number }> } };
  console.log('raid:', JSON.stringify(raid.defense));
  const sw = before.find((e) => e.defId === 'iron_sword')!;
  const ar = before.find((e) => e.defId === 'leather_armor')!;
  const sh = before.find((e) => e.defId === 'buckler')!;
  console.log('expect sword:', defenseStrengthOf({ typeBase: { weapon: 5, armor: 6, shield: 4, other: 2 }, tierStep: 2, valueFactor: 0.03, sharpenStep: 1, equippableTypes: [] } as never, 'weapon', sw.quality.tier, sw.quality.value, 0));
  void ar; void sh;
  f.dispose();
}

void main();
