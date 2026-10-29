/**
 * Мастер-пулы потребностей деревни (бриф §0/G2): веса ролла кандидатов по
 * категориям. Ролл — dailySeed-канон (сид = hash(saveId, 'village-needs',
 * dateISO); еженедельные — по якорю iso-недели, прецеденты ротации M04/
 * доски M13). Кандидаты жителя — его VillagerDef.needs; вес кандидат
 * берётся ЗДЕСЬ по defId (нет в пуле → вес 1, П5).
 *
 * Только существующие предметы/валюты: еда — урожай M05/яйца M06/рыба M07;
 * материалы — руда/слитки (предметы M09/M12) + доски/брёвна/гвозди/кожа
 * (валюты кошелька, 03-DATA §1); изделия — M09 (ткань/канат/жертвенный
 * камень/тёплый шарф) и еда кухни (хлеб/мёд).
 */
import type { VillageNeedsTable } from './types';

export const VILLAGE_NEEDS: VillageNeedsTable = {
  daily: [
    // еда: урожай (M05)
    { defId: 'wheat_grain', weight: 10, cat: 'food' },
    { defId: 'carrot', weight: 8, cat: 'food' },
    { defId: 'potato', weight: 8, cat: 'food' },
    { defId: 'tomato', weight: 6, cat: 'food' },
    { defId: 'turnip', weight: 6, cat: 'food' },
    { defId: 'mushroom', weight: 5, cat: 'food' },
    { defId: 'grape', weight: 4, cat: 'food' },
    // еда: яйца/молоко (M06)
    { defId: 'egg', weight: 7, cat: 'food' },
    { defId: 'milk', weight: 5, cat: 'food' },
    // рыба (M07)
    { defId: 'crucian', weight: 6, cat: 'fish' },
    { defId: 'rotan', weight: 5, cat: 'fish' },
    { defId: 'perch', weight: 5, cat: 'fish' },
    // материалы: руда (M12-предметы)
    { defId: 'copper_ore', weight: 6, cat: 'materials' },
    { defId: 'tin_ore', weight: 5, cat: 'materials' },
    { defId: 'iron_ore', weight: 6, cat: 'materials' },
    { defId: 'silver_ore', weight: 2, cat: 'materials' },
    // материалы: волокно-кожа (валюты)
    { defId: 'leather', weight: 4, cat: 'materials' },
    { defId: 'logs', weight: 5, cat: 'materials' },
    { defId: 'planks', weight: 5, cat: 'materials' },
    // материалы: собирательство (M09-входы)
    { defId: 'healing_herb', weight: 4, cat: 'materials' },
  ],
  weekly: [
    // слитки (M09: плавильня)
    { defId: 'iron_ingot', weight: 6, cat: 'materials' },
    // гвозди (валюта, M09)
    { defId: 'nails', weight: 5, cat: 'materials' },
    // изделия: ткань/канат (M09)
    { defId: 'cloth', weight: 4, cat: 'goods' },
    { defId: 'rope', weight: 4, cat: 'goods' },
    // еда кухни (M09)
    { defId: 'bread', weight: 4, cat: 'food' },
    { defId: 'honey', weight: 3, cat: 'food' },
    // рыба покрупнее (M07)
    { defId: 'pike', weight: 3, cat: 'fish' },
    { defId: 'sturgeon', weight: 2, cat: 'fish' },
    // шерсть/трофеи
    { defId: 'wool', weight: 4, cat: 'materials' },
    { defId: 'truffle', weight: 2, cat: 'food' },
    { defId: 'amber_resin', weight: 2, cat: 'materials' },
    // изделия-заделы заточки/одежды
    { defId: 'whetstone_of_luck', weight: 1, cat: 'goods' },
    { defId: 'warm_scarf', weight: 1, cat: 'goods' },
    { defId: 'iron_plate', weight: 2, cat: 'materials' },
  ],
};

/** вес кандидата по defId (нет в пуле → 1 — П5 «неизвестное — рядовой случай») */
export function needWeightOf(pools: VillageNeedsTable, defId: string, kind: 'daily' | 'weekly'): number {
  const entry = pools[kind].find((e) => e.defId === defId);
  return entry === undefined ? 1 : entry.weight;
}
