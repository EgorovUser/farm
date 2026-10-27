# FIX-M11 — микро-сеанс правки MISS-1 аудита AUDIT-M11: проводка капа Домика (105) в load-путь

> 2026-10-26 · Кодинг-бот (среда проекта). Служебный отчёт по брифу FIX-M11 (§0–§7).
> База: HEAD `01ec2a3` = док-коммит AUDIT-M11-REPORT (ровно `AUDIT-M11-REPORT.md` + `worklog.md`,
> 2 files changed, 147 insertions — сверено `git show --stat`). Цепочка ниже базы = шапке
> AUDIT-M11-REPORT: `01ec2a3` ← `5aa7b50` ← `078516d` ← `d44a00b` ← `17fb83c` ← `d975146` ←
> `2a59def` ← `764cc9b` ← `2231100` ← `a17481a` ← `31cb5b2` ← `4683b2e` ← `42ac8a0` ← `64805d2`.
> Вход: живой сейв **v14/18**, saveId `04c82f3f-5120-4034-9a57-d344ee8ac69a` (НОВЫЙ — среда
> пересобрана, как у аудита; работники 0/3, Домик не куплен, хранилище indexeddb).
> Финал: честная новая игра `c4463807-c328-4a5b-91e7-c018b6f0c658` (v14/18, post-wipe тишина).
> Режим: живой, ОДИН дефект (MISS-1 P3) + чек-расширение. Менялось — строго §2 брифа.

---

## 1. Старт-гейт 5/5 (копипасты)

1. **git log / док-коммит**: HEAD `01ec2a33b3285d1b4ee22175d6fcc2ddf7f413f2`; `git show --stat 01ec2a3` →
   `AUDIT-M11-REPORT.md | 125 +++` + `worklog.md | 22 ++` = ровно 2 файла, платформенных артефактов сверху НЕТ.
   Дерево чисто (`git status` до правок — пусто). Расхождений класса «переписывание» нет.
2. **selftest ×2 байт-в-байт** (headless, до правок):
   ```
   ИТОГ: 697/697 проверок зелёные
   f940eb60c691ff0a4971f7372692d862  -   (форма stdout+stderr combined, прогон 1)
   f940eb60c691ff0a4971f7372692d862  -   (прогон 2)
   ```
   = канону выхода M11.2/аудита. Групп 44; «M11 Работники: 26/26».
3. **Браузерный входной снимок ДО первой правки** (страница перезагружена на коде базы):
   `ИТОГ: 697/697 проверок зелёные — ядро, модули и правки FIX в норме` · pageerror 0
   (единственный console.error — намеренный тест упавшего провайдера `selfcheck.bad` из
   stat-checks, входит в канон вывода). Витрины входа: `save info` → «версия формата: 14 ·
   saveId: 04c82f3f-5120-4034-9a57-d344ee8ac69a · срезы: 18 (craft, farm, fishing, forge,
   inventory, kernel.buff, kernel.clock, kernel.pity, kernel.stash, kernel.stats, kernel.wallet,
   lake, modforge, pen, player, quests, shop, workers)»; `workers list` → «Работники: 0/3 …
   никого не нанято»; `workers upgrades` → «[ ] Домик работников (upg_worker_house) · 300з».
4. **tsc 0 по `src/` + lint 0** (явной строкой): `bunx tsc --noEmit -p tsconfig.json | grep -c "^src/"` →
   **0** (остаточные ошибки только в `examples/` — окружение, существовали до правки);
   `bun run lint` → вывод пуст, **0 ошибок/warnings**.
5. **Вход живой**: п.3 (saveId полный, v14/18, витрины сняты).

Красных пунктов нет (fetch origin не выполнялся — уведомление; push — пользовательская операция).

## 2. Правки пофайлово (строго §2; 6 файлов, +116/−21)

### 2.1 (P3 — закрывает MISS-1) `src/game/modules/workers/state.ts` (225 строк)

ЕДИНАЯ точка капа (FX1) — чистая функция в state.ts (лист модуля: только type-импорты прежде,
теперь + два ЗНАЧЕНИЯ контента; циклов нет — content не импортирует game). Числа НЕ хардкодятся:
базовый кап из `WORKERS_TABLE.mood.max`, прирост из `WORKER_UPGRADES` (деф с эффектом `house`).

```diff
 import type { WorkerObjectId, WorkerProfession } from '@/content/workers/table';
+import { WORKERS_TABLE } from '@/content/workers/table';
+import type { WorkerUpgradeDef } from '@/content/workers/upgrades';
+import { WORKER_UPGRADES } from '@/content/workers/upgrades';
+
+/** [FIX-M11 · FX1] ЕДИНАЯ точка капа настроения (MISS-1 аудита AUDIT-M11):
+ *  кап вычисляется ИЗ ДАННЫХ — владение улучшением «Домик» (деф с эффектом
+ *  house, upg_worker_house) в срезе `upgrades?` → базовый кап таблицы
+ *  (mood.max) + прирост из content/workers upgrades-дефов (Домик +5 → 105).
+ *  Числа НЕ хардкодятся в логике (канон «числа в content»). Читают ОДНУ
+ *  точку: sanitize load-пути (срез сам содержит upgrades? — доступно в
+ *  sanitize(data), аудит §9 п.1), премия bonus (hire) и moodSet (dev);
+ *  dayPass уже клэмпит к moodCap — FX1 её НЕ меняет, переиспользует. */
+export function moodCapOf(
+  state: Pick<WorkersState, 'upgrades'>,
+  table: WorkersTable = WORKERS_TABLE,
+  defs: readonly WorkerUpgradeDef[] = WORKER_UPGRADES,
+): number {
+  const owned = state.upgrades ?? [];
+  const house = defs.find((u) => u.effect.t === 'house' && owned.includes(u.id));
+  return table.mood.max + (house && house.effect.t === 'house' ? house.effect.moodCapBonus : 0);
+}
```

Клэмп sanitize (та самая строка ~151 из §8 аудита) — граница из данных входящего среза:

```diff
-function sanitizeWorker(raw: unknown): WorkerInstance | null {
+function sanitizeWorker(raw: unknown, moodCap: number): WorkerInstance | null {
…
     object: w.object,
-    mood: Math.min(100, Math.max(0, num(w.mood, 50))),
+    // [FIX-M11 · MISS-1] верхняя граница = капу Домика из ДАННЫХ среза
+    // (moodCapOf, FX1): load/import перестаёт срезать легальное живое
+    // состояние 101–105 (с Домиком); без Домика клэмп к базовому 100 жив
+    mood: Math.min(moodCap, Math.max(0, num(w.mood, 50))),
…
-  const seen = new Set<string>();
-  const hired = s.hired
-    .map(sanitizeWorker)
-    .filter((w): w is WorkerInstance => w !== null && !seen.has(w.defId) && seen.add(w.defId) !== undefined);
   const upgrades = Array.isArray(s.upgrades)
     ? s.upgrades.filter((u): u is string => typeof u === 'string' && u.length > 0)
     : [];
+  // [FIX-M11 · MISS-1] кап load-пути — из владения Домиком в САМОМ срезе
+  // (upgrades? уже распарсен выше): 101–105 легальны при Домике (105),
+  // без Домика — базовый кап 100 (оракул отрицания)
+  const moodCap = moodCapOf({ upgrades });
+  const seen = new Set<string>();
+  const hired = s.hired
+    .map((w) => sanitizeWorker(w, moodCap))
+    .filter((w): w is WorkerInstance => w !== null && !seen.has(w.defId) && seen.add(w.defId) !== undefined);
```

Миграций НЕТ; срез-схема без изменений (поведение load-пути, не схема); нижняя граница 0
(table.mood.min) не тронута — дифф минимален по §2.1. Существующая точка dayPass НЕ менялась.

### 2.2 Три сопутствующие проводки (та же природа, §8 аудита)

**`src/game/modules/workers/upgrades.ts` (142)** — метод `WorkersUpgrades.moodCapOf()` делегирует
единой точке (иначе точек стало бы две — нарушение FX1):

```diff
+import { moodCapOf } from './state';
…
-  /** Домик: кап настроения (базовый кап + бонус; без Домика — таблица) */
+  /** Домик: кап настроения (базовый кап + бонус; без Домика — таблица).
+   *  [FIX-M11 · FX1] делегирует ЕДИНОЙ точке moodCapOf(state) из state.ts —
+   *  те же ДАННЫЕ (владение upgrades? + прирост из content/workers), что и
+   *  sanitize load-пути / бонус / moodSet: расхождение капов невозможно */
   moodCapOf(): number {
-    const house = this.d.upgradesDefs.find((u) => u.effect.t === 'house' && this.has(u.id));
-    return this.d.table.mood.max + (house && house.effect.t === 'house' ? house.effect.moodCapBonus : 0);
+    return moodCapOf(this.d.getState(), this.d.table, this.d.upgradesDefs);
   }
```

Вызывающие точки module.ts (dayPass-депсы + витрина знаменателя) НЕ изменились — сигнатура метода та же.

**`src/game/modules/workers/hire.ts` (211)** — премия с капом (§2.2 п.1: mood 96 + 10 → 105, не 100):

```diff
-import { canonicalWorker, isSick } from './state';
+import { canonicalWorker, isSick, moodCapOf } from './state';
…
-    const next = withMood({ ...w, lastBonusAt: now }, this.d.table.mood.bonus, this.d.table);
+    // [FIX-M11 · FX2] премия — с капом из ДАННЫХ (единая точка moodCapOf):
+    // с Домиком mood 96 + 10 → 105 (не обрезается на 100)
+    const next = withMood(
+      { ...w, lastBonusAt: now },
+      this.d.table.mood.bonus,
+      this.d.table,
+      moodCapOf(state, this.d.table),
+    );
```

**`src/game/modules/workers/dev.ts` (57)** — moodSet-валидация ≤ капу (§2.2 п.2):

```diff
+import { moodCapOf } from './state';
…
-  /** dev: установка настроения (кулдауны/болезни не трогаются) */
+  /** dev: установка настроения (кулдауны/болезни не трогаются).
+   *  [FIX-M11 · FX2] валидация ≤ капу из ДАННЫХ (единая точка moodCapOf):
+   *  при живом Домике 101–105 легальны (кап 105); 106 — отказ; без
+   *  Домика кап 100 → 101 — отказ; withMood — с тем же капом (иначе
+   *  принятые 103 срезались бы при записи) */
   moodSet(idx: number, value: number): Result<{ idx: number; mood: number }> {
     const state = this.d.getState();
     const w = state.hired[idx];
     if (!w) return err(`работник №${idx} не найден (workers list — витрина)`);
-    if (!Number.isFinite(value) || value < this.d.table.mood.min || value > this.d.table.mood.max) {
-      return err(`настроение: целое ${this.d.table.mood.min}..${this.d.table.mood.max}`);
+    const moodCap = moodCapOf(state, this.d.table);
+    if (!Number.isFinite(value) || value < this.d.table.mood.min || value > moodCap) {
+      return err(`настроение: целое ${this.d.table.mood.min}..${moodCap}`);
     }
-    const next = withMood(w, Math.round(value) - w.mood, this.d.table);
+    const next = withMood(w, Math.round(value) - w.mood, this.d.table, moodCap);
```

**Заявленное следствие §2.2 (открыто, НЕ молчаливо)**: проводка moodSet потребовала двух точек
сверх буквального перечня §8 аудита — (а) `withMood` с капом в той же функции (иначе валидация
приняла бы 103, а запись срезала бы до 100 — витрина приёмки §5.4 «103/105» невыполнима);
(б) принт ответа mood set знаменателем из витрины (иначе копипаста приёмки самопротиворечива
«103/100» — та же унификация, что предписана принту bonus). Природа та же — неполная проводка
капа; обе точки — тело той самой команды, валидацию которой меняет §2.2.

**`src/debug/commands-workers.ts` (256)** — принты знаменателем из витрины (§2.2 п.3 + заявленное
следствие для mood set):

```diff
       if (sub === 'bonus') {
…
         const r = api['workers.bonus'](args[1]) as R<{ cost: number; mood: number }>;
         if (!r.ok) return ctx.printErr(r.error);
+        // [FIX-M11 · FX2] знаменатель — из витрины moodCap (Домик → 105),
+        // не литерал «/100» (унификация с витриной списка «N/кап»)
+        const cap = (api['workers.list']() as WorkersViewShape).moodCap;
         ctx.printOk(
-          `премия выдана: −${r.value.cost}з (×1.5 дневной ЗП, транзакция worker.bonus) · настроение ${r.value.mood}/100 (+10)`,
+          `премия выдана: −${r.value.cost}з (×1.5 дневной ЗП, транзакция worker.bonus) · настроение ${r.value.mood}/${cap} (+10)`,
         );
…
       const r = api['workers.dev']('mood', args[1], args[2]) as R<{ idx: number; mood: number }>;
       if (!r.ok) return ctx.printErr(r.error);
-      ctx.printOk(`настроение работника №${r.value.idx}: ${r.value.mood}/100`);
+      // [FIX-M11 · FX2 · сопутствующая проводка] знаменатель — из витрины
+      // moodCap (как в ответе bonus): валидация §2.2 принимает 101–105 при
+      // Домике — литерал «/100» стал бы самопротиворечием «103/100»
+      const cap = (api['workers.list']() as WorkersViewShape).moodCap;
+      ctx.printOk(`настроение работника №${r.value.idx}: ${r.value.mood}/${cap}`);
```

### 2.3 kernel-дифф = ПУСТ (пятая заморозка) — копипастой

```
$ git diff src/kernel/ | wc -l
0
```

Миграций НЕТ; SAVE_VERSION 14; v14/18 без bump; срез-схема без изменений; манифест 1.1.0 НЕ
тронут (поведение, не API — bump не нужен); module-wiring монтаж НЕ тронут; чужие модули НЕ
тронуты (дифф = ровно 6 файлов §2: state/upgrades/hire/dev/commands-workers/workers-upg-checks).

## 3. Чек-расширение 26 (workers-upg-checks.ts, FX3) — дифф чека

Тело чека 26 расширено ДВУМЯ донорами (машинный оракул; имя чека и счётчик НЕ изменены — вывод
selftest байт-в-байт, см. §5.7): (а) донор с mood 105 + Домик → import → save → re-export —
срез workers **байт-в-байт** против `canonicalWorkersState(donor105)` (до правки sanitize срезал
бы до 100 — ассерт красный); (б) оракул отрицания: донор без Домика (mood 100 и 104, upgrades
нет) → клэмп базового капа 100 жив (104 → 100 — клэмп реально упражнён).

```diff
+import { canonicalWorkersState, type WorkersState } from '@/game/modules/workers/state';
…
     await f3.game.save.save();
     const raw3 = JSON.parse(f3.game.save.exportJson()) as { modules: { workers: unknown } };
+    // [FIX-M11 · FX3] roundtrip капа Домика в load-пути (MISS-1): донор с
+    // mood 105 + Домик → import → save → re-export — 105 сохранён
+    // байт-в-байт против канонической формы (до правки sanitize срезал
+    // легальное живое 101–105 до 100); оракул отрицания: донор БЕЗ Домика
+    // (mood 100 и 104, upgrades нет) → клэмп базового капа 100 жив
+    const donor105: WorkersState = { v: 1, hired: [mkWorker({ mood: 105 })], upgrades: ['upg_worker_house'] };
+    const f4 = await makeSeededWorkersGame('fixm11-donor-105');
+    await f4.game.save.importJson(
+      JSON.stringify({
+        saveVersion: 14,
+        savedAt: WORKERS_T0,
+        saveId: 'fixm11-donor-105',
+        contentVersion: '0.1.0-phase0',
+        modules: { workers: donor105 },
+        lastSeen: WORKERS_T0,
+      }),
+    );
+    await f4.game.save.save();
+    const raw4 = JSON.parse(f4.game.save.exportJson()) as { modules: { workers: unknown } };
+    const donorBase: WorkersState = {
+      v: 1,
+      hired: [mkWorker({ mood: 100 }), mkWorker({ defId: 'wk_fixm11_base', mood: 104 })],
+    };
+    const f5 = await makeSeededWorkersGame('fixm11-donor-base');
+    await f5.game.save.importJson(
+      JSON.stringify({
+        saveVersion: 14,
+        savedAt: WORKERS_T0,
+        saveId: 'fixm11-donor-base',
+        contentVersion: '0.1.0-phase0',
+        modules: { workers: donorBase },
+        lastSeen: WORKERS_T0,
+      }),
+    );
+    await f5.game.save.save();
+    const raw5 = JSON.parse(f5.game.save.exportJson()) as { modules: { workers: unknown } };
     f.dispose();
     f2.dispose();
     f3.dispose();
+    f4.dispose();
+    f5.dispose();
     results.push(
       check('сейв F13/F15: v14 БЕЗ миграций … (имя чека НЕ изменено)', () =>
         parsed.saveVersion === 14 &&
         JSON.stringify(parsed.modules.workers).includes('upg_worker_house') &&
         rows2.filter((r) => r.bought).length === 2 &&
-        JSON.stringify(raw3.modules.workers) === JSON.stringify({ v: 1, hired: [] }), {
-        expected: 'v14; upgrades в файле; roundtrip 2/5; донор байт-в-байт',
-        actual: `v${parsed.saveVersion}; bought ${rows2.filter((r) => r.bought).length}/5; донор ${JSON.stringify(raw3.modules.workers)}`,
+        JSON.stringify(raw3.modules.workers) === JSON.stringify({ v: 1, hired: [] }) &&
+        JSON.stringify(raw4.modules.workers) === JSON.stringify(canonicalWorkersState(donor105)) &&
+        JSON.stringify(raw5.modules.workers) ===
+          JSON.stringify(
+            canonicalWorkersState({ ...donorBase, hired: donorBase.hired.map((w) => ({ ...w, mood: 100 })) }),
+          ), {
+        expected: 'v14; upgrades в файле; roundtrip 2/5; донор байт-в-байт; 105 сохранён; клэмп 100 жив',
+        actual: `…; 105-донор ${JSON.stringify(raw4.modules.workers)}; база ${JSON.stringify(raw5.modules.workers)}`,
```

**Счёт чеков НЕ вырос**: группа «M11 Работники» 26/26, итог 697/697 — расширение тела, не счётчик.
**wc-факт (жёлтый перечень, FX4-carried)**: `workers-upg-checks.ts` **298 → 342** (последствие
расширения, предсказано брифом FX4; НЕ чинилось — вне объёма микросеанса). Жёлтый перечень теперь:
module.ts 305 / workers-checks 308 / workers-day-checks 301 / **workers-upg-checks 342** —
carried до следующего M11-касающегося сеанса. Остальные правленные файлы ≤ 300:
state 225 / upgrades 142 / hire 211 / dev 57 / commands-workers 256.

## 4. Живые пробы приёмки (копипасты; браузер, код после правок)

Канон живых серий соблюдён: батчи ≤ 25 команд, `save now` в конце каждого, очистка консоли,
стримы из журнала `roll.log`. Построение Донора-А — живьём вариантом (а) §2.3 (payday force
при mood 100 + Домик), нормализация двух работников — легальным `mood set` (кап 105 при Домике).

### 4.1 §5.1 Load-путь (сердце фикса)

Донор-А (3 нанятых живьём, Домик + Столовая, знаменатель витрины /105):
`give gold 5000` → `give egg 10` → наймы [0] Демид (Скотник→Загон №1) / [1] Настасья (Рыбовод→Озеро №1)
/ [3] Тихон (Фермер→Ферма «Поле») → покупка Домика 300з + Столовой 400з → `mood set ×3 100` →
`payday force` (вариант-а: Настасья 100+10+3+2 = 115 → **клэмп 105/105** витриной; Демид/Тихон −10 → 95) →
нормализация `mood set 0 95 / 1 105 / 2 105` → `save now`. Затем **F5 (настоящий load-путь)**:

```
Работники: 3/3 (лимит = объектам) · зарплаты 74з/день
  [0] Демид · Скотник · ★★☆☆☆ · 22з/день · 4ч · Загон №1 · настроение 95/105 · премия доступна
  [1] Настасья · Рыбовод · ★☆☆☆☆ · 12з/день · 4ч · Озеро №1 · настроение 105/105 · премия доступна
  [2] Тихон · Фермер · ★★★★☆ · 40з/день · 4ч · Ферма «Поле» · настроение 105/105 · премия доступна
```

**КОНТРАСТ** (копипаста §8 аудита): до правки донор 105/105/95 → load/import → **100/100/95**
(клэмп sanitize). Теперь 95/105/105 → load → **95/105/105** — легальное живое 101–105 переживает
load. Donор-Б (минимальный, mood 105 + `upg_worker_house`) → `save import` → витрина:

```
сейв импортирован: версия 14, saveId fixm11-d… — состояние применено и записано
Работники: 1/3 (лимит = объектам) · зарплаты 30з/день
  [0] Проба · Фермер · ★★★☆☆ · 30з/день · 4ч · Ферма «Поле» · настроение 105/105 · премия доступна
```

Повторный load (F5) + re-save roundtrip — срез workers из ДВУХ независимых движковых экспортов
(W2 после первого reload+save, W3 после второго reload+save), `cmp` = 0 различий:

```
{"v":1,"hired":[{"defId":"wk_fixm11_b0","name":"Проба","profession":"farmer","stars":3,
"salaryPerDay":30,"checkPeriodHours":4,"care":3,"traits":[],"object":"field","mood":105,
"hiredAt":1793028072000}],"upgrades":["upg_worker_house"]}
=== BYTE-FOR-BYTE ===
W2 == W3: ИДЕНТИЧНЫ БАЙТ-В-БАЙТ
```

**mood 105 roundtrip байт-в-байт** ✓ (контраст аудита: headless донор 105/105/95 → re-export 100/100/95).

### 4.2 §5.2 dayPass-догон после import (перевёрнутый оракул Тихона)

`payday force` на загруженном Доноре-А (Столовая накормлена egg из инвентаря, зарплаты уплачены
вовремя) — журнал `roll.log 12` (копипаста):

```
range  workers:mood:wk_20261026_3 0..1 (uniform) → 0.69   (Тихон:  ≥0.5 → +10)
range  workers:mood:wk_20261026_1 0..1 (uniform) → 0.42   (Настасья: <0.5 → −10)
range  workers:mood:wk_20261026_0 0..1 (uniform) → 0.83   (Демид:  ≥0.5 → +10)
range  workers:sick:wk_20261026_{3,1,0} → 0.40 / 0.11 / 0.85  (все ≥ 0.02 — здоровы)
```

Арифметика дня (копипаста):

- **Настасья (105): 105 − 10 (ролл 0.42) + 3 (Столовая) + 2 (расчёт вовремя) = 100** —
  перевёрнутый оракул аудита: раньше 95 = факт клэмпа на load (100−10+3+2); теперь 100 = факт капа.
- Демид (95): 95 + 10 (0.83) + 3 + 2 = 110 → **клэмп капа 105** (витрина 105/105).
- Тихон (105): 105 + 10 (0.69) + 3 + 2 = 120 → **клэмп капа 105** (витрина 105/105).

Витрина после: `Демид … 105/105 · Настасья … 100/105 · Тихон … 105/105` — ни один не срезан
клэмпом 100, кап Домика применяется во всех путях одинаково.

### 4.3 §5.3 Бонус до 105

```
❯mood set 2 96
настроение работника №2: 96/105
❯workers bonus 2
премия выдана: −60з (×1.5 дневной ЗП, транзакция worker.bonus) · настроение 105/105 (+10)
❯workers bonus 2
премия Тихон недавно выдавалась — кулдаун 7д 0ч (раз в 7 дней)
```

Витрина: `[2] Тихон · … · настроение 105/105 · премия через 7д 0ч` — mood 96 + 10 = **105, не 100**
(раньше withMood без капа обрезал премию на 100); знаменатель ответа «/105» — из витрины;
повтор-кулдаун жив.

### 4.4 §5.4 moodSet-валидация

При живом Домике (Донор-А):

```
❯mood set 2 103
настроение работника №2: 103/105          ← ПРИНЯТО (раньше валидация ≤100 отказывала)
❯mood set 2 106
настроение: целое 0..105                  ← отказ (динамический диапазон = капу)
```

После перехода на чистый донор без upgrades (Донор-В, см. 4.5):

```
❯mood set 0 101
настроение: целое 0..100                  ← отказ «макс 100» — оракул отрицания капа
```

### 4.5 §5.5 Оракул отрицания клэмпа

Донор-В (БЕЗ Домика, mood 100 + 104, upgrades пусто) → `save import` → витрина:

```
  [0] Основа · Фермер · ★★★☆☆ · 30з/день · 4ч · Ферма «Поле» · настроение 100/100 · премия доступна
  [1] Кламп · Рыбовод · ★★☆☆☆ · 18з/день · 4ч · Озеро №1 · настроение 100/100 · премия доступна
```

Mood 100 сохранён (граница 0..100 без Домика); 104 **срезано клэмпом до 100** — базовый клэмп жив,
знаменатель витрины «/100» (кап из данных = 100 без владения Домиком).

## 5. Регресс-минимум §8 SESSION-M11.2 (копипасты, состояние после Донора-В)

- `price iron_pickaxe` → «basePrice: 120 × редкость 1.5 = base 180 · ПОКУПКА: **180** золота ·
  ПРОДАЖА: **72** золота (ставка 40%)» ✓ · `price egg` → **3/1** ✓ · `price wool` → **15/6** ✓ ·
  `price worm_bait` → **2/1** ✓
- `shop.stock` → «Завоз 2026-10-27 · 18 позиций · магазин ур. 1 … **пул: 60 позиций · закрытые
  полки: baits, potions, building, rarities**» ✓
- `craft.list` → «Рецепты крафта · **33**» ✓ · `craft.stations` → «Рабочий верстак — построена ·
  очередь 2; Большой верстак 350 зол…» ✓
- `forge stats` → честный «укажите предмет: forge stats iron_sword#1» ✓ (причина жива)
- `tasks` → «Реестр задач (**15**)» ✓
- `fish.state` → «Рыбалка · локация: пруд · забросов 0 · поймано 0» ✓ · `pen.state` → «Загон ·
  слоты 0/4 · животных 0» ✓ · `lake.state` → «Озеро №1 · слоты 0/6 · вода: 15° · чистота 100/100
  (дрейф −5/день)» ✓ (дрейф жив)
- **«Грибник»-база** (живой сетап в свежей игре: `xp add 1500` → «+1500 XP → уровень 8 (ПОДНЯТ
  ×7!)» → `farm.upgrade tab_mushroom` → «куплено: Грибница (tab_mushroom) — транзакция
  farm.upgrade» → `farm.plow 0 mushroom` → `give seed_mushroom 2` → `farm.plant mushroom 0
  mushroom` → «посажено: mushroom в тайл 0 · созреет к 02:33:56» → `time +4h` + `time +8h` →
  `farm.water 0 mushroom` → «тайл 0 полит»):
  `farm.harvest 0 mushroom` → «**собрано: Грибы ×4 (качество D, 42)**» → `counters
  farm.mushroom.harvests` → «**farm.mushroom.harvests 1**» ✓
- `save info` → «версия формата: **14** … срезы: **18**» ✓ (без bump)
- `inv list` → «Инвентарь — слоты 2/20 (свободно 18)» ✓ · `resolve player.inventory.slots` →
  «= **20** (база: 20, ctx: уровень 8, модификаторы: нет)» ✓
- `counters sell` → «счётчиков нет» (продаж не было — честный ответ) ✓ · `stats show` → «Счётчики
  ядра (11)» (farm.mushroom.harvests 1 видна) ✓ · `flags list` → «Флаги (1) player.level5» ✓
- **390×844**: `scrollWidth 390 = clientWidth 390` — переполнения НЕТ ✓ · **pageerror 0** ✓ ·
  **hydration 0** (0 совпадений в консоли браузера) ✓ · **dev.log — 0 «Module not found»** ✓

Цена фикса: ничего не сломано.

## 6. Selftest ПОСЛЕ правок (§5.7)

- Headless ×2 (итоговая перепроверка после всех живых проб): «ИТОГ: **697/697** проверок зелёные»,
  md5 (stdout+stderr combined) ×2 = **`f940eb60c691ff0a4971f7372692d862`** — **НЕ ИЗМЕНИЛСЯ** =
  канону (число чеков не росло; расширение тела чека 26 не тронуло вывод — имя чека сохранено).
- Браузерный: «ИТОГ: **697/697** проверок зелёные — ядро, модули и правки FIX в норме» ·
  «✓ M11 Работники: 26/26» · pageerror 0.
- Группы 44, Σ = 697 (разложение прежнее: 43 идентичны канону + «M08 Озеро» 36 + «M11 Работники» 26).
- tsc 0 по `src/` + lint 0 — явной строкой (§1 п.4, повторено финалом: 0 / 0).

## 7. Финал сессии (§5.8)

`save wipe` → «сейв стёрт — автосейв остановлен; F5 начнёт новую игру» → F5 → **честная новая
игра**: saveId **`c4463807-c328-4a5b-91e7-c018b6f0c658`**, «версия формата: 14», срезы **18**
(craft, farm, fishing, forge, inventory, kernel.buff, kernel.clock, kernel.pity, kernel.stash,
kernel.stats, kernel.wallet, lake, modforge, pen, player, quests, shop, workers), работники
**0/3** — post-wipe тишина («никого не нанято — доска: workers board»). Браузерный post-wipe
selftest: «ИТОГ: **697/697** …» + pageerror 0. **Git-статус**: дерево содержит ровно 6 заявленных
файлов правок (state.ts / upgrades.ts / hire.ts / dev.ts / commands-workers.ts /
workers-upg-checks.ts), незаявленных артефактов НЕТ. Временные инструменты сеанса — вне дерева:
`/tmp/fixm11-donor-b.json`, `/tmp/fixm11-donor-v.json`, `/tmp/fixm11-e2pretty.txt`,
`/tmp/fixm11-e3pretty.txt`, `/tmp/fixm11-w2.json`, `/tmp/fixm11-w3.json`, `/home/z/fixm11-parse.py`
(парсер браузерного экспорта, только чтение).

## 8. Среда-примечания (серия FIX-M11-OBS; объём не расширяли)

- **FIX-M11-OBS-1 (среда, класс аудита CDP×2)**: CDP-клин `Runtime.evaluate` ×2 после большой
  строки `save export` в консоли (таймауты 30–60с, затем полная закупорка канала) — восстановление
  перезапуском браузера; страницы и dev.log чисты (0 ошибок) — дефекта НЕТ.
- **FIX-M11-OBS-2 (среда, класс аудита IndexedDB×2)**: перезапуск браузера стартует НОВУЮ игру
  (профиль не персистентен; промежуточный saveId `867e7b04-cbe4…`) — восстановление импортом
  донора по образцу аудита; пробы, снятые до инцидента, валидны (их копипасты зафиксированы).
- **FIX-M11-OBS-3 (методика)**: ловушка первого снятия «экспорта» — regex-match зацепил строку
  вставленной команды `save import {…}` (компактный донор), а не движковый pretty-экспорт;
  обнаружено по формату, переснято двумя независимыми движковыми экспортами (W2/W3, `cmp` = 0).
- **FIX-M11-OBS-4 (среда, класс AUDIT-0 ANSI)**: терминальный рендер вывода bash съедает «[m»
  (дифф `hired: [mkWorker(...)` отображался как `kWorker(...)`); файлы проверены Read-инструментом —
  байты корректны, tsc 0 + selftest 697/697 подтверждают.
- **FIX-M11-OBS-5 (живой сетап)**: Грибник в свежей игре потребовал `xp add 1500` (Грибница =
  уровень 8) + вспашку + полив перед сбором («пора (ждёт полива/сбора)») — живые шаги прогрессии,
  не дефекты; счётчик базы тикнул (1).
- **Наблюдение детерминизма**: роллы §5.2 не повторяют роллы построения Донора-А (при load сид
  пересеивается на dailySeed(saveId, дата), и порядок потребления стримов между сеансами
  отличается) — арифметика дня во всех пробах верифицирована по журналу ФАКТИЧЕСКИХ роллов
  (`roll.log` копипастой), оракул 105−10+3+2 = 100 выполнен на Настасье.

Находок сверх MISS-1 нет: 0 CRIT / 0 BLOCKER / 0 новых MISS / 0 QUESTION. Протокол несогласия
не активировался (решения спеки FX1–FX4 исполнены; заявленные следствия §2.2 — открыто в §2.2
настоящего отчёта, молчаливых отклонений нет).

## 9. Вердикт

**MISS-1 (P3) ЗАКРЫТ**: кап Домика 105 проведён в load-путь (`sanitize` клэмпит к moodCapOf из
данных входящего среза) и в три сопутствующие точки (премия bonus, moodSet-валидация и запись,
принты витрин) через ЕДИНУЮ точку `moodCapOf(state)` (числа — только в content/workers). Живые
подтверждения: load-путь 105/105/105 переживает F5 и import (контраст аудита 100/100/95),
dayPass-догон 105−10+3+2 = 100 (перевёрнутый оракул), бонус 96+10 → 105/105, moodSet 103
принято / 106 и 101-без-Домика отказаны, базовый клэмп 100 жив (104 → 100 без Домика).
Регресс §8 целый; selftest 697/697 ×2 md5 `f940eb60` НЕ изменился; kernel-дифф ПУСТ (пятая
заморозка); v14/18 без bump; миграций нет. **Гейт закрытия M11: после приёмки настоящего отчёта
M11 ЗАКРЫТ (2/2 + аудит + фикс) — открывается бриф SESSION-M12 «Шахта-рогалик» (порядок Task 38;
бриф учтёт: реестр исполнителей 15 жив, прецедент withWorkerEnergy для контракта энергий
исполнителей шахты, замки гейтов M12/M13 целы; carried: wc-жёлтые 305/308/301/342).**
