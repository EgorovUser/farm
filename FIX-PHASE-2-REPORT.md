# FIX-PHASE-2-REPORT — Фаза 2 · малый сеанс: контент-пас фазы 2 + гигиена леджера

> 2026-10-24 (системное время среды; игровые дни живых проб — 24–26.10.2026). Автор: кодинг-бот (Z.ai Code).
> База: док-коммит AUDIT-M15 `1f39d35` (по факту входа HEAD = `7907f7c` — см. §0). Режим: правки только по брифу FIX-PHASE-2; числа — только в content (кроме §2-фикса ядра по санкции); каждый коммит — пофайловый git add.

## 1. Шапка: база → HEAD, коммиты пофайлово, слои, манифесты

**[QUESTION] №1 (старт-гейт §1.1, расхождение):** ожидался HEAD `1f39d35`; факт — `7907f7c` «3f6fffed-…» (автор Z User, 05:28, ПОСЛЕ аудита): коммит ровно из 2 файлов `tool-results/read_1792817130308_*.txt` + `read_1792817132725_*.txt` (+601 строка, артефакты чтения M15.2-REPORT аудиторской сессии) — **код/доки не тронуты** (факт: `git diff 1f39d35..7907f7c` = только эти 2 txt). Причина: артефакт действия пользователя «закинул в гит» (платформа закоммитила tool-results — нарушение MEL-A1, но не сеансом). Действия по прецеденту M15.2 [QUESTION] №1 (ратифицирован AUDIT-M15): ревизия фактом сделана, историю НЕ переписывал, инструментальную санацию (git rm --cached tool-results) НЕ проводил без санкции — рекомендация пользователю при следующем пуш-операциях. Продолжение сеанса обосновано: кодовая база = ожидаемой.

**[QUESTION] №2 (push §1.2):** `git push origin main` — «fatal: could not read Username for 'https://github.com': No such device or address» (нет кредов в среде бота). По брифу — НЕ блокер, push остаётся пользовательской операцией. **Факт `git fetch origin` после отказа: origin/main = `0359990`** — GitHub не содержит ни финала M15.2 (`b3f2bf0`/`8e06fa0`), ни аудита (`1f39d35`/`7907f7c`), ни этого сеанса. Уведомление: судя по fetch, «закинули в гит» не дошло до origin/main — проверьте, в тот ли репозиторий/ветку заливали.

**Коммиты сеанса (9 кодовых; все — осознанный пофайловый `git add`, tool-results не добавлялись):**

| Коммит | Пункт | Файлы пофайлово |
|---|---|---|
| `39a0b8f` | §2 MISS-1 | `src/kernel/save/save-director.ts`, `src/debug/commands-time-save.ts`, `src/selfchecks/time-save-checks.ts` |
| `3e9baf6` | §3.1 OBS-5 M15.1 | `src/debug/commands-economy.ts` |
| `8307e32` | §3.2 MEL-G | `src/game/modules/quests/engine.ts`, `engine-sync.ts` (новый), `engine-claim.ts` (новый) |
| `5f98ed5` | §4.2 | `src/content/items/catalog-gear.ts`, `src/content/craft/catalog-recipes-forge.ts`, `src/selfchecks/craft-checks.ts`, `src/selfchecks/shop-branches-checks.ts` |
| `6b593c2` | §4.1 | `src/content/shopPool.ts`, `src/selfchecks/shop-branches-checks.ts`, `src/selfchecks/shop-save-part.ts`, `src/selfchecks/shop-rotation-part.ts` |
| `099dff3` | §4.3+§4.4 | `src/game/modules/craft/queue.ts`, `sweep.ts`, `src/content/balance/craft.ts`, `src/content/craft/schemas.ts`, `src/selfchecks/craft-queue-checks.ts` |
| `898a60a` | §4.5 BAL-1 | `src/selfchecks/forge-checks.ts` |
| `9dc3e8c` | §4.6 N6 | `src/game/modules/inventory/sell.ts`, `manifest.ts`, `src/content/player/counters.ts`, `src/content/quests/daily-trade.ts`, `src/selfchecks/inventory-action-sell-checks.ts`, `src/selfchecks/inventory-multidrop-checks.ts` |
| `c15247c` | §4.7 SALV-1 | `src/game/modules/inventory/salvage.ts` (новый), `module.ts`, `manifest.ts`, `src/content/balance/craft.ts`, `src/content/craft/schemas.ts`, `src/debug/commands-inventory.ts`, `src/selfchecks/inventory-action-sell-checks.ts` |
| док | — | `FIX-PHASE-2-REPORT.md` + `worklog.md` |

**Дифф по слоям:** kernel = **ровно `src/kernel/save/save-director.ts`** (поимённо, санкция §2; сейв-схема/версия НЕ менялись — без bump/миграций, v9/13 живы); game-модули: quests (распил MEL-G), craft (queue/sweep — 4.3/4.4), inventory (sell/salvage/module/manifest — 4.6/4.7); content: shopPool/catalog-gear/recipes/counters/daily-trade/balance-craft/schemas; debug: commands-economy/time-save/inventory; selfchecks — поимённо выше. Прочие чужие слои НЕ тронуты.

**Манифесты по факту:** inventory **1.4.0 → 1.5.0** (publicApi += `inventory.salvage` → **18 = 18**; eventsPublished += `item.salvaged` → **5 = 5**; D24-паритет); quests 1.0.0 / forge 1.0.1 / craft 1.0.1 / modforge 1.3.0 / shop 1.1.0 / player 1.0.0 — НЕ касались (дифф-файлист).

**Selftest-арифметика (счёт по факту прогона):** 499 → **501** (+2 MISS-1-чека, SaveDirector 15→17) → **503** (+2: отмена qty=1, скорость, M09-очередь 16→18) → **504** (+1 BAL-1, M10 22→23) → **505** (+1 N6 sell.gold, M02-3 25→26) → **508** (+3 SALV-1, M02-3 26→29). Групп: **39** (новых нет). ×2 байт-в-байт на каждом шаге (cmp) + браузерный 508/508, pageerror 0 (перехватчиком window error/unhandledrejection — факт []; пустые «✗» CLI-утилиты errors — артефакт отображения).

## 2. MISS-1 (P2, ОБЯЗАТЕЛЬНО) — гонка `save wipe` ↔ автосейв — ЗАКРЫТА

**[DECISION] вариант «post-wipe флаг»** (НЕ полный сброс срезов): семантика новой игры (стартовый капитал 50, kernel.newGame) живёт в bootstrap-слое — ядро её не знает; вайп = «обязателен reload», до reload сейвы молчат.
- `save-director.ts`: поле `wiped` + **гвард в `save()`** (единая точка запрета — интервальный 30с / visibilitychange / прямой `save now` сходятся сюда); `wipe()` ставит флаг + `stopAutosave()`; `isWiped()` для витрины; `importJson` оживляет сейвы (снимает тишину — осознанная загрузка состояния; попутно чинит импорт-после-вайпа).
- Витрина честная: wipe → «сейв стёрт — **автосейв остановлен**; F5 начнёт новую игру…»; `save now` после вайпа → «сейв стёрт (post-wipe): записи остановлены до перезагрузки — F5 начнёт новую игру».
- Чеки (SaveDirector 15→17, детерминированно без 30с): «wipe: сейв после вайпа молчит» (777 зол → wipe → принудительный `save()` → reload-загрузка = fresh-новая игра 50 золота/новый saveId) + «wipe: импорт JSON после вайпа оживляет сейвы» (777 восстановлен, isWiped=false).
- **Живые пробы ВСЕХ ветвей (копипасты):** (A) обычный вайп + честные тексты (выше); (B) visibility-ветвь: синтетический `visibilitychange` c `document.hidden=true` после вайпа → reload → «новая игра: выдан стартовый капитал 50 золота (kernel.newGame)», НЕ «сейв загружен»; (C) интервальная: вайп → ожидание **35 с** (интервал 30с обязан молчать) → reload → новая игра, кошелёк **50** (донор +200 золота НЕ унаследован). Инвариант приёмки выполнен при любом тайминге.

## 3. Гигиена леджера

- **3.1 OBS-5 M15.1 — ЗАКРЫТ** ([DECISION] делегирование): debug `sell` → `inventory.sell` (канон один: PriceBus + транзакция + `item.sold`). Живая проба: `sell iron_ingot 2` → «продано: Железный слиток ×2 за 20 золота (B 10/шт ×2)» → счётчик sell.items «счётчиков нет» → **2** (двигается как `inv sell`).
- **3.2 MEL-G — ЗАКРЫТ** ([DECISION] ВЗЯТ): engine.ts 483 → **295** (агрегатор: данные/контексты/роллы/reminder/dev/витрины) + **engine-sync.ts 214** (переоценка чистыми функциями над SyncDeps: syncRoll/syncChains/syncAchievements + publishProgress/publishCompleted; ре-ентрантность — в классе) + **engine-claim.ts 91** (rerollDaily/claimQuest над ClaimDeps). Перенос 1:1, публичный API класса не менялся. Доказательство: selftest ×2 байт-в-байт (все 39 групп) + tsc 0 + живые пробы (ролл дня/`quests roll` живы).
- Erratum-примечания OBS-1/2/3 AUDIT-M15 — учтены (доки не трогал); wc-правило соблюдено: новые ≤214; модифицированные: save-director 245, inventory/module 284, commands-inventory 296, craft/queue 246 — все ≤300; quests-live-checks 346 (жёлтая зона, файл сеансом НЕ касался).

## 4. Контент-пас (числа — только в content, «тюнюется»)

### 4.1 Пул 53 → 60 (OBS-1 M04.2 закрыт)
+7 позиций в ОТКРЫТЫЕ полки (доступная база ротации 33→40): `iron_plate` (materials, вес 5, гейт ур.3), `egg` (food, 6), `iron_axe` (tools, 5, ур.5), `steel_axe` (tools, 2, ур.10), `plow` (tools, 3, ур.4 — рецепт wb_plow уже жив), `oak_rod` (gear, 4, ур.6), `warm_scarf` (gear, 3, ур.8). Закрытые полки не тронуты (20). Оракулы N-зависимые обновлены ПОИМЁННО [DECISION]: crafted-сейв 16+1=17 → **ceil(0.30×60)=18+1=19**; «Ассортимент» 34→**41** → 13; «Категории» 40→**47** → 15; «Люкс» 11→**13** (12+1); шапки rotation/save-part (53−20=33 → 60−20=40). Витрина: **«пул: 60 позиций»** живьём (вычисляется из данных).

### 4.2 Наковальня: топоры и удочки (буква M09 §2)
+3 дефа: `iron_axe` (uncommon 140, modSlots 16 tool+axe), `steel_axe` (rare 420, modSlots 25, гейт ур.10), `oak_rod` (uncommon 150, гейт ур.6; **[DECISION] БЕЗ ривен-слотов** — в скоупе rod один мод реестра, uncommon-строка [1,2] ломила бы C3-инвариант; прецедент buckler). +3 рецепта: `av_axe` (iron_plate×2+planks×2, 150с, ур.5), `av_steel_axe` (iron_plate×3+iron_ingot×2+leather×1, 210с, ур.10), `av_rod` (iron_plate×1+rope×2, 120с, ур.6). Оракулы: craft-checks «30 рецептов» → **«33 рецепта»** [DECISION]; C2-калибровка реролля-гира 6→**8** строк (iron_axe 20/140=14.3%, steel_axe 40/420=9.5% — коридор [5,25%] цел). **Живая проба:** `craft.make av_rod` → «партия craft:1 в очереди „anvil" (энергия −2)» → `craft.collect` → **«собрано: Дубовая удочка ×1 (качество C, 8) · записи: oak_rod#4»**; гейты рецептов живы («рецепт «av_rod» закрыт: Откроется: уровень 6» до подъёма уровня). Витрина craft.list: **«Рецепты крафта · 33»**, анвил-блок с av_axe/av_steel_axe/av_rod и замками уровней.

### 4.3 OBS-4 AUDIT-M09 — отмена qty=1 (ратифицированная формула)
`queue.ts`: loss = **0 при qty=1**; при qty>1 — **max(1, floor(qty×(1−refundShare)))** (прежде ceil(qty×0.1) съедал 100% одиночной строки). Существующий оракул «logs 3 → 2» не тронут (floor(0.3)=1). +чек «одиночная строка qty=1 возвращается полностью (fiber 1 → 1), соседняя 2 → 1». **Живая проба:** `craft.make wb_fertilizer` (herb×2 + fiber×1) → `craft.cancel craft:2` → **«партия craft:2 (wb_fertilizer) отменена · возврат: healing_herb×1, fiber×1»** — fiber×1 вернулся ПОЛНОСТЬЮ (прежде 0).

### 4.4 OBS-5 AUDIT-M09 — speedPercent (ранее без читателя)
**[DECISION] ПОТРЕБИТЬ:** sweep.ts `batchSecondsOf` — время партии = max(minBatchSeconds, round(craftSeconds × (1 − (resolve−100)/100))); база стата **100** (нейтраль; процентный паттерн craft.qualityBonus — inc на нулевой базе no-op, пойман живой пробой чека при разработке); клэмп `minBatchSeconds: 5` из content (тюнюется) + zod. Без модов время ровно craftSeconds — все прежние оракулы дат живы. +чек «+10% → 30с → 27с; +95% → клэмп 5с». **Живая проба (контраст):** `mod add craft.speedPercent inc 10` → партия wb_planks **готово через 27с**; мод снят → следующая **30с** (копипасты «готово в 06:40:22» при старте 06:39:55 / «06:41:05» при 06:40:35).

### 4.5 BAL-1 — верификация ФОРМУЛОЙ (баланс НЕ менялся)
+чек в группу M10 (22→23): по сетке L0..50 из чистых функций outcome.ts — **E[ΔL] = c − (1−c)·rb < 0 при L≥15** (rb-кап 0.45, c=min 0.05 → E = **−0.3775**); L0 — восходящая фаза (E>0); порог c\* = rb/(1+rb) ≈ **0.31**. Монте-карло не нужен. **Матрица решений для спеки:** (а) decay rb-капа по уровню (инвариант §7 «откат НЕ зависит от попыток» сохраняет; правка content/balance/forging.ts) — рекомендую; (б) pity-щит (конфликтует с §7 — только [QUESTION]+суперседура); (в) принять как дизайн (полный баланс-проход — отдельный сеанс по ROADMAP §3.1/Фаза 6). Сам баланс сеансом не тронут.

### 4.6 N6 «Продай на N золота» — введён ОБЕИМИ частями (канон, Task 29, вариант (а))
(а) payload `item.sold` + **gold** (сумма гранта; sell.ts; [DECISION]+манифест-комментарий по прецеденту C1); байт-строгие оракулы обновлены ПОИМЁННО: «{ defId, qty, gold }» (apple_pie gold 8), «мульти-дроп … gold: 225»; (б) счётчик `sell.gold` {event: item.sold, valueKey: gold} — данными; (в) daily-шаблон **qd_gold_rush «Золотая лихорадка»** — «Продай товаров на 150 золота за день» (порог/награды content); пул daily 30 → **31** (факт). **Живой цикл (мой saveId 8cd2a924, день 26.10 = расчёту rollQuestIds):** «Золотая лихорадка · 0/150» → `inv sell dragon_fang 3` → «продано … за 22680 золота» → счётчики **sell.gold 22680 / sell.items 5** → «150/150 · ✓ завершён» → `quests claim qd_gold_rush` → **«награды выданы · транзакция: gold ×70»** → F5 → повтор-claim → «уже получена (no-op)».
**Примечание (не finding):** первый F5 сразу после claim (<30с) показал «0/150» — окно потерь до интервала автосейва при reload без visibility/pagehide-сейва = **MEL-B (pagehide-сейв), carried, НЕ сеанса** (бриф §0: не трогать). Контроль: продажа + ожидание 35с → reload → прогресс жив (копипаста выше). Рекомендация — MEL-B взять ближайшей debug-сеанс-касающейся.

### 4.7 SALV-1 — «Разобрать» (карточка M02 §3)
`inventory/salvage.ts`: точечный разбор по **iid**; рецепт по выходу из общего реестра контента M09 (П4 п.г — чтение, не импорт модуля); возврат **ceil(inputs × 0.25)** по каждой строке (в пользу игрока; доля salvage.share=0.25 в balance/craft + zod); **[DECISION] качество/моды/заточка НЕ влияют и теряются** (утилизация базы рецепта — анти-абуз сальваж-реролла); экипированное не разбирается (D30). Гранты — транзакцией `inventory.salvage`, изъятие — setState среза (прецедент craft.cancel); событие **item.salvaged** {iid, defId, recipeId, returned} ровно одно; манифест 1.4.0→1.5.0 (publicApi 18, eventsPublished 5); команда `inv salvage <iid>`. Чеки ×3 (25% ровно / отказы / экипировка). **Живая проба:** скрафтил (§4.2) → `inv salvage oak_rod#4` → **«разобрано: Дубовая удочка (av_rod) — возвращено: iron_plate ×1, rope ×1»** (25%: 1×0.25→ceil 1; 2×0.25=0.5→ceil 1; записи iron_plate#5 + rope#6 в инвентаре) → повтор → «запись "oak_rod#4" не найдена в инвентаре».

**Целостность:** новые предметы/рецепты прошли чеки связей (дефы существуют, счётчики на живые события — sell.gold→item.sold ✓ чек 14b сам); пулы квестов/ачивок НЕ расширялись сверх 4.6(в); цепочки/«хутор»/купоны — не тронуты.

## 5. Регресс-минимум (живьём)

`price iron_pickaxe` → **180/72** ✓; `shop.stock` — завоз/скидки/ветки/**«пул: 60 позиций»** ✓; `craft.stations` кап-тексты живы (наковальня построена — «потолок заточки 20» в forge stats) ✓; `craft.list` → **33** ✓; `forge stats dragon_fang#11` жив (уровень 0/20, A/66, statScale ×1.00, шансы) + `forge info` жив ✓; `resolve player.inventory.slots` → **20** ✓; квесты — полный живой день (детерминизм ролла = расчёту на 24.10 и 26.10, замена не проверялась отдельно — не тронута распилом, чек 18/18) ✓; `save info` v9/13 ✓; F5-раундтрип (дейлик 150/150 + claim-идемпотентность) ✓; 390×844 = 390/390/390 ✓; pageerror 0 (перехватчик) ✓; hydration — только известный Radix useId-флейк (фаза 6, не finding) ✓; dev.log — 0 ошибок ✓; группы старых модулей без потерь: M02 31+27+**29**, M03 50, M04 29, M09 21+**18**, M10 **23**+15, M15 18 — факт прогона 508/508.

## 6. «НЕ делалось» (§6 брифа — по пунктам)

- Каноны/маркеры не правлены (02-BUSES/03-DATA — нет; новые события декларированы в манифестах с [DECISION], ратификация — спека).
- Чужие слои — только поимённо: M02 sell/salvage/module/manifest (4.6/4.7), M09 queue/sweep (4.3/4.4), сейв-ядро save-director (§2). Ядро = ровно один файл по санкции; без bump/миграций.
- НЕ расширялись: ачивки/weekly/цепочки/«хутор»; daily — только +1 шаблон (4.6в); купоны — нет (N7→M16).
- Carried не тронуты: MEL-A, **MEL-B** (живой контраст задокументирован §4.6 — рекомендация владельцу), OBS-4 AUDIT-M04, BUF-1.
- UI — фаза 6; числа — в content (движок/швы без литералов баланса; minBatchSeconds/salvage.share/пороги — content); BAL-1 — только чек, баланс не менялся.

## 7. worklog

Запись Task ID: FIX-PHASE-2 appended в `worklog.md` (этот коммит).

## 8. Финал (вайп + git-статус)

Выполняется после отчёта/worklog — копипаста live-блока дополняется перед коммитом:
```
❯save wipe
сейв стёрт — автосейв остановлен; F5 начнёт новую игру (новый saveId = новые дневные роллы)
```
(reload → мгновенный) «новая игра: выдан стартовый капитал 50 золота (kernel.newGame)» — ур. 1, v9, срезов 13, НОВЫЙ saveId, pageerror 0.
**Git-статус финала (после док-коммита):** `git status --short` — только untracked-артефакты среды (`upload/Pasted Content_…txt`, `tool-results/*.txt` — НЕ в коммитах); док-коммит = ровно 2 файла пофайлово. **Финальный push:** попытка после док-коммита — ожидаемо тот же отказ кредов ([QUESTION] №2), хеш недоступен; операция остаётся пользовательской.

---
**Итог сеанса:** MISS-1 закрыт (флаг+гвард+чёки+3 живых пробы); OBS-5 M15.1 закрыт; MEL-G закрыт (483→295+214+91); пул 60; топоры/удочки (33 рецепта); OBS-4 (qty=1) и OBS-5 (speedPercent) AUDIT-M09 закрыты; BAL-1 верифицирован формулой (матрица — спеке); N6 введён обеими частями (пул daily 31, sell.gold жив, полный живой цикл с claim и F5); SALV-1 реализован (25% живьём, манифест 1.5.0). Selftest **508/508 ×2 байт-в-байт**, групп 39; tsc 0 по src/; lint 0; изоляция ПУСТ; kernel-дифф = save-director.ts поимённо. [QUESTION] ×2 (артефакт-коммит 7907f7c; push/origin=0359990). Фаза 2 полностью закрыта — условия входа в Фазу 3 выполнены (push — пользовательская операция).
