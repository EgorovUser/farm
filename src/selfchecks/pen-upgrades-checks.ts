/**
 * Self-checks M06 «Загон» — часть 5 (сеанс M06.2: улучшения F3 + навоз F4 +
 * исполнители F6 + раундтрип новых полей).
 *
 * Покрытие (бриф §3.8): покупки ×7 поимённо (золото, eventId pen.upgrade,
 * повтор немногоразовых — отказ); Амбар уровни → слоты 8/12/16, 4-й — отказ;
 * «Тёплый» appetiteFactor ×0.9 (decay 22.5/день); «Пастбище-люкс» — мод flat
 * +10 pen.happiness.bonus [tag=pen] в трассе статБуса, эффективное счастье
 * min(100, raw + 10); Автокормушки — исполнитель pen.autofeeder регистрацией
 * покупкой + due-проход (часовая ветка): кормит всех, Корм списан,
 * hungryDays не растёт, навоз растёт; «Симбиоз» — dayTick: буфер навоза →
 * Удобрение по курсу компостера M05 (чтение 'farm.upgrades' данными,
 * eventId pen.compost); «Второй загон» — pen.animals2 со своими слотами,
 * адресация уход/сбор, свой склад, без улучшения — отказ; исполнители ×4
 * (реестр 6 → 10; worker.actionDone НЕ публикуется); раундтрип новых полей
 * байт-в-байт.
 */
import { check, type CheckResult } from './types';
import {
  PEN_T0,
  PEN_DAY,
  PEN_HOUR,
  animalAt,
  dayPass,
  hourPass,
  makeSeededPenGame,
  makePenGame,
  penView,
  type R,
} from './pen-fixture';

const HOUR = PEN_HOUR;

export async function runPenUpgradesChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ------------------------------------------------ 22. покупки ×7 + Амбар уровни + повтор — отказ
  {
    const f = await makeSeededPenGame('m062-upg-buy');
    f.game.wallet.grant('gold', 20000);
    const ids = [
      'upg_warm_pen', 'upg_breeding_pen', 'upg_lux_pasture', 'upg_second_pen',
      'upg_symbiosis', 'upg_autofeeder', 'upg_barn',
    ];
    const bought = ids.map((id) => (f.pen['pen.upgrade'](id) as R<{ name: string; level: number }>).ok);
    const again = f.pen['pen.upgrade']('upg_warm_pen') as R<unknown>;
    const barn2 = f.pen['pen.upgrade']('upg_barn') as R<{ level: number }>;
    const barn3 = f.pen['pen.upgrade']('upg_barn') as R<{ level: number }>;
    const barn4 = f.pen['pen.upgrade']('upg_barn') as R<unknown>;
    const v = penView(f);
    const unknown = f.pen['pen.upgrade']('upg_nope') as R<unknown>;
    const tx = f.events.filter((e) => e.name === 'wallet.transaction' && e.payload.eventId === 'pen.upgrade');
    results.push(
      check('улучшения ×7 поимённо: покупки живы (tx pen.upgrade ×9 с уровнями Амбара, БЕЗ энергии); повтор немногоразового — отказ «уже куплено»; Амбар 3 уровня → слоты 4+4×3 = 16, 4-й — отказ «максимального уровня»; неизвестный id — отказ', () =>
        bought.every((b) => b) &&
        !again.ok && again.error.includes('уже куплено') &&
        barn2.ok && barn3.ok && !barn4.ok && barn4.error.includes('максимального уровня') &&
        v.slots.base === 16 && !unknown.ok && tx.length === 9, {
        expected: '×7 ok / повтор отказ / Амбар 3 ур → 16 слотов / 4-й отказ / tx 9',
        actual: `ok ${bought.filter(Boolean).length}/7, повтор ${again.ok}, слоты ${v.slots.base}, 4-й ${barn4.ok}, tx ${tx.length}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 23. «Тёплый» аппетит + «Люкс» мод в трассе
  {
    const f = await makeSeededPenGame('m062-upg-warm');
    f.game.wallet.grant('gold', 1000);
    f.pen['pen.buy']('chicken');
    f.pen['pen.upgrade']('upg_warm_pen');
    dayPass(f, PEN_T0 + 1 * PEN_DAY);
    const a = animalAt(f, 0);
    results.push(
      check('«Тёплый загон»: appetiteFactor 0.9 — decay сытости 25×0.9 = 22.5/день (100 → 77.5)', () =>
        Math.abs(a.satiety - 77.5) < 1e-9, {
        expected: '77.5',
        actual: String(a.satiety),
      }),
    );
    f.dispose();
  }
  {
    const f = await makeSeededPenGame('m062-upg-lux');
    f.game.wallet.grant('gold', 3000);
    f.pen['pen.buy']('chicken');
    f.pen['pen.upgrade']('upg_lux_pasture');
    // 4 дня без ухода: satiety 0 (день 4) → счастье −30 → raw 70; эффективное 80
    for (let d = 1; d <= 4; d++) dayPass(f, PEN_T0 + d * PEN_DAY);
    const a = animalAt(f, 0);
    const trace = f.game.statBus.resolveTrace({ stat: 'pen.happiness.bonus', ctx: { ...f.game.time.ctx('player'), tags: ['pen'] } });
    const mods = (trace.mods ?? []) as Array<{ id?: string; label?: string; value?: number }>;
    results.push(
      check('«Пастбище-люкс»: мод flat +10 pen.happiness.bonus [tag=pen] в трассе статБуса (penUpgradesProvider); эффективное счастье = min(100, raw + 10): raw 70 (голод −30) → витрина 80', () =>
        mods.some((m) => m.id?.includes('upg_lux_pasture') && m.value === 10) &&
        a.happiness === 80, {
        expected: 'мод +10 в трассе; счастье 80',
        actual: `моды ${mods.map((m) => `${m.id ?? '?'}=${m.value}`).join(',')}; счастье ${a.happiness}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 24. Автокормушки: due-проход + hungryDays не растёт
  {
    const f = await makeSeededPenGame('m062-upg-autofeeder');
    f.game.wallet.grant('gold', 2000);
    f.game.wallet.grant('feed', 10);
    f.pen['pen.buy']('chicken');
    f.pen['pen.buy']('goat');
    f.pen['pen.upgrade']('upg_autofeeder');
    const registered = f.game.tasks.has('pen.autofeeder');
    dayPass(f, PEN_T0 + 1 * PEN_DAY); // decay день 1
    hourPass(f, PEN_T0 + 1 * PEN_DAY + HOUR); // due-проход автокормушки (часовая ветка)
    const v = penView(f);
    const feedLeft = f.game.wallet.get('feed');
    const manure = v.manure?.manure ?? 0;
    for (let d = 2; d <= 4; d++) {
      dayPass(f, PEN_T0 + d * PEN_DAY);
      hourPass(f, PEN_T0 + d * PEN_DAY + HOUR);
    }
    const v4 = penView(f);
    results.push(
      check('Автокормушки: покупка регистрирует исполнителя pen.autofeeder; due-проход ЧАСОВОЙ ветки кормит всех голодных (Корм списан, satiety → 100, навоз +1 за кормление); hungryDays НЕ растёт при наличии Корма (4 дня без ручного ухода)', () =>
        registered &&
        v.animals.every((x) => x.satiety === 100) &&
        feedLeft === 8 && manure === 2 &&
        v4.animals.every((x) => x.hungryDays === 0) && (v4.manure?.manure ?? 0) === 8, {
        expected: 'исполнитель жив / накормлены / feed 10→2 / навоз 8 / hungryDays 0',
        actual: `reg ${String(registered)}, feed ${feedLeft}, навоз ${manure}→${v4.manure?.manure ?? 0}, hungry ${v4.animals.map((x) => x.hungryDays).join(',')}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 25. «Симбиоз»: dayTick навоз → Удобрение по курсу M05
  {
    const f = await makeSeededPenGame('m062-upg-symbiosis');
    f.game.wallet.grant('gold', 2000);
    f.game.wallet.grant('feed', 5);
    f.pen['pen.buy']('chicken');
    // навоз копим БЕЗ «Симбиоза» (кормление 1/день × 3 дня; часы синхронны
    // с дневными проходами — якорь fedDay читает time.now())
    f.pen['pen.feed'](0);
    for (let d = 1; d <= 2; d++) {
      f.clock.set(PEN_T0 + d * PEN_DAY);
      dayPass(f, PEN_T0 + d * PEN_DAY);
      f.pen['pen.feed'](0);
    }
    const before = penView(f).manure?.manure ?? 0;
    const fert0 = f.game.wallet.get('fertilizer');
    f.pen['pen.upgrade']('upg_symbiosis');
    f.clock.set(PEN_T0 + 3 * PEN_DAY);
    dayPass(f, PEN_T0 + 3 * PEN_DAY); // симбиоз: буфер → удобрение
    const after = penView(f).manure?.manure ?? 0;
    const fert1 = f.game.wallet.get('fertilizer');
    const tx = f.events.filter((e) => e.name === 'wallet.transaction' && e.payload.eventId === 'pen.compost');
    const farmUpgrades = f.game.content.get<Array<{ id: string; effect: { t: string } }>>('farm.upgrades') ?? [];
    const composter = farmUpgrades.find((u) => u.effect.t === 'composter');
    results.push(
      check('«Симбиоз»: буфер навоза (3 кормления) на dayTick → Удобрение по живому курсу компостера M05 (данные farm.upgrades upg_composter, 1:1; tx pen.compost в ленте; вызовов фермы нет — чтение реестра)', () =>
        before === 3 && after === 0 &&
        fert1 - fert0 === 3 && tx.length === 1 &&
        composter?.id === 'upg_composter', {
        expected: 'навоз 3 → 0, удобрение +3, tx 1, курс из upg_composter',
        actual: `навоз ${before}→${after}, удобрение ${fert0}→${fert1}, tx ${tx.length}, компостер ${composter?.id ?? '?'}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 26. «Второй загон»: animals2 + адресация + свой склад
  {
    const f = await makeSeededPenGame('m062-upg-pen2');
    f.game.wallet.grant('gold', 5000);
    f.game.wallet.grant('feed', 5);
    const early = f.pen['pen.buy']('chicken', 2) as R<unknown>;
    f.pen['pen.upgrade']('upg_second_pen');
    f.pen['pen.buy']('chicken', 2);
    f.pen['pen.buy']('goat', 2);
    const v = penView(f);
    const feed2 = f.pen['pen.feed'](0, 2) as R<unknown>;
    const clean2 = f.pen['pen.clean'](1, 2) as R<unknown>;
    const feedWrongPen = f.pen['pen.feed'](5, 2) as R<unknown>;
    hourPass(f, PEN_T0 + 6 * HOUR); // курица загона 2: яйцо в СВОЙ склад
    const full = f.pen['pen.state']() as {
      stock: Array<{ defId: string; qty: number }>;
      pen2?: { stock: Array<{ defId: string; qty: number }>; animals: unknown[]; slots: { used: number } };
    };
    results.push(
      check('«Второй загон»: без улучшения покупка в загон 2 — отказ; с улучшением — animals2 со своими 4 слотами (загон 1 пуст); уход адресуется параметром (feed/clean pen 2 живы, чужой idx — отказ); продукция загона 2 идёт в СВОЙ склад (egg 1, склад загона 1 пуст)', () =>
        !early.ok && early.error.includes('второй загон не построен') &&
        v.pen2 !== null && v.pen2 !== undefined && v.pen2.slots.used === 2 &&
        (full.pen2?.slots.used ?? 0) === 2 &&
        v.animals.length === 0 && v.slots.used === 0 &&
        feed2.ok && clean2.ok && !feedWrongPen.ok &&
        full.stock.length === 0 &&
        (full.pen2?.stock ?? []).some((s) => s.defId === 'egg' && s.qty === 1), {
        expected: 'отказ до покупки / 2 животных в pen2 / уход адресован / склад pen2 отдельный',
        actual: `early ${early.ok}, pen2 ${v.pen2?.slots.used ?? '-'}/4, уход ${feed2.ok}/${clean2.ok}, склад pen1 ${full.stock.length}, pen2 ${(full.pen2?.stock ?? []).map((s) => `${s.defId}:${s.qty}`).join(',')}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 27. исполнители ×4: реестр 6 → 10, worker.actionDone нет
  {
    const f = await makeSeededPenGame('m062-executors');
    f.game.wallet.grant('gold', 1000);
    f.game.wallet.grant('feed', 3);
    f.pen['pen.buy']('chicken');
    const penIds = ['pen.feed', 'pen.clean', 'pen.collect', 'pen.pet'];
    const has = penIds.map((id) => f.game.tasks.has(id));
    const all = [...penIds, 'pen.autofeeder', 'farm.plow', 'farm.plant', 'farm.water', 'farm.weed', 'farm.harvest', 'craft.queue'];
    const registryCount = all.filter((id) => f.game.tasks.has(id)).length;
    const fed = f.game.tasks.runTask('pen.feed', { now: PEN_T0, params: { idx: 0 } });
    const cleaned = f.game.tasks.runTask('pen.clean', { now: PEN_T0, params: { idx: 0 } });
    const petted = f.game.tasks.runTask('pen.pet', { now: PEN_T0, params: { idx: 0 } });
    const a = animalAt(f, 0);
    const workerEvents = f.events.filter((e) => e.name === 'worker.actionDone');
    results.push(
      check('исполнители pen.feed/clean/collect/pet — тонкие обёртки publicApi: реестр 6 → 10 (craft.queue + farm ×5 + pen ×4; pen.autofeeder — условная точка, без покупки не в реестре); runTask жив (кормление/чистка/глажение через реестр); worker.actionDone НЕ публикуется — домен M11', () =>
        has.every(Boolean) && registryCount === 10 &&
        fed.ok && cleaned.ok && petted.ok &&
        a.fedToday && a.pettedToday && a.cleanliness === 100 &&
        workerEvents.length === 0, {
        expected: 'реестр 10, runTask жив, worker.actionDone 0',
        actual: `pen ${has.filter(Boolean).length}/4, реестр ${registryCount}, run ${fed.ok}/${cleaned.ok}/${petted.ok}, worker.actionDone ${workerEvents.length}`,
      }),
    );
    f.dispose();
  }

  // ------------------------------------------------ 28. раундтрип новых полей байт-в-байт
  {
    const storage = new (await import('@/kernel/save/storage-drivers')).MemoryStorage();
    const f = makePenGame(storage);
    await f.game.init();
    f.game.wallet.grant('gold', 20000);
    f.game.wallet.grant('feed', 10);
    f.pen['pen.buy']('chicken');
    f.pen['pen.buy']('chicken');
    f.pen['pen.buy']('chicken');
    f.pen['pen.sick'](0); // больное животное — в срезе (sickAt/health 40)
    f.pen['pen.upgrade']('upg_barn');
    f.pen['pen.upgrade']('upg_second_pen');
    f.pen['pen.buy']('goat', 2);
    f.pen['pen.upgrade']('upg_breeding_pen');
    const breed = f.pen['pen.breed'](1, 2) as R<{ dueAt: number }>; // валидная здоровая пара → breeding в срезе (pending: dueAt = T0+48ч)
    f.pen['pen.feed'](1); // навоз +1 (буфер в срезе)
    await f.game.save.save();
    const raw = JSON.parse((await storage.get('main')) ?? '{}') as { modules: { pen: unknown } };
    const f2 = makePenGame(storage);
    await f2.game.init();
    await f2.game.save.save();
    const raw2 = JSON.parse((await storage.get('main')) ?? '{}') as { modules: { pen: unknown } };
    const pen = raw.modules.pen as Record<string, unknown>;
    results.push(
      check('раундтрип новых полей v11 БЕЗ bump: sickAt/manure/upgrades/breeding/animals2 в срезе; load+re-save байт-в-байт (ленивые дефолты НЕ дописываются — разведение pending, dueAt не тикает)', () =>
        breed.ok &&
        JSON.stringify(raw.modules.pen) === JSON.stringify(raw2.modules.pen) &&
        typeof pen.manure === 'number' && pen.manure === 1 &&
        typeof pen.upgrades === 'object' && pen.upgrades !== null &&
        typeof pen.breeding === 'object' && pen.breeding !== null &&
        Array.isArray(pen.animals2) && (pen.animals2 as unknown[]).length === 1 &&
        typeof (pen.animals as Array<{ sickAt?: number }>)[0]?.sickAt === 'number', {
        expected: 'срез идентичен после reload; sickAt/manure 1/upgrades/breeding/animals2 живы',
        actual: `идентично ${String(JSON.stringify(raw.modules.pen) === JSON.stringify(raw2.modules.pen))}, manure ${String(pen.manure)}, animals2 ${String((pen.animals2 as unknown[] | undefined)?.length)}, breeding ${pen.breeding !== undefined ? 'да' : 'нет'}`,
      }),
    );
    f.dispose();
    f2.dispose();
  }

  return results;
}
