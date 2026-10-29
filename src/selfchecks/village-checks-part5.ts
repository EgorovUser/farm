/**
 * Self-checks M16.2 «Деревня» — часть 5: ВООРУЖЕНИЕ (бриф G4/G8): сила
 * защиты f(тип, качество, forgeLevel) оракулами данных (расчёт, не
 * лотерея), equip живьём (TransactionService village.equip, снапшот
 * ХУДШЕГО-вперёд D25, заточка через витрину forge.levelOf), витрина сил
 * village.raid, отказы ×4, снятие с возвратом исходного тира.
 */
import { VILLAGE_RAID, defenseStrengthOf, raidThresholdOf, stolenGoldOf, stolenPercentOf } from '@/content/village/raid';
import { check, type CheckResult } from './types';
import { giveItems, makeSeededVillageGame, openVillageGate, readVillageSlice, type R, type VillageFixture } from './village-fixture';

interface InvEntry {
  iid: string;
  defId: string;
  qty: number;
  quality: { tier: string; value: number };
}

function listInv(f: VillageFixture): InvEntry[] {
  return f.inv['inventory.list']() as InvEntry[];
}

/** снапшот ожидания: худший экземпляр D25 (tierRank, затем value) */
function worstOf(entries: InvEntry[]): InvEntry {
  const order = ['D', 'C', 'B', 'A', 'S', 'SS'];
  return [...entries].sort((a, b) => order.indexOf(a.quality.tier) - order.indexOf(b.quality.tier) || a.quality.value - b.quality.value)[0]!;
}

export async function runVillagePart5(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 21. сила защиты/порог/кража — оракулы данных (расчёт, не лотерея)
  {
    const ok21 =
      defenseStrengthOf(VILLAGE_RAID, 'weapon', 'C', 50, 0) === 8.5 && // 5 + 2 + 1.5
      defenseStrengthOf(VILLAGE_RAID, 'armor', 'A', 80, 3) === 17.4 && // 6 + 6 + 2.4 + 3
      defenseStrengthOf(VILLAGE_RAID, 'shield', 'D', 50, 0) === 5.5 && // 4 + 0 + 1.5
      defenseStrengthOf(VILLAGE_RAID, 'rod', 'SS', 100, 5) === 20 && // прочее: 2 + 10 + 3 + 5
      defenseStrengthOf(VILLAGE_RAID, 'weapon', 'SS', 100, 5) === 23 && // качество влияет: 6.5 → 23
      raidThresholdOf(VILLAGE_RAID, 1) === 12 &&
      raidThresholdOf(VILLAGE_RAID, 5) === 28 &&
      raidThresholdOf(VILLAGE_RAID, 25) === 108 &&
      stolenPercentOf(VILLAGE_RAID, 0) === 8 &&
      stolenPercentOf(VILLAGE_RAID, 2) === 11 &&
      stolenPercentOf(VILLAGE_RAID, 8) === 20 && // 8 + 12 = 20 = капа
      stolenPercentOf(VILLAGE_RAID, 100) === 20 && // КАПА cozy ≤ 20%
      stolenGoldOf(VILLAGE_RAID, 20, 1000, 0) === 200 &&
      stolenGoldOf(VILLAGE_RAID, 20, 1000, 15) === 170 && // Склад L1 режет 15%
      stolenGoldOf(VILLAGE_RAID, 20, 1000, 45) === 110 && // Склад L3
      stolenGoldOf(VILLAGE_RAID, 11, 1000, 0) === 110;
    results.push(
      check(
        'сила защиты/порог/кража — оракулы данных (G4/G5, [DECISION M162-рейд]): сила = тип + tierStep×ранг + value×0.03 + заточка (weapon C/50/0 = 8.5; armor A/80/3 = 17.4; shield D/50/0 = 5.5; прочее SS/100/5 = 20); качество влияет (weapon D→SS: 6.5 → 23); порог = 12 + 4×(уровень−1) (1/5/25 → 12/28/108); кража = 8 + 1.5×дефицит с КАПОЙ ≤ 20% (cozy-инвариант §4); золото = % склада × (1 − защита Склада/100) (200/170/110); РАСЧЁТ, не лотерея',
        () => ok21,
        { expected: 'сетка оракулов', actual: ok21 ? 'ok' : 'FAIL' },
      ),
    );
  }

  // 22. equip живьём: снапшот худшего D25, списание, витрина сил, отказы ×4
  {
    const f = await makeSeededVillageGame('v162-equip');
    openVillageGate(f);
    giveItems(f, 'iron_sword', 1);
    giveItems(f, 'leather_armor', 1);
    giveItems(f, 'buckler', 1);
    const before = listInv(f);
    const sword = worstOf(before.filter((e) => e.defId === 'iron_sword'));
    const armor = worstOf(before.filter((e) => e.defId === 'leather_armor'));
    const shield = worstOf(before.filter((e) => e.defId === 'buckler'));
    const rV = f.village['village.equip']('villager_varvara', 'iron_sword') as R<unknown>;
    const rM = f.village['village.equip']('villager_miron', 'leather_armor') as R<unknown>;
    const rZ = f.village['village.equip']('villager_zoya', 'buckler') as R<unknown>;
    const slice = await readVillageSlice(f);
    const after = listInv(f);
    const raid = f.village['village.raid']() as {
      defense: { total: number; buildings: number; villagers: Array<{ id: string; strength: number }> };
    };
    const stranger = f.village['village.equip']('villager_nobody', 'iron_sword') as R<unknown>;
    const away = f.village['village.equip']('villager_akulina', 'iron_sword') as R<unknown>;
    const notGear = f.village['village.equip']('villager_varvara', 'iron_ingot') as R<unknown>;
    const busy = f.village['village.equip']('villager_varvara', 'iron_sword') as R<unknown>;
    const expect = (e: InvEntry) => defenseStrengthOf(VILLAGE_RAID, e.defId === 'iron_sword' ? 'weapon' : e.defId === 'leather_armor' ? 'armor' : 'shield', e.quality.tier, e.quality.value, 0);
    results.push(
      check(
        'equip живьём (G4): village.equip ×3 (меч/броня/баклер) — TransactionService списал по экземпляру, снапшот = ХУДШИЙ-вперёд D25 (tier/value с изымаемого), заточка 0 (свежие предметы); силы в витрине village.raid = defenseStrengthOf(тип, качество, forgeLevel) — РАЗНЫЕ по типам/качеству; суммарная защита = Σ сил (построек нет); рюкзак осведомлён (записи списаны); отказы ×4: неизвестный житель / не в деревне / не снаряжение / уже снаряжён',
        () =>
          rV.ok &&
          rM.ok &&
          rZ.ok &&
          slice?.equipped?.villager_varvara?.defId === 'iron_sword' &&
          slice?.equipped?.villager_varvara?.tier === sword.quality.tier &&
          Math.round(slice?.equipped?.villager_varvara?.value ?? -1) === Math.round(sword.quality.value) &&
          slice?.equipped?.villager_miron?.defId === 'leather_armor' &&
          slice?.equipped?.villager_zoya?.defId === 'buckler' &&
          after.every((e) => e.iid !== sword.iid && e.iid !== armor.iid && e.iid !== shield.iid) &&
          raid.defense.buildings === 0 &&
          raid.defense.villagers.length === 3 &&
          Math.abs(raid.defense.total - (expect(sword) + expect(armor) + expect(shield))) < 0.35 &&
          raid.defense.villagers.every((r) => r.strength > 0) &&
          !stranger.ok &&
          !away.ok &&
          !notGear.ok &&
          !busy.ok,
        {
          expected: '3 снаряжения, снапшоты D25, силы = формуле, отказы ×4',
          actual: `${rV.ok && rM.ok && rZ.ok ? 'equip ×3 ok' : 'FAIL'}; total ${raid.defense.total}; отказы ${[stranger, away, notGear, busy].every((r) => !r.ok) ? '×4' : 'FAIL'}`,
        },
      ),
    );
    f.dispose();
  }

  // 23. unequip: возврат предмета с исходным тиром, ключ удалён, повтор — отказ
  {
    const f = await makeSeededVillageGame('v162-uneq');
    openVillageGate(f);
    giveItems(f, 'iron_sword', 1);
    const before = listInv(f);
    const sword = worstOf(before.filter((e) => e.defId === 'iron_sword'));
    f.village['village.equip']('villager_varvara', 'iron_sword');
    const rOff = f.village['village.equip']('villager_varvara', 'off') as R<unknown>;
    const slice = await readVillageSlice(f);
    const after = listInv(f);
    const returned = after.find((e) => e.defId === 'iron_sword');
    const rAgain = f.village['village.equip']('villager_varvara', 'off') as R<unknown>;
    const raid = f.village['village.raid']() as { defense: { villagers: Array<{ id: string }> } };
    results.push(
      check(
        'снятие снаряжения (G4): village.equip <id> off — возврат предмета КАНАЛОМ inventory.add с исходным тиром (D25-снапшот), срез equipped ключ УДАЛЁН (ленивость), витрина сил обновилась (житель без снаряжения), повторное снятие — честный отказ «нет снаряжения»',
        () =>
          rOff.ok &&
          returned !== undefined &&
          returned.quality.tier === sword.quality.tier &&
          slice?.equipped?.villager_varvara === undefined &&
          raid.defense.villagers.every((r) => r.id !== 'villager_varvara') &&
          !rAgain.ok,
        {
          expected: 'возврат с тиром; ключ удалён; повтор — отказ',
          actual: `${rOff.ok ? 'off ok' : 'FAIL'}; тир ${returned?.quality.tier} vs ${sword.quality.tier}; equipped ${slice?.equipped === undefined ? 'чист' : 'ЕСТЬ'}; повтор ${rAgain.ok ? 'FAIL' : 'отказ'}`,
        },
      ),
    );
    f.dispose();
  }

  return results;
}
