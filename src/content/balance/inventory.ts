/**
 * БАЛАНС ИНВЕНТАРЯ (M02, карточка §2 + SESSION-M02 D19/D23):
 * вместимость, таблица качества предметов, дефолты стаков, вкладки.
 * Единственное место чисел инвентаря (П2/П6).
 *
 * D19: `player.inventory.slots` — стат (база здесь, в BasesTable-форме для
 * слияния в bootstrap); кап slotsCap — рядом, обычное поле таблицы.
 * Модуль считает capacity = min(slotsCap, resolve('player.inventory.slots')).
 */
import type { QualityTier } from '@/shared/types/ids';
import type { BasesTable } from '@/content/balance/bases';
import type { ItemType } from '@/content/items/items';

/** База стата вместимости (П2: задаётся один раз, мутируется только шиной) */
export const INVENTORY_BASES_TABLE: BasesTable = {
  bases: {
    // карточка M02 §2: сетка базово 20 слотов, расширение рюкзаками (M09)
    // и пассивками (M14) — модификаторами, этот код не меняется (D19)
    'player.inventory.slots': 20,
  },
  meta: {
    'player.inventory.slots': { min: 1, round: 'floor' },
  },
};

export interface InventoryTabDef {
  id: string;
  name: string;
  types: ItemType[];
}

/** Слот экипировки (карточка §2 + бриф M02.2 §2.2): строка данных.
 *  Новый слот в будущем = строка здесь, ноль кода.
 *  Соответствие предмета: itemType ∈ types И (если задан subTypes — subType ∈ subTypes). */
export interface EquipmentSlotDef {
  id: string;
  name: string;
  types: ItemType[];
  /** опциональный белый список subType (например, слот «Кирка» — только pickaxe) */
  subTypes?: string[];
}

export interface InventoryTable {
  /** кап вместимости: capacity = min(slotsCap, resolve('player.inventory.slots')) */
  slotsCap: number;
  /** стартовые веса тиров качества (карточка §4, D23: тир по весам через RngBus) */
  qualityWeights: Record<QualityTier, number>;
  /** дефолты стаков по itemType (явный maxStock в def перекрывает; карточка §2) */
  stackDefaults: Partial<Record<ItemType, number>>;
  /** вкладки по itemType (карточка §2: категория новой вкладки = строка данных;
   *  последняя вкладка — «Прочее» — принимает неизвестные типы, П5) */
  tabs: InventoryTabDef[];
  /** слоты экипировки (карточка §2: Кирка, Оружие, Броня, Щит, Удочка,
   *  Активная наживка, Аксессуар ×2) */
  equipmentSlots: EquipmentSlotDef[];
}

export const INVENTORY_TABLE: InventoryTable = {
  // карточка §2: «+4 за шаг, кап 60»
  slotsCap: 60,
  qualityWeights: {
    D: 40,
    C: 30,
    B: 20,
    A: 8,
    S: 1.6,
    SS: 0.4,
  },
  stackDefaults: {
    // карточка §2: семена/наживки/расходники/рыба — до 50 (апгрейд до 100 позже)
    seed: 50,
    bait: 50,
    consumable: 50,
    fish: 50,
    // материалы хозяйства — по действующему контенту компонентов
    component: 999,
  },
  tabs: [
    { id: 'tools', name: 'Инструменты', types: ['tool'] },
    { id: 'gear', name: 'Снаряжение', types: ['weapon', 'armor', 'shield', 'rod'] },
    { id: 'supplies', name: 'Расходники', types: ['consumable', 'seed', 'bait'] },
    { id: 'other', name: 'Прочее', types: ['fish', 'treasure', 'component'] },
  ],
  // карточка §2: 8 слотов; «Аксессуар ×2» — два независимых слота под разные
  // записи. Слот «Кирка» дополнительно ограничен subType (будущая мотыга
  // потребует своей строки — не кода)
  equipmentSlots: [
    { id: 'pickaxe', name: 'Кирка', types: ['tool'], subTypes: ['pickaxe'] },
    { id: 'weapon', name: 'Оружие', types: ['weapon'] },
    { id: 'armor', name: 'Броня', types: ['armor'] },
    { id: 'shield', name: 'Щит', types: ['shield'] },
    { id: 'rod', name: 'Удочка', types: ['rod'] },
    { id: 'bait', name: 'Активная наживка', types: ['bait'] },
    { id: 'accessory', name: 'Аксессуар I', types: ['treasure'] },
    { id: 'accessory2', name: 'Аксессуар II', types: ['treasure'] },
  ],
};
