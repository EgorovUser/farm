/**
 * M16.1 precompute: подбор saveId, при котором синтетический житель с ДВУМЯ
 * weekly-кандидатами (honey w3 / cloth w4) даёт РАЗНЫЕ предметы на двух
 * соседних iso-неделях (честный тест «новая неделя — новый ролл»).
 * Запуск: bun .zscripts/m161-weekly-probe.ts
 */
import { VILLAGE_NEEDS } from '../src/content/village/needs';
import { rollWeeklyNeed } from '../src/game/modules/village/logic';
import type { VillagerDef } from '../src/content/village/types';

const synth: VillagerDef = {
  id: 'villager_synth',
  name: 'Синт',
  profession: 'Тест',
  needs: { daily: [], weekly: [{ defId: 'honey', qty: 2 }, { defId: 'cloth', qty: 3 }] },
};

for (const sid of ['v161-det', 'v161-det2', 'v161-det3', 'v161-det4', 'v161-det5', 'v161-wk', 'v161-week']) {
  const w1 = rollWeeklyNeed(sid, synth, VILLAGE_NEEDS, '2026-10-26');
  const w1b = rollWeeklyNeed(sid, synth, VILLAGE_NEEDS, '2026-10-30');
  const w2 = rollWeeklyNeed(sid, synth, VILLAGE_NEEDS, '2026-11-02');
  console.log(
    `${sid}: нед1=${w1?.item}/${w1?.qty} пт=${w1b?.item}/${w1b?.qty} (day ${w1?.day}/${w1b?.day}) нед2=${w2?.item}/${w2?.qty} (day ${w2?.day}) ${w1?.item !== w2?.item ? '<< РАЗЛИЧАЮТСЯ' : ''}`,
  );
}
