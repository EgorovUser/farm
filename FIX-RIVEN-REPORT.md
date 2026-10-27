# FIX-RIVEN — ОТЧЁТ СЕССИИ ПРАВКИ ШВА [QUESTION] №1

> Спец-строки M03 op 'flat' на нулевых базах + block_sense-повестка · 2026-10-27 · сеанс FIX-RIVEN
> (микро-бриф FIX-RIVEN; решение ратифицировано SESSION-M12.2 §0; вход модульного аудита M12)

**Шапка.** База-хеш на старте: `df127dd` (платформенный снапшот — FIXR-OBS-1) ← `b99b5bc`
(док-коммит M12.2-REPORT: ровно `M12.2-REPORT.md` + `worklog.md`) ← `51bd6dc` (код M12.2 ×27) ←
`0820a9d` (Initial, платформенная пересборка). Входной сейв: **`d5320306-5535-4a4a-997f-892cfd6af4f4`**
v15/19 (НОВЫЙ при пересборке браузера — бриф §3.4 допускает; витрины те же). Финал-вайп:
**`0de49a7b-861a-47a6-921e-b7c3f1de7504`** v15/19. Канон живых серий: **734/734 · групп 46 ·
combined md5 `71aa6ab57301971ce7092884b05b8552` — СТАБИЛЕН байт-в-байт** (легальная смена НЕ
потребовалась: счёт чеков не рос). Времена сессии: ~06:45–07:10 UTC 27.10.2026.

---

## 1. Старт-гейт (ДО первой правки; копипасты)

**Git-цепочка (п. 1).** Ожидание брифа: HEAD = док-коммит M12.2-REPORT ← `51bd6dc` ← `0820a9d`.
Факт: поверх док-коммита лежит ОДИН платформенный коммит:

```
$ git log --oneline -5
df127dd 395bf959-6af9-4a9e-a8c3-f5e8ac07c2d5
b99b5bc M12.2-REPORT + worklog: сеанс 2/2 закрыт (боссы/гейты/экономика/ачивки; 734/734, канон 71aa6ab5, kernel ПУСТ)
51bd6dc M12.2: боссы ×3 фазами + слои-гейты + экономика добычи + ачивки (G1–G10)
0820a9d Initial commit
```

`b99b5bc` = ровно 2 файла (`M12.2-REPORT.md` + `worklog.md`, 1465 вставок) — док-коммит каноничен.
`df127dd` — платформенный снапшот ВСЕГО рабочего дерева (598 файлов, 92022 вставок, UUID-сообщение,
+66 секунд после док-коммита): добавлены ранее неверсированные файлы (src/ целиком, .zscripts,
tool-results, конфиги) — **FIXR-OBS-1, класс платформенной пересборки M122-OBS-2**. История НЕ
переписана: ожидаемая цепочка цела как предки; класс расхождения — НЕ «переписывание» → СТОП не
требуется, сверка КАНОНОМ (п. 3 — совпал байт-в-байт). Рабочее дерево на старте чисто.

**git fetch origin (п. 2).**

```
$ git fetch origin
fatal: 'origin' does not appear to be a git repository
fatal: Could not read from remote repository.
```

Remote `origin` не настроен вовсе — **FIXR-OBS-2** (уведомление, не блокер: push — пользовательская
операция; факт записан).

**Selftest ×2+ (п. 3).**

```
$ bun scripts/selftest.ts   (×3: два старт-гейтовых + контрольный)
ИТОГ: 734/734 проверок зелёные          (×3)
$ bun scripts/selftest.ts | md5sum      (×2)
71aa6ab57301971ce7092884b05b8552  -     (×2, байт-в-байт)
групп: 46 (счёт строк OK)
```

Канон M12.2 `71aa6ab57301971ce7092884b05b8552` подтверждён ДО правок — платформенный снапшот
код не менял (сверка целостности канон-мд5, прецедент M122-OBS-2).

**tsc 0 по `src/` + lint 0 (явной строкой):**

```
$ bunx tsc --noEmit --project tsconfig.json | grep -cE '^src/'
0
$ bun run lint; echo $?
$ eslint .
LINT EXIT CODE: 0
```

(ошибки tsc только в `examples/` и `skills/` — вне `src/`, вне объёма.)

**Браузерный входной снимок (п. 3, ДО первой правки; saveId НОВЫЙ — пересборка, FIXR-OBS-4):**

```
❯save info
Сейф → Сейв
 версия формата: 15
 saveId: d5320306-5535-4a4a-997f-892cfd6af4f4
 контент: 0.1.0-phase0
 хранилище: indexeddb
 срезы (19): craft, farm, fishing, forge, inventory, kernel.buff, kernel.clock,
 kernel.pity, kernel.stash, kernel.stats, kernel.wallet, lake, mine, modforge,
 pen, player, quests, shop, workers
❯mine state
Шахта — статы среза (mine.state)
 боёв 0 · убито мобов 0 · боссов 0 · смертей 0
❯workers list
Работники: 0/3 (лимит = объектам) · зарплаты 0з/день
 никого не нанято — доска: workers board
 объекты (3): [ ] Ферма «Поле» · [ ] Озеро №1 · [ ] Загон №1
❯tasks
Реестр задач (15)
❯registry
Модули (13) — манифесты M01–M15, монтаж по ROADMAP
 M12 Шахта mine v1.1.0 ✓ api 6 события 3+/ 0− провайдеры 0 исполнители 0 срез mine
 Шины ядра (81 статов · 43 событий манифестов) · EventBus живых подписок 90 по 35 именам
 Команды консоли (133) · Контент-таблицы (51)
❯save now → сейв записан
```

pageerror 0 (errors пуст). `b75a7d2d…` из брифа утрачен пересборкой — вход НОВЫЙ, допущено §3.4.

**Git-статус старта (п. 4):** рабочее дерево чисто; незаявленных артефактов среды НЕТ (untracked
пуст — платформенный снапшот уже включил всё дерево в df127dd).

**Вердикт старт-гейта: ЗЕЛЁНЫЙ** (п. 2 — уведомление). Правки начаты.

---

## 2. Правки пофайлово (диффы копипастой)

Объём: **5 файлов, +72/−12** — строго §2.1/§2.2/§2.3. Ничего сверх.

### 2.1 (сердце фикса) `src/game/modules/inventory/provider.ts` + вайринг `…/inventory/module.ts`

**Kernel-дифф = ПУСТ копипастой:**

```
$ git diff src/kernel/ | wc -c
0
```

СЕДЬМАЯ заморозка цела: миграций НЕТ, SAVE_VERSION 15, v15/19 без bump, формат сейва не менялся
(поведение, не схема).

**provider.ts** (D31-шов ~88: rolledMods — при нулевой ПРЕД-БАЗЕ целевого стата (дата-база
слияния 'bases' + флэты baseStats экипированных носителей — ровно то, на что умножал бы inc шины)
строка действует как flat-прибавление процентных пунктов; выбор семантики ПО ДАННЫМ, не хардкод
имён; прецедент — [DECISION] удач M01 `content/player/skills.ts`: «нулевая база → 'flat'»):

```diff
+ * [FIX-RIVEN · FX1 · [QUESTION] №1] НУЛЕВАЯ пред-база → flat-катализ: ривен-
+ * строка, чей целевой стат на пред-базе 0 (дата-база 'bases' + флэты baseStats
+ * экипированных носителей — ровно то, на что умножал бы inc), действует как
+ * flat-прибавление ПРОЦЕНТНЫХ ПУНКТОВ (0 × 1.2 = 0 — инертность снята):
+ * «Вещий удар» +20 → resolve combat.prophetic = 20 (вещий 20%); движок M12
+ * читает resolve КАК КАНОНИРОВАНО. Выбор семантики — по данным (нулевая
+ * пред-база → flat), НЕ хардкод имён строк (прецедент [DECISION] удач M01:
+ * content/player/skills.ts — перки на нулевых базах дают 'flat'). Обычные
+ * строки (ненулевая пред-база: attack 5+12, def 0+6, …) — inc, D31 цел
+ * (оракул отрицания: 17 × 1.25 = 21.25 → 21).
```

```diff
 export interface EquipmentProviderDeps {
   getState(): InventoryState;
   tryItem(defId: ID): ItemDef | undefined;
   mods: readonly ModTypeDef[];
   /** [M10.1 · шов §4.5] множитель базы от заточки (forge.statScale); дефолт 1 */
   statScaleOf?(iid: ID): number;
+  /** [FIX-RIVEN · FX1] дата-база стата из слияния 'bases' (П2 — данные,
+  *  не мутируются). Без вайринга — 0 (пред-база = флэты носителей; инвариант
+  *  прежнего поведения для статов без дата-базы). */
+  baseOf?(stat: StatId): number;
 }
```

```diff
     const out: Modifier[] = [];
+    // [FIX-RIVEN · FX1] накопитель флэтов baseStats по ЭТОМУ стату: пред-база
+    // для выбора inc/flat у rolledMods (ровно то, на что умножал бы inc шины)
+    let carrierFlats = 0;
+    // отложенные ривен-строки: оп семантики решается ПОСЛЕ подсчёта пред-базы
+    const deferred: Array<{ iid: ID; type: ID; value: number }> = [];
     for (const entry of state.items) {
       […гейты D22/def — без изменений…]
       for (const [statId, value] of Object.entries(def.baseStats ?? {})) {
         if (statId !== stat || typeof value !== 'number' || !Number.isFinite(value)) continue;
         const scale = this.deps.statScaleOf ? this.deps.statScaleOf(entry.iid) : 1;
-        out.push({ […]
-          value: value * (Number.isFinite(scale) && scale > 0 ? scale : 1),
+        const scaled = value * (Number.isFinite(scale) && scale > 0 ? scale : 1);
+        carrierFlats += scaled;
+        out.push({ […]
+          value: scaled,
         });
       }
       for (const rm of interpretRolledMods(entry.rolledMods)) {
         const modDef = this.modsById.get(rm.type);
         if (!modDef || modDef.stat !== stat) continue;
-        out.push({
-          id: `item.${entry.iid}.roll.${rm.type}`,
-          source: { kind: 'item', refId: entry.iid },
-          stat: modDef.stat,
-          op: 'inc',
-          value: rm.value,
-        });
+        deferred.push({ iid: entry.iid, type: rm.type, value: rm.value });
       }
     }
+    // [FIX-RIVEN · FX1] нулевая пред-база (дата-база + флэты носителей) →
+    // flat-прибавление процентных пунктов; иначе — inc (D31 цел)
+    const preBase = (this.deps.baseOf ? this.deps.baseOf(stat) : 0) + carrierFlats;
+    const rollOp = preBase === 0 ? 'flat' : 'inc';
+    for (const d of deferred) {
+      out.push({
+        id: `item.${d.iid}.roll.${d.type}`,
+        source: { kind: 'item', refId: d.iid },
+        stat,
+        op: rollOp,
+        value: d.value,
+      });
+    }
     return out;
```

**module.ts** (вайринг baseOf из слияния 'bases' — числа в content, П2; ContentRegistry и есть
BaseSource шины, 'bases' зарегистрирован до активации модулей):

```diff
 import type { GameModule, ModuleContext } from '@/game/module-registry';
 import type { InventoryTable } from '@/content/balance/inventory';
+import type { BasesTable } from '@/content/balance/bases';
[…]
-import type { ID, QualityTier } from '@/shared/types/ids';
+import type { ID, QualityTier, StatId } from '@/shared/types/ids';
[…]
     // [M02.2] провайдер модификаторов экипировки (карточка §5): регистрация
-    // по манифесту modifierProviders (DEBT-8 — самоподключение до авто-монтажа)
+    // по манифесту modifierProviders (DEBT-8 — самоподключение до авто-монтажа).
+    // [FIX-RIVEN · FX1] baseOf — дата-база стата из слияния 'bases' (П2):
+    // нулевая пред-база → провайдер каталитирует rolledMods как flat
+    const basesTable = content.get<BasesTable>('bases');
     const provider = new EquipmentProvider({
       getState: () => store.getState(),
       tryItem,
       mods,
+      ...(basesTable ? { baseOf: (stat: StatId) => basesTable.bases[stat] ?? 0 } : {}),
       ...(this.moduleDeps.statScaleOf ? { statScaleOf: this.moduleDeps.statScaleOf } : {}),
     });
```

### 2.2 (та же природа) `src/content/balance/forging.ts` — маркировка flat-семантики в ДАННЫХ

```diff
     // [M10.2] статы особых карточных свойств (реестр M03 ссылается на базы —
     // инвариант «stat только на существующие базы»); потребители — M12+
+    // [FIX-RIVEN · FX1 · [QUESTION] №1] НУЛЕВЫЕ базы = метка flat-семантики:
+    // ривен-строки на нулевой пред-базе провайдер M02 каталитирует как
+    // op 'flat' — прибавление ПРОЦЕНТНЫХ ПУНКТОВ по значению строки реестра
+    // («Вещий удар» +20 → resolve combat.prophetic = 20, вещий 20%; движок
+    // M12 читает resolve как канонировано — без правок боя). Числа строк —
+    // реестр M03 (content/mods/registry.ts; канон «числа в content»);
+    // прецедент семантики — [DECISION] удач M01 (content/player/skills.ts:
+    // нулевая база → 'flat'). Ненулевые пред-базы (attack/def/…) — inc, D31.
     'combat.prophetic': 0,
     'mine.oreSense': 0,
     'combat.lifesteal': 0,
```

Числа строк — в реестре M03 (maxPositive 20/15/10 — канон); сами нулевые базы не менялись
(комментарий-маркировка контракта в месте объявления данных).

### 2.2 [DECISION]-слот FX2 — block_sense (`src/content/mods/registry.ts`)

**РЕШЕНИЕ (заявлено открыто): ВЫВОД `block_sense`-строки из пула живых роллов.**
Обоснование ПО ДАННЫМ M03-реестра на месте: (а) единственный щит каталога — buckler — НЕ имеет
modSlots (прецедент «[DECISION] БЕЗ ривен-слотов», catalog-gear.ts) → скоуп 'shield' живыми
роллами НЕ запрашивается — строка и так не роллится; (б) чутьё щита в M12 потребляется
тир-формулой (MINE_TABLE.block.sensePerTier 5% × (тир−1)), НЕ combat.block — замок M12 брифа §4
не тронут; (в) плоская семантика ОТВЕРГНУТА: пред-база щита 4 ≠ 0 — стат-драйвенное правило FX1
даёт inc (4 × 1.12 = 4.48 → 4), плоская потребовала бы ХАРДКОДА имени строки — прямо запрещено
FX1 («НЕ хардкод имён»). Строка СОХРАНЕНА в реестре как данные канала combat.block для будущих
тиров щитов со слотами; витрина-оракул — §4.3.

```diff
   {
+    // [FIX-RIVEN · FX2 · DECISION] ВЫВОД из пула живых роллов — по данным
+    // этого реестра: единственный щит (buckler) НЕ имеет modSlots (прецедент
+    // «БЕЗ ривен-слотов»), скоуп 'shield' не запрашивается роллами — строка
+    // не роллится в живой генерации. Чутьё щита в M12 — тир-формула
+    // (MINE_TABLE.block.sensePerTier), НЕ combat.block (замок M12 брифа
+    // FIX-RIVEN §4). Плоская семантика НЕ выбрана: пред-база щита 4 ≠ 0 —
+    // стат-драйвенное правило FX1 даёт inc (4 × 1.12 = 4.48 → 4), плоская
+    // потребовала бы хардкода имени строки (запрещён FX1). Строка сохранена
+    // как данные канала combat.block для будущих тиров щитов со слотами.
     id: 'block_sense',
     stat: 'combat.block',
     scopeTags: ['shield'],
     maxPositive: 12,
     maxNegative: 0,
     costWeight: 9,
     curve: 'linear',
   },
```

### 2.3 чек-расширение `src/selfchecks/inventory-equip-checks.ts` (тело существующего чека)

Расширено тело чека-владельца шва D31 — «провайдер rolledMods → inc (D31)» (группа
«M02 · Экипировка, провайдер и гейты (часть 2)» — заявлено открыто: это ЕДИНСТВЕННЫЙ чек
применения rolledMods через провайдер; M03-группы modforge-* проверяют движок роллов, а не
применение — дублировать экип-фикстуру в них значило бы раздуть объём микросеанса). Счёт чеков
НЕ вырос — расширено ТЕЛО (условие), слот results.push прежний:

```diff
   const stamp = f2.api['inventory.mod'](swIid, 'atk_power', 25) as R<{ type: string; value: number }>;
   const withRoll = resolveAttack(f2); // 17 × (1 + 25/100) = 21.25 → round 21
+  // [FIX-RIVEN · FX3] тело чека расширено (счёт чеков НЕ растёт): (б) оракул
+  // отрицания — обычная строка на ненулевой пред-базе → inc D31 цел;
+  // (а) оракул катализа — спец-строка «Вещий удар» на НУЛЕВОЙ пред-базе
+  // (combat.prophetic: база 0, носитель меч не даёт флэтов) → flat-пункты
+  const propheticOf = () =>
+    f2.game.statBus.resolve({ stat: 'combat.prophetic', ctx: f2.game.time.ctx('player') });
+  const propheticBefore = propheticOf(); // карточки нет — 0
+  const stampProphetic = f2.api['inventory.mod'](swIid, 'prophetic_strike', 20) as R<unknown>;
+  const propheticAfter = propheticOf(); // 0 + flat 20 = 20 (вещий 20%)
   results.push(
-    check('провайдер rolledMods → inc (D31): 17 × 1.25 = 21.25 → 21', () =>
-      stamp.ok && withRoll === 21),
+    check('провайдер rolledMods → inc (D31): 17 × 1.25 = 21.25 → 21; [FIX-RIVEN] нулевая пред-база → flat: вещий 0 → 20', () =>
+      stamp.ok && withRoll === 21 && stampProphetic.ok && propheticBefore === 0 && propheticAfter === 20),
   );
```

---

## 3. Гигиена после правок (явной строкой)

```
$ bunx tsc --noEmit --project tsconfig.json | grep -cE '^src/'
0
$ bun run lint; echo $?
LINT EXIT CODE: 0        (вывод пуст)
$ git diff src/kernel/ | wc -c
0                        (kernel ПУСТ — СЕДЬМАЯ заморозка)
```

---

## 4. Живые пробы §5 (копипасты всего)

### 4.1 Сердце фикса — карточка «Вещий удар» на нулевой базе

Сетап: `give iron_sword 1` (D 12.6, iron_sword#1) → `xp add 1500` (уровень 8) →
`inv equip iron_sword#1 weapon`. **До карточки** (пустой ривен-канал):

```
❯resolve combat.prophetic
combat.prophetic = 0
 база: 0
 ctx: уровень 8
 модификаторы: нет
```

Штамп карточки + оракул (трасса показывает op flat — «плоско»):

```
❯inv mod iron_sword#1 prophetic_strike 20
штамп мода: prophetic_strike +20 → iron_sword#1 (from: initial)
❯resolve combat.prophetic
combat.prophetic = 20
 база: 0
 ctx: уровень 8
 модификаторы:
 ✓ item.iron_sword#1.roll.prophetic_strike + плоско 20 [item:iron_sword#1]
 шаги:
 → база: 0
 → + flat ×1: 20
```

**Вещий 20%** (до фикса — 0 × 1.2 = 0). Аналогичные оракулы «Рудного чутья» и «Кровопийцы»
(по своим строкам реестра: maxPositive 15 / 10):

```
❯inv mod iron_sword#1 ore_sense 15
штамп мода: ore_sense +15 → iron_sword#1 (from: initial)
❯resolve mine.oreSense
mine.oreSense = 15
 база: 0 · ✓ item.iron_sword#1.roll.ore_sense + плоско 15 · шаги: база 0 → + flat ×1: 15
❯inv mod iron_sword#1 vampiric 10
штамп мода: vampiric +10 → iron_sword#1 (from: initial)
❯resolve combat.lifesteal
combat.lifesteal = 10
 база: 0 · ✓ item.iron_sword#1.roll.vampiric + плоско 10 · шаги: база 0 → + flat ×1: 10
```

**Живой бой (движок M12 читает resolve КАК КАНОНИРОВАНО, без правок боя).** Мета-строка боя
несёт «вещий удар 20%»; сид-охота дала ВЕЩИЙ раунд (канон M12.1 F4):

```
❯mine fight spider 1 --seed riven3
Бой: Паук (слой 1) · врагов 1 (HP 30), игрок: HP 35/85 · атака 17 · защита 0 · скорость 10 · щита нет — блок невозможен · вещий удар 20%
 Р1 · Паук бьёт центр — ВЕЩИЙ (направление увидено) → без щита −6 (HP 29/85)
 Р2 · игрок бьёт низ → Паук: −17 (HP 13/30)
 Р3 · Паук бьёт центр — ВЕЩИЙ (направление увидено) → без щита −6 (HP 23/85)
 Р4 · игрок бьёт центр → Паук: −17 (HP 0/30)
ПОБЕДА за 4 раундов · HP игрока 23/85 · добыча: 3з + copper_ore ×1 (транзакция mine.loot, событие mine.enemyKilled)
```

Со щитом — полный канон F4 «вещий блок» (blockDir := attackDir, ОТБИТО):

```
❯mine fight spider 1 --seed fxb2   (баклер экипирован)
Бой: Паук (слой 1) · … игрок: HP 11/90 · атака 21 · защита 0 · скорость 10 · щит есть (чутьё 0%) · вещий удар 20%
 Р1 · Паук бьёт верх — ВЕЩИЙ (направление увидено) → блок верх (вещий блок) — ОТБИТО (HP 11/90)
 Р2 · игрок бьёт центр → Паук: −21 (HP 9/30)
 Р3 · Паук бьёт низ → блок центр — мимо −6 (HP 5/90)
 Р4 · игрок бьёт верх → Паук: −21 (HP 0/30)
ПОБЕДА за 4 раундов · HP игрока 5/90 · добыча: 5з + copper_ore…
```

«чутьё 0%» в мета-строке — тир-формула M12 (баклер D = тир 1 → 5% × 0) — потребление M12 не
тронуто (замок §4); «вещий удар 20%» — починенный ривен-канал.

### 4.2 Оракул отрицания (D31 цел) + канал ядра

Обычная ривен-строка на НЕнулевой пред-базе — inc-поведение прежнее:

```
❯inv mod iron_sword#1 atk_power 25
штамп мода: atk_power +25 → iron_sword#1 (from: initial)
❯resolve combat.attack
combat.attack = 21
 база: 5
 модификаторы:
 ✓ item.iron_sword#1.base.combat.attack + плоско 12 [item:iron_sword#1]
 ✓ item.iron_sword#1.roll.atk_power + % (склад.) 25 [item:iron_sword#1]
 шаги:
 → база: 5
 → + flat ×1: 17
 → × inc +25%: 21.25
 → округление (round): 21
```

Канал ядра `mod add … flat` НЕ сломан — каналы компонуются:

```
❯mod add combat.prophetic flat 20 10m
баф debug.combat.prophetic.flat.ad9qn выдан: combat.prophetic flat 20 (на 10m)
❯resolve combat.prophetic
combat.prophetic = 40
 база: 0
 модификаторы:
 ✓ debug.combat.prophetic.flat.ad9qn + плоско 20 [buff:debug.console]
 ✓ item.iron_sword#1.roll.prophetic_strike + плоско 20 [item:iron_sword#1]
 шаги:
 → база: 0
 → + flat ×2: 40
```

(после пробы `mod clear` — баф снят; чистота дальнейших проб сохранена).

### 4.3 block_sense [DECISION]-слот FX2 — витрина-оракул

Сетап: `give buckler 1` (D 96.4, buckler#7) → `inv equip buckler#7 shield`. До штампа:

```
❯resolve combat.block
combat.block = 4
 база: 0 · шаги: → база: 0 → + flat ×1: 4        (флэт базы баклера)
```

После штампа block_sense +12 (inc на пред-базе щита 4 — инертность 4.48 → 4 задокументирована):

```
❯inv mod buckler#7 block_sense 12
штамп мода: block_sense +12 → buckler#7 (from: initial)
❯resolve combat.block
combat.block = 4
 база: 0
 модификаторы:
 ✓ item.buckler#7.base.combat.block + плоско 4 [item:buckler#7]
 ✓ item.buckler#7.roll.block_sense + % (склад.) 12 [item:buckler#7]
 шаги:
 → база: 0
 → + flat ×1: 4
 → × inc +12%: 4.48
 → округление (round): 4
```

Решение §2.2 заявлено открыто: ВЫВОД из пула живых роллов (щитов со слотами нет — строка не
роллится; плоская семантика отвергнута — хардкод имени). D31-inc на щите НЕ сломан (выше).

### 4.4 Регресс-минимум §5 SESSION-M12.2 (копипасты; цена фикса — ничего не сломано)

```
❯price iron_pickaxe   → basePrice: 120 × редкость 1.5 = base 180 · ПОКУПКА: 180 · ПРОДАЖА: 72 (ставка 40%)
❯price egg            → base 3 · ПОКУПКА: 2 (−35% скидка завоза [local]) · ПРОДАЖА: 1
❯price wool           → base 15 · ПОКУПКА: 15 · ПРОДАЖА: 6
❯price worm_bait      → base 2 · ПОКУПКА: 2 · ПРОДАЖА: 1
❯shop.stock           → Завоз 2026-10-27 · 18 позиций · магазин ур. 1 · Базовый ассортимент (6) +
                        Ролл 30% пула (12 · полки: только базовые)     (пул N=60, полки живы)
❯craft.list           → Рецепты крафта · 33 (workbench ×8 · smelter ×3 · anvil ×8 · tannery ×3 ·
                        loom ×3 · kitchen ×4 · alchemy ×4)
❯craft.stations       → Станции крафта · золото: 75 · полный список ×14 (workbench построена; …)
❯forge stats          → «укажите предмет: forge stats iron_sword#1 (inv list)» — честная причина;
❯forge stats iron_sword#1 → «предмет … не найден в рюкзаке (inv list)» — честно (экипирован, D30)
❯tasks                → Реестр задач (15)
❯fish.state           → Рыбалка · локация: пруд · забросов 0 · поймано 0 · удочка/наживка НЕ надеты ·
                        веса редкости: common 60.0 … mythic 0.1 · альбом пуст · магазин рыболова ×6
❯pen.state            → Загон · слоты 0/4 · животных 0 · склад пуст · навоз 0/30 · альпака замок M16
❯lake.state           → Озеро №1 · слоты 0/6 · вода: 15° · чистота 70/100 (дрейф -5/день)
❯save info            → версия формата: 15 · saveId d5320306… · хранилище: indexeddb · срезы (19)
❯inv list             → Инвентарь — слоты 8/20 (добыча боёв: руда/ткань) — живое
❯resolve player.inventory.slots → player.inventory.slots = 20 · база: 20 · модификаторов нет
❯counters sell        → счётчиков нет
❯stats show           → Счётчики ядра (5): achievements.unlocked.count 1 · items.acquired 13 ·
                        kernel.time.hours 1 · kernel.transactions.total 7 · player.deaths 3
❯flags list           → Флаги (1): player.level5
❯registry             → все 5 разделов: Модули (13; M12 mine v1.1.0 api 6 события 3+) · Шины
                        (81 статов · EventBus 90 по 35 · PriceBus 2 · RngBus 3) · Сервисы (17) ·
                        Команды консоли (133) · Контент-таблицы (51)
```

390×844 без переполнения: `scrollWidth 390 = clientWidth 390, overflowX: false`. pageerror 0
(errors пуст за всю сессию). hydration 0 НОВЫХ (1 варнинг Radix — переносной KNOWN-ISSUE-1,
~19% перезагрузок, pageerror 0; StatBus console.error «selfcheck.bad» — ожидаемый DEBT-13 из
проверки П5). dev.log: 0 «Module not found», ошибок нет.

---

## 5. Selftest ПОСЛЕ правок + канон-статус

```
$ bun scripts/selftest.ts   (×3 после правок)
ИТОГ: 734/734 проверок зелёные
$ bun scripts/selftest.ts | md5sum   (×2)
71aa6ab57301971ce7092884b05b8552  -
```

**Канон-статус: `71aa6ab57301971ce7092884b05b8552` СТАБИЛЕН** — легальная смена НЕ потребовалась:
счёт чеков НЕ рос (чек-расширение — тело существующего чека, слот прежний), имена групп не менялись,
все чеки зелёные → stdout байт-в-байт прежний. Цепочка канонов: 0728d01e → cf10e876 → f940eb60 →
d3817ac5 → 9e225145 → **71aa6ab5 (стабилен)**.

Разложение групп (хвост прогона): M08 Озеро 36/36 · M11 Работники 26/26 · M12 Шахта 30/30 ·
Реестр 7/7 — группы 46, Σ = 734. Браузерный selftest после правок: **734/734** («ИТОГ: 734/734
проверок зелёные — ядро, модули и правки FIX в норме»), pageerror 0.

---

## 6. Финал сессии — вайп + честная новая игра + git-статус

```
❯save wipe
сейв стёрт — автосейв остановлен; F5 начнёт новую игру (новый saveId = новые дневные роллы)
```

(reload →) «новая игра: выдан стартовый капитал 50 золота (kernel.newGame)». Post-wipe тишина:

```
❯save info → версия формата: 15 · saveId: 0de49a7b-861a-47a6-921e-b7c3f1de7504 · срезы (19) · indexeddb
❯mine state  → боёв 0 · убито мобов 0 · боссов 0 · смертей 0
❯workers list → Работники: 0/3 (лимит = объектам) · зарплаты 0з/день · никого не нанято
❯tasks        → Реестр задач (15)
❯selftest     → ИТОГ: 734/734 проверок зелёные — ядро, модули и правки FIX в норме
```

pageerror 0, overflowX false (390×844), `save now` — записан.

**Git-статус финала:**

```
$ git status --short
 M src/content/balance/forging.ts
 M src/content/mods/registry.ts
 M src/game/modules/inventory/module.ts
 M src/game/modules/inventory/provider.ts
 M src/selfchecks/inventory-equip-checks.ts
```

Ровно 5 файлов §2; untracked пуст (незаявленных артефактов среды НЕТ). Временные скрипты вне
дерева: `/tmp/lint-out.txt`, `/tmp/lint2.txt` (снимки lint-гигиены). Коммиты сессии (канон M12.2
«код → док»): **код-коммит `47b4a5b`** (ровно 5 файлов §2, +72/−12) ← док-коммит HEAD (ровно
`FIX-RIVEN-REPORT.md` + `worklog.md`).

---

## 7. Среда-примечания (серия FIXR-)

- **FIXR-OBS-1 (среда P3):** платформенный снапшот-коммит `df127dd` (UUID-сообщение, 598 файлов,
  вся рабочая дерево, +66с после док-коммита M12.2) поверх ожидаемого HEAD — класс платформенной
  пересборки M122-OBS-2; история НЕ переписана (цепочка b99b5bc ← 51bd6dc ← 0820a9d цела как
  предки); сверка целостности КАНОНОМ (md5 байт-в-байт до правок) — пройдена. В док-коммит НЕ
  входит (платформенный, не мой).
- **FIXR-OBS-2 (среда P3):** `git fetch origin` — remote 'origin' не настроен вовсе (fatal:
  'origin' does not appear to be a git repository). Уведомление, не блокер (бриф §3.2); push —
  пользовательская операция.
- **FIXR-OBS-3 (среда P3):** CDP-деградация ×1 при подаче `save wipe` (Accessibility.getFullAXTree
  timeout — класс M121-OBS-1/M111-OBS-4): первая подача НЕ прошла (find упал, Enter ушёл в пустое
  поле — вайп не исполнился, сейв жив), повтор после деградации успешен; все каноны проб сняты
  ДО вайпа, потерь нет; сам вайп верифицирован витринами post-wipe.
- **FIXR-OBS-4 (среда):** входной сейв НОВЫЙ `d5320306-…` (браузер пересобран, IndexedDB
  предыдущей сессии утрачен — класс M122-OBS-1/2); `b75a7d2d…` из брифа недоступен; бриф §3.4
  допускает НОВЫЙ при пересборке — витрины входа сняты те же (v15/19, mine 0/0/0/0, workers 0/3,
  tasks 15, registry 13).

Протокол несогласия НЕ активировался: ратифицированные решения FX1/FX3 исполнены буквально;
FX2-слот решён в заявленных границах (одно из двух, открыто, с витриной-оракулом).

---

## 8. Границы (исполнено буквально; §4 брифа)

kernel ПУСТ (0 байт диффа, СЕДЬМАЯ заморозка) · миграций НЕТ · SAVE_VERSION 15 / v15/19 без
bump · манифест без bump · M12-движок/мобы/боссы/гейты/ачивки/`content/mine/` НЕ тронуты (движок
читает resolve как канонировано — доказано живым боем §4.1) · M02-код — только провайдер шва
D31 + его вайринг (§2.1) · shop/полки/пул M04 N=60 НЕ тронуты · forging BAL-1 — только маркировка
спец-строк §2.2 (числа не менялись) · счётчики/ачивки/квесты/новые команды НЕ создавались ·
M13/M14/M16/M17/M18/UI — замки · регресс-минимум §5 SESSION-M12.2 — весь, копипастами §4.4 ·
«улучшения попутно» — НЕТ (дифф = ровно 5 файлов §2) · реролл-флак «M03 · C6» (M122-OBS-1) — НЕ
объём, UV-слот аудиту M12.

**Дальше (§7 брифа):** приёмка Task 67 (документарная машинная: чекер против брифа FIX-RIVEN +
M12.1-REPORT §7 + M12.2-REPORT §11 + маркеров карточки M12 §8) → бриф AUDIT-M12 «независимый
живой аудит модуля M12 ЦЕЛИКОМ (M12.1 + M12.2 + FIX-RIVEN)» (Task 68; входы: кассы Task 63
E1–E3/R1 и Task 65 E1–E4 + леджер M121-OBS-1…4 + M122-OBS-1…3 + FIX-RIVEN-статус + carried +
канон-мд5 71aa6ab5) → аудит → FIX по итогам → M12 ЗАКРЫТ → SESSION-M13 «Карточный рогалик +
помощники».
