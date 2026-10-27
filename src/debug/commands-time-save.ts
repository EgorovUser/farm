/**
 * Команды времени и сейва: time, time +Nh, catchup, save info/now/export/import/wipe.
 */
import type { CommandRegistry } from './console-types';
import { formatDateTime, formatDuration, parseDurationToMs } from '@/shared/utils/format';
import { DebugClock } from '@/kernel/di/clock';
import { MS_HOUR } from '@/shared/utils/math';

export function registerTimeSaveCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'time',
    usage: 'time | time +3h | time +2d',
    description: 'время игры; сдвиг отладочных часов + оффлайн-досчёт',
    run(args, ctx) {
      const arg = args[0];
      if (!arg) {
        const now = ctx.game.time.now();
        ctx.printTitle('Время');
        ctx.print(`  сейчас:        ${formatDateTime(now)}`);
        ctx.print(`  тиков ядра:    ${ctx.game.time.ticks} (1 тик = 1 игровая минута)`);
        // [FIX-0.1 D] честный текст: сид действительно привязан к дню (dailySeed(saveId+дата)),
        // смена дня (dayTick) пересеивает стримы — раньше фраза была ложью (DEBT-1)
        ctx.print(`  дата дня:      ${ctx.game.time.localDateISO(now)}`);
        ctx.print(`  сид рандома:   ${ctx.game.rngBus.seed} = dailySeed(saveId + дата) — смена дня пересеивает стримы`);
        return;
      }
      const m = /^([+-])(.+)$/.exec(arg);
      if (!m) return ctx.printErr('формат: time +3h / time +2d / time +30m');
      const ms = parseDurationToMs(m[2]);
      if (ms === null) return ctx.printErr('не разобран срок, примеры: +30m, +3h, +2d');
      const delta = m[1] === '-' ? -ms : ms;
      const { advancedMs, report } = ctx.game.advanceTime(delta);
      if (advancedMs === 0) return ctx.printErr('часы игры не управляемы (не DebugClock)');
      ctx.printOk(`время сдвинуто на ${formatDuration(Math.abs(advancedMs))} → ${formatDateTime(ctx.game.time.now())}`);
      if (report) {
        ctx.print(`  оффлайн-досчёт: hourTick ×${report.hoursFired}${report.hoursCapped ? ` (КАП! нужно ${report.hoursNeeded})` : ''}, dayTick ×${report.daysFired}${report.daysCapped ? ` (КАП! нужно ${report.daysNeeded})` : ''}`);
      } else {
        ctx.print('  оффлайн-досчёт: часовых границ не пересечено');
      }
      ctx.refresh();
    },
  });

  registry.register({
    name: 'catchup',
    usage: 'catchup simulate <часы>',
    description: 'симуляция оффлайн-досчёта от последнего сейва',
    run(args, ctx) {
      if (args[0] !== 'simulate') return ctx.printErr('формат: catchup simulate 8');
      const hours = Number(args[1]);
      if (!Number.isFinite(hours) || hours <= 0) return ctx.printErr('укажите количество часов');
      const { report } = ctx.game.advanceTime(hours * MS_HOUR);
      if (!report) return ctx.printErr('досчёт не выполнен');
      ctx.printTitle(`Оффлайн-отчёт (${formatDuration(report.awayMs)})`);
      ctx.print(`  hourTick: ${report.hoursFired}${report.hoursCapped ? ` из ${report.hoursNeeded} (кап 72)` : ''}`);
      ctx.print(`  dayTick:  ${report.daysFired}${report.daysCapped ? ` из ${report.daysNeeded} (кап 14)` : ''}`);
      ctx.print(`  минутные тики не проигрывались (абсолютные даты пересчитываются модулями)`);
      ctx.refresh();
    },
  });

  registry.register({
    name: 'save',
    usage: 'save info | save now | save export | save import <json> | save wipe',
    description: 'сейв: информация, запись, экспорт/импорт JSON, сброс',
    run(args, ctx) {
      switch (args[0]) {
        case 'now': {
          // [MISS-1 · FIX-PHASE-2] честный текст: после вайпа сейвы молчат до F5
          if (ctx.game.save.isWiped()) {
            return ctx.printErr('сейв стёрт (post-wipe): записи остановлены до перезагрузки — F5 начнёт новую игру');
          }
          void ctx.game.save.save().then(() => {
            ctx.printOk('сейв записан');
            ctx.refresh();
          });
          return;
        }
        case 'import': {
          // [FIX-0.1 J] 02-BUSES §11 декларирует импорт JSON — раньше он был
          // недостижим пользователем (DEBT-11). Валидация и миграции — как при
          // обычной загрузке; отказ не трогает текущее состояние.
          // Ограничение токенизатора: двойные пробелы внутри JSON-строк схлопнутся
          // (однострочная вставка экспорта этим не ломается).
          const json = args.slice(1).join(' ').trim();
          if (!json) {
            return ctx.printErr('вставьте JSON сейва сразу после команды: save import { … } (экспорт — save export)');
          }
          if (!json.startsWith('{')) {
            return ctx.printErr('это не JSON сейва (ожидается { … }) — текущее состояние не тронуто');
          }
          ctx.game.save.importJson(json).then(
            (data) => {
              // пересев рандома под новый saveId (FIX-0.1 D): сид = dailySeed(saveId+дата)
              ctx.game.rngBus.setSeed(
                ctx.game.rngBus.dailySeed(data.saveId, ctx.game.time.localDateISO(ctx.game.time.now())),
              );
              ctx.printOk(
                `сейв импортирован: версия ${data.saveVersion}, saveId ${String(data.saveId).slice(0, 8)}… — состояние применено и записано`,
              );
              ctx.refresh();
            },
            (e: unknown) => {
              ctx.printErr(`импорт отклонён: ${String(e)} — текущее состояние не тронуто`);
            },
          );
          return;
        }
        case 'export': {
          const json = ctx.game.save.exportJson();
          ctx.printTitle('Сейв · экспорт JSON');
          for (const line of json.split('\n')) ctx.print(`  ${line}`);
          ctx.printWarn('полный JSON доступен в панели «Сейв» справа (кнопка «Скачать»)');
          return;
        }
        case 'wipe': {
          void ctx.game.save.wipe().then(() => {
            ctx.game.buffs.clear();
            // [FIX-0.1 H] полный сброс = и смещение часов на место
            if (ctx.game.clock instanceof DebugClock) ctx.game.clock.setOffset(0);
            // [MISS-1 · FIX-PHASE-2] автосейв остановлен самим wipe(): в окне
            // «вайп → F5» ни один интервальный/visibility-сейв не унаследует
            // старое состояние под новым saveId (гонка AUDIT-M15 закрыта)
            ctx.printOk('сейв стёрт — автосейв остановлен; F5 начнёт новую игру (новый saveId = новые дневные роллы)');
            ctx.refresh();
          });
          return;
        }
        case 'info':
        default: {
          const info = ctx.game.save.info();
          ctx.printTitle('Сейв');
          ctx.print(`  версия формата:  ${info.saveVersion}`);
          ctx.print(`  saveId:          ${info.saveId}`);
          ctx.print(`  контент:         ${info.contentVersion}`);
          ctx.print(`  записан:         ${info.savedAt ? formatDateTime(info.savedAt) : 'ещё не сохранялся'}`);
          ctx.print(`  хранилище:       ${info.storageKind}`);
          ctx.print(`  срезы:           ${info.slices.join(', ')}`);
          return;
        }
      }
    },
  });
}
