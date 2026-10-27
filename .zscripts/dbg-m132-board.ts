/**
 * dbg-m132-board: дискавери golden-досок для чеков M13.2 (вне дерева игры).
 * Ищет по каждому страху/классу saveId, где на доске 2024-01-01 есть
 * кандидат с этим страхом; печатает первые находки.
 */
import { rollHelpersBoard } from '../src/game/modules/mine/helpers-board';
import { HELPER_CLASSES, HELPER_FEAR_DEFS, MINE_HELPERS_TABLE } from '../src/content/mine/helpers';
import { MODFORGE_TABLE } from '../src/content/balance/modforge';
import type { Rarity } from '../src/shared/types/ids';

const dateISO = '2024-01-01';
const targets = ['fear_spiders', 'fear_cold', 'fear_claustrophobe', 'fear_greedy'];
const found: Record<string, string> = {};

for (let s = 0; s < 200; s++) {
  const saveId = `m132-gold-${s}`;
  const board = rollHelpersBoard(saveId, dateISO, {
    classes: HELPER_CLASSES,
    table: MINE_HELPERS_TABLE,
    fears: HELPER_FEAR_DEFS,
    rollTraits: () => [],
    traitShape: () => MODFORGE_TABLE.traitBudgets.helper,
    traitBudget: (r: Rarity) => MODFORGE_TABLE.byRarity[r].budget,
  });
  for (const p of board) {
    for (const f of p.fears) {
      if (targets.includes(f.id) && found[f.id] === undefined) {
        found[f.id] = saveId;
        console.log(`== ${f.id} → saveId=${saveId}`);
        board.forEach((q, i) =>
          console.log(`   [${i}] ${q.defId} ${q.name} ${q.classId} ${q.rarity} atk=${q.atk} hp=${q.hp} speed=${q.speed} salary=${q.salaryPerDay} hire=${q.hireCost} fears=[${q.fears.map((x) => x.id).join(',')}]`),
        );
      }
    }
  }
  if (targets.every((t) => found[t] !== undefined)) break;
}
console.log('ИТОГ:', JSON.stringify(found));
