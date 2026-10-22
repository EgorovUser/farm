# 03 — DATA: схемы данных, контент-реестр, сид-рандом

> Подавать в сессию при любой работе с данными и в фазе 0. Все типы игры обязаны происходить из этого файла и храниться в `src/shared/types/` + `src/modules/*/logic/types.ts` (модульные — у себя). Имена полей — из глоссария `01-CORE §11`. Никаких анонимных структур.

## 1. Общие и идентификаторы

```ts
type ID = string;                       // 'iron_pickaxe', 'node_042' — snake_case
type StatId = string;                   // точечные: 'player.energy.max', 'farm.growthSpeed'
type Tag = string;                      // 'fishing' | 'night' | 'layer:3' | 'status:cold'
type Rarity = 'common'|'uncommon'|'rare'|'epic'|'legendary'|'mythic';
type QualityTier = 'D'|'C'|'B'|'A'|'S'|'SS';
type CurrencyId = 'gold'|'copper'|'tin'|'iron'|'silver'|'nuggets'|'mithril'|'adamant'
                 |'stone'|'logs'|'planks'|'fiber'|'leather'|'nails'|'coal'
                 |'feed'|'fertilizer'|'caviar'|'ingot:bronze'|'ingot:iron';
```

Множители (данные, тюнятся в `content/balance/`): редкость к цене ×1 / 1.5 / 2.5 / 4 / 7 / 12; качество к цене ×0.7 / 1 / 1.35 / 1.8 / 2.5 / 3.5; качество к силе статов ×0.9 / 1 / 1.1 / 1.25 / 1.45 / 1.7.

## 2. Условия и требования (декларативные, data-only)

```ts
type Condition =
  | { t: 'ctxTag'; tag: Tag }                    // в контексе есть тег
  | { t: 'statAtLeast'; stat: StatId; value: number }
  | { t: 'statAtMost';  stat: StatId; value: number }
  | { t: 'flag'; flag: string }                  // unlockFlag ачивки/квеста
  | { t: 'skill'; skill: ID; level: number }
  | { t: 'playerLevel'; level: number }
  | { t: 'achievement'; id: ID }
  | { t: 'hasItem'; defId: ID; qty?: number }
  | { t: 'not'; c: Condition } | { t: 'all'; cs: Condition[] } | { t: 'any'; cs: Condition[] };
type Requirement = Condition;                   // гейты: то же самое, но для «можно ли»
```

Единый оценщик `check(cond, ctx)` живёт в `shared/utils` и используется ВСЕМИ системами (гейты магазина, блокировки рыб, требования работников, страхи помощников, условия карт). Это и есть «неизвестность» в действии: новая механика описывается данными, а не кодом.

## 3. Модификаторы и шины — модель

```ts
interface Modifier { /* см. 02-BUSES §2 — каноническая копия там */ }
interface ModifierProvider { id: ID; provide(stat: StatId, ctx: ResolveCtx): Modifier[] }
interface ResolveCtx { player: ID; now: number; location?: Tag; tags?: Tag[];
                       extra?: Record<string, unknown> }
```

## 4. Предметы

```ts
interface ItemDef {                       // шаблон: content/items/*.json
  id: ID; name: string; itemType: 'tool'|'weapon'|'armor'|'shield'|'rod'|'consumable'
       |'seed'|'bait'|'fish'|'treasure'|'component';
  subType?: string;                      // 'pickaxe' | 'hoe' | 'wateringCan' ...
  rarity: Rarity; basePrice: number;
  baseStats?: Partial<Record<StatId, number>>;   // БАЗА (П2: не мутируется)
  modSlots?: { budgetBase: number; tags: Tag[] }; // предмет может принять ривен-роллы (M03)
  stackable?: boolean; maxStack?: number;
  durabilityMax?: number;                // только tool/weapon/armor/shield/rod
  useAction?: { effects: UseEffect[] };  // для consumable: еда, зелья
  requirements?: Requirement[];          // гейты использования
  unlock?: Requirement;                  // видимость в каталогах
}

interface ItemInstance {                 // экземпляр в инвентаре
  iid: ID; defId: ID; qty: number;
  quality: { tier: QualityTier; value: number };  // value 0..100 — дробная часть тира
  sharpeningLevel: number;               // 0..∞ (M10)
  rolledMods: RolledMod[];                // ривен-роллы: стартовые + карточки заточки (M03)
  frozenCards?: Record<number, ID>;      // карточки «замороженных» откатом уровней (M10)
  durability?: { current: number; max: number };
}

interface UseEffect =
  | { t: 'grantEnergy'; value: number }
  | { t: 'grantHp'; value: number }
  | { t: 'modifier'; mod: Modifier };     // временный баф: '...скорость роста на 10 мин'
```

## 5. Ривен-конструктор (M03) — типы

```ts
interface ModTypeDef {                    // реестр типов характеристик: content/mods/*.json
  id: ID;                                // 'oreYield' | 'growthSpeed' | 'atk' | 'blockSense'...
  stat: StatId;                          // на какую шину ложится
  scopeTags: Tag[];                      // к каким категориям предметов применим
  maxPositive: number; maxNegative: number;
  costWeight: number;                    // вес в бюджете
  curve?: 'linear'|'soft'|'steep';       // форма стоимости между min и max
}

interface RolledMod { type: ID; value: number; from: 'initial'|'forge'; forgeLevel?: number }

interface ModBudgetRule {                // content/balance/modforge.ts
  byRarity: Record<Rarity, { budget: number; positives: [number, number];
                             negChance: number }>;   // common: 10 / [1,1] / 0 ...
  negativeRefund: number;                // ~1.25: дебаф возвращает в бюджет больше своей стоимости
  forgeBudgetPerLevel: number;           // бюджет карточки уровня заточки
}
```

## 6. Сельское хозяйство и вода

```ts
interface CropDef { id: ID; name: string; growHours: number; seedDef: ID;
  yields: { defId: ID; minQty: number; maxQty: number }[]; seedPrice: number;
  replantable?: boolean; allowedTabs: Tag[]; weedRiskMult?: number; unlock?: Requirement }
interface FarmTab { id: ID; kind: 'field'|'mushroom'|'vineyard'|'greenhouse'; tiles: FarmTile[] }
interface FarmTile { index: number; state: 'empty'|'plowed'|'growing'|'ready';
  cropId?: ID; plantedAt?: number; grownAt?: number; wateredUntil?: number;
  weeds: number;           // 0..3 стадии
  fertilized?: boolean }
interface AnimalDef { id: ID; name: string; price: number;
  produce: { defId: ID; periodHours: number; qty: number }; produceNeeds?: { satiety: number; health: number };
  unlock?: Requirement }
interface AnimalInstance { speciesId: ID; quality: QualityTier; happiness: number;
  satiety: number; health: number; nextProduceAt?: number }
interface FishDef { id: ID; name: string; rarity: Rarity; weight: number;  // вес в таблице
  biteSeconds: [number, number]; conditions?: Condition[];    // гейты: наживка, удочка, ачивка
  lakeRequirements?: { tempMin: number; tempMax: number; cleanlinessMin: number } }
interface LakeSlot { fishId?: ID; quality?: QualityTier; fedAt?: number; sick: boolean; bornAt?: number }
```

## 7. Шахта и бой

```ts
interface MobDef { id: ID; name: string; hpBase: number; atk: number; def: number;
  attackDirs: ['top'|'mid'|'bottom', ('top'|'mid'|'bottom')][]; // паттерны атак по раундам
  tags: Tag[]; drops: { defId: ID; weight: number; qty: [number, number] }[];
  eliteMods?: Tag[]; boss?: boolean }
interface HelperDef { id: ID; name: string; classId: 'shieldbearer'|'spearman'|'medic'|'looter'|'scout';
  rarity: Rarity; salaryPerDay: number; shareOfLoot: number; atk: number; hp: number;
  traits: RolledMod[]; fears: Condition[] }
interface MineCardDef { id: ID; kind: 'empty'|'oreVein'|'chest'|'collapse'|'mob'|'boss'
  |'altar'|'spring'|'campfire'|'trader'|'camp'|'exit';
  hidden: boolean; weight: number; payload?: unknown; unlock?: Requirement }
interface MineRun { runId: ID; layer: number; column: number; cards: MineCardDef[];
  runBag: { defId: ID; qty: number }[]; torches: number; hp: number;
  helpers: { instanceId: ID; status: Tag[] }[] }
```

## 8. Экономика и деревня

```ts
interface RecipeDef { id: ID; station: 'workbench'|'smelter'|'anvil'|'tannery'|'loom'|'kitchen'|'alchemy';
  inputs: { defId: ID; qty: number }[]; output: { defId: ID; qty: number };
  energyCost: number; craftSeconds?: number; unlock?: Requirement }
interface VillagerDef { id: ID; name: string; profession: string;
  needs: { daily?: { defId: ID; qty: number }[]; weekly?: { defId: ID; qty: number }[] };
  unlock?: Requirement }
interface BuildingDef { id: ID; name: string; costs: { defId: ID; qty: number }[];
  buildSeconds: number; effects: Modifier[]; requiresLevel: number }
interface TradePartnerDef { id: ID; name: string; goodsPool: ID[];
  unlock: Requirement }
interface TradeContract { id: ID; partnerId: ID; want: { defId: ID; qty: number };
  priceMult: number; repReward: number }
```

## 9. Прогрессии

```ts
interface SkillDef { id: ID; name: string; xpSources: Tag[];      // по каким событиям растёт
  perkEvery: number; perks: { atLevel: number; mods: Modifier[] }[] }
interface PassiveNodeDef { id: ID; name: string; kind: 'small'|'notable'|'keystone';
  mods: Modifier[]; links: ID[]; pos: { x: number; y: number }; cluster: Tag }
interface QuestDef { id: ID; kind: 'daily'|'weekly'|'chain'; steps: { id: ID;
  description: string; condition: Condition; rewards: Reward[] }[];
  nextChain?: ID; unlock?: Requirement }
interface AchievementDef { id: ID; name: string; condition: Condition;
  rewards?: Reward[]; unlockFlags?: string[]; hidden?: boolean }
type Reward = { t: 'currency'; id: CurrencyId; qty: number }
           | { t: 'item'; defId: ID; qty: number }
           | { t: 'passivePoint'; qty: number }
           | { t: 'flag'; flag: string }
           | { t: 'xp'; qty: number };
```

## 10. Работники

```ts
interface WorkerDef { id: ID; name: string; profession: 'farmer'|'fishkeeper'|'herdsman';
  stars: 1|2|3|4|5; salaryPerDay: number;
  checkPeriodHours: 2|4|6; care: 1|2|3|4|5;
  traits: RolledMod[];            // через ривен-конструктор (M03): «трудолюбивый −20% ЗП»
  toolRequirement?: { slot: Tag; minTier: QualityTier } }
interface WorkerInstance { defId: ID; mood: number; sickUntil?: number;
  assignedSystem?: ID; hiredAt: number }
```

## 11. Контент-реестр и валидация

- Все таблицы лежат в `content/**.json` (или `ts`-эквивалентах с `as const`), загружаются `content-registry.ts` и ВАЛИДИРУЮТСЯ zod-схемами при старте: битый контент = отказ загрузки с указанием файла/поля, а не «молчаливый NaN».
- `content/balance/` — отдельные конфиги по системам (`energy.ts`, `shop.ts`, `modforge.ts`, `forging.ts`, `economy.ts`) + `bases.ts` для всех base-значений статов. Имена файлов = имена модулей.
- Реестр содержит каталог статов: `bases: Record<StatId, number>` — единственное место, где живут базы (П2). Смотр недокументированного стата — исключение при старте.

## 12. Сид-рандом и версии

- `dailySeed(saveId, dateISO) = hash(...)`: магазин (M04), доска работников (M11), биржа (M16), daily-квесты (M15) — все ротации дня детерминированы.
- Контент версионируется полем `contentVersion` в реестре; сейв хранит версию — миграции данных при смене контента.
- Правило: любое поле любого интерфейса выше может расширяться, но не переименовываться (глоссарий). Удаление поля = миграция сейва.
