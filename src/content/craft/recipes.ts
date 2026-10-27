/**
 * РЕЦЕПТЫ КРАФТА (карточка M09 §3; RecipeDef — канон 03-DATA §8).
 *
 * Входы/выход: defId — предмет ИЛИ валюта кошелька (03-DATA §1: planks/nails/
 * coal/feed/fertilizer/leather/ingot:bronze…). Разрешение рода: каталог валют
 * (content/player/currencies.ts) → иначе реестр предметов. Коллизий id нет
 * (валюты с двоеточием предметами не бывают; feed/fertilizer/... предметами
 * не являются) — [DECISION], задокументировано в модуле.
 *
 * [DECISION · M09] поле energyCost НЕ задаётся ни в одном рецепте: расход
 * энергии — стат action.craft.make.energyCost (карточка M01 §2: «крафт 2»,
 * базы в content/player/bases.ts), чтобы Спартанец M14 и будущие бафы
 * применялись через шину (П3). Поле остаётся в схеме (канон 03-DATA §8):
 * явное значение = фиксированная цена рецепта поверх стата.
 *
 * Цепочки глубиной 2–4 (карточка §3): logs→planks→nails/plow;
 * iron_ore→iron_ingot→iron_plate→кирка/меч/щит/броня; wool→cloth→шарф/знамя;
 * river_perch→leather→рюкзак. Числа — стартовые (П6).
 */
import type { ID } from '@/shared/types/ids';
import type { Condition } from '@/shared/types/requirement';
import type { Modifier } from '@/kernel/bus/stat-bus/modifier';
import type { StationId } from './stations';
// каталоги строк (01 §6: файл данных = одна ответственность; прецедент items/)
import { FORGE_RECIPES } from './catalog-recipes-forge';
import { SOFT_RECIPES } from './catalog-recipes-soft';

export interface RecipeDef {
  id: ID;
  station: StationId;
  /** входы: defId предмета или валюты кошелька */
  inputs: { defId: ID; qty: number }[];
  output: { defId: ID; qty: number };
  /** расход энергии рецепта; НЕ задан → стат action.craft.make.energyCost (M01 §2) */
  energyCost?: number;
  /** время партии, секунды (очередь крафта — idle-элемент, карточка §5) */
  craftSeconds: number;
  /** гейт рецепта: не крафтится и виден с замком до выполнения (П6) */
  unlock?: Condition;
  /** постоянные эффекты при завершении партии (рюкзак: +4 слота за скрафт) */
  effects?: Modifier[];
}

export const RECIPES: RecipeDef[] = [
  ...FORGE_RECIPES,
  ...SOFT_RECIPES,
];
