import { rollHelpersBoard } from '../src/game/modules/mine/helpers-board';
import { HELPER_CLASSES, HELPER_FEAR_DEFS, MINE_HELPERS_TABLE } from '../src/content/mine/helpers';
import { MODFORGE_TABLE } from '../src/content/balance/modforge';
import type { Rarity } from '../src/shared/types/ids';

const dateISO = '2024-01-01';
for (let s = 0; s < 300; s++) {
  const saveId = `m132-gold-${s}`;
  const board = rollHelpersBoard(saveId, dateISO, {
    classes: HELPER_CLASSES, table: MINE_HELPERS_TABLE, fears: HELPER_FEAR_DEFS,
    rollTraits: () => [], traitShape: () => MODFORGE_TABLE.traitBudgets.helper,
    traitBudget: (r: Rarity) => MODFORGE_TABLE.byRarity[r].budget,
  });
  const scout = board.find((p) => p.classId === 'scout');
  if (scout !== undefined) {
    console.log(`scout → saveId=${saveId}`);
    board.forEach((q, i) => console.log(`   [${i}] ${q.defId} ${q.name} ${q.classId} ${q.rarity} salary=${q.salaryPerDay} hire=${q.hireCost} fears=[${q.fears.map((x) => x.id).join(',')}]`));
    break;
  }
}
