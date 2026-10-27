/**
 * Сборка debug-консоли: реестр команд + исполнение строки.
 * UI вызывает executeCommand(input, ctx) — ядро не знает про React.
 */
import { CommandRegistry, type CommandContext } from './console-types';
import { registerCoreCommands } from './commands-core';
import { registerModCommands } from './commands-mods';
import { registerEconomyCommands } from './commands-economy';
import { registerRngCommands } from './commands-rng';
import { registerTimeSaveCommands } from './commands-time-save';
import { registerPlayerCommands } from './commands-player';
import { registerInventoryCommands } from './commands-inventory';
import { registerModForgeCommands } from './commands-modforge';
import { registerShopCommands } from './commands-shop';
import { registerCraftCommands } from './commands-craft';
import { registerCraftQueueCommands } from './commands-craft-queue';
import { registerForgeCommands } from './commands-forge';
import { registerFarmCommands } from './commands-farm';
import { registerFarmUpgradeCommands } from './commands-farm-upgrades';
import { registerQuestsCommands } from './commands-quests';
import { registerPenCommands } from './commands-pen';
import { registerPenCommands2 } from './commands-pen2';
import { registerFishingCommands } from './commands-fishing';
import { registerLakeCommands } from './commands-lake';
import { registerWorkersCommands } from './commands-workers';
import { registerMineCommands } from './commands-mine';
// [REG-1] живой реестр: агрегатор рантайм-реестров (модули/шины/сервисы/
// команды/контент) — списки расширяются сами, без ручных таблиц
import { registerRegistryCommands } from './commands-registry';

export { CommandRegistry } from './console-types';
export type { CommandContext, ConsoleCommand, ConsoleLine, LineKind } from './console-types';

let registry: CommandRegistry | null = null;

export function getCommandRegistry(): CommandRegistry {
  if (!registry) {
    registry = new CommandRegistry();
    registerCoreCommands(registry);
    registerModCommands(registry);
    registerEconomyCommands(registry);
    registerRngCommands(registry);
    registerTimeSaveCommands(registry);
    registerPlayerCommands(registry); // [M01] команды модуля игрока (карточка §7)
    registerInventoryCommands(registry); // [M02] команды модуля инвентаря (карточка §6)
    registerModForgeCommands(registry); // [M03] команды модфорджа (карточка §9)
    registerShopCommands(registry); // [M04] команды магазина (карточка §6)
    registerCraftCommands(registry); // [M09] команды крафта: витрины (карточка §6)
    registerCraftQueueCommands(registry); // [M09] команды крафта: очередь/сбор/ремонт
    registerForgeCommands(registry); // [M10] команды заточки: attempt/витрины/форс (карточка §6)
    registerFarmCommands(registry); // [M05] команды фермы: state/цикл FSM (карточка §7)
    registerFarmUpgradeCommands(registry); // [M05.3] улучшения: farm.upgrades/upgrade + каталог культур
    registerPenCommands(registry); // [M06] команды загона: state/buy/collect + уход + dev-форс (карточка §6)
    registerPenCommands2(registry); // [M06.2] болезни/улучшения/разведение/навоз (бриф §3.7)
    registerFishingCommands(registry); // [M07] команды рыбалки: state/tables/cast/buy + dev force (карточка §6)
    registerLakeCommands(registry); // [M08] команды озера: state/release/feed/treat/clean/harvest/buy + dev pair/force (карточка §6)
    registerWorkersCommands(registry); // [M11] команды работников: workers board/list/hire/fire/bonus + dev mood set / payday force (карточка §6)
    registerMineCommands(registry); // [M12] команды шахты: state/mob/fight/elite + --seed golden (карточка §6, бриф F8)
    registerQuestsCommands(registry); // [M15] команды квестов/ачивок (бриф §4.6: roll/list/complete/claim/reroll, ach unlock, flags list)
    registerRegistryCommands(registry); // [REG-1] живой реестр: модули M01–M15/шины/сервисы/команды/контент из рантайма
  }
  return registry;
}

/** Исполнить строку консоли. Возвращает true, если команда распознана. */
export function executeCommand(input: string, ctx: CommandContext): boolean {
  const reg = getCommandRegistry();
  const parsed = reg.parse(input);
  if (!parsed) {
    ctx.printErr(`команда не распознана: "${input}" — введите help`);
    return false;
  }
  try {
    void parsed.command.run(parsed.args, ctx);
    return true;
  } catch (e) {
    ctx.printErr(`команда упала: ${String(e)}`);
    return false;
  }
}
