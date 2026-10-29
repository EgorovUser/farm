/**
 * SocialModule (M17) — витринные соц-заглушки Фазы 5: доска новостей
 * деревни, письма дня, профиль-заглушка. ЧИСТАЯ проекция ЖИВОГО
 * состояния и даты (бриф [DECISION M171-объём]): лениво, dailySeed/
 * dateISO; публикация/подписка событий = 0; транзакции/счётчики/
 * провайдеры шин = 0 — экономически нейтральный модуль (замок
 * done-критерия Фазы 5). Чтение деревни — ТОЛЬКО через deps-витрины
 * publicApi village (П4: 0 импортов игровых модулей); дата/saveId/
 * счётчики/имена — сервисы ядра из ModuleContext.
 *
 * Срез [DECISION M171-срез]: { v: 1, mailReadDay? } — ленивая
 * материализация ТОЛЬКО при `social.mail read`; чтения витрин сейв
 * не трогают (пост-wipe тишина). Дев-рероллы `social force` —
 * сеансовая память (сид-суффикс #N, прецедент rerolls биржи M16.3);
 * mailReadDay НЕ сбрасывают — двойных «непрочитанных» не дают.
 */
import type { GameModule, ModuleContext } from '@/game/module-registry';
import type { SocialMailTable, SocialNewsTable, SocialProfileTable } from '@/content/social/types';
import { createSocialManifest } from './manifest';
import { canonicalSocialState, defaultSocialState, socialSaveSlice, type SocialState } from './state';
import type { SocialModuleDeps, SocialVitrines } from './deps';
import {
  buildBoardView,
  buildMailView,
  buildProfileView,
  buildSocialStateView,
  type BoardView,
  type MailView,
  type ProfileView,
  type SocialStateView,
} from './view';

export interface SocialForceReceipt {
  header: string;
  lines: string[];
}

export class SocialModule implements GameModule {
  readonly manifest = createSocialManifest();
  api: Record<string, (...args: unknown[]) => unknown> = {};
  private state: SocialState = defaultSocialState();
  private readonly deps: SocialModuleDeps;
  /** сеансовые дев-рероллы social force (в срез НЕ пишутся — шапка state.ts) */
  private rerolls = 0;
  private newsTable: SocialNewsTable | null = null;
  private mailTable: SocialMailTable | null = null;
  private profileTable: SocialProfileTable | null = null;
  private markDirty: () => void = () => {};
  private time: ModuleContext['time'] | null = null;
  private content: ModuleContext['content'] | null = null;
  private stats: ModuleContext['stats'] | null = null;
  private saveCtx: ModuleContext['save'] | null = null;

  constructor(deps: SocialModuleDeps) {
    this.deps = deps;
  }

  activate(ctx: ModuleContext): void {
    const { save, content, time, stats } = ctx;
    this.newsTable = content.get<SocialNewsTable>('social.news');
    this.mailTable = content.get<SocialMailTable>('social.mail');
    this.profileTable = content.get<SocialProfileTable>('social.profile');
    this.time = time;
    this.content = content;
    this.stats = stats;
    this.saveCtx = save;
    this.markDirty = () => save.markDirty();

    save.registerSlice(
      'social',
      socialSaveSlice(
        () => this.state,
        (s) => {
          this.state = s;
        },
      ),
    );

    this.api = {
      'social.state': (): SocialStateView => this.stateView(),
      'social.board': (): BoardView => this.boardView(),
      // под-действие 'read' — пометить прочитанным (идемпотентно, бриф G3)
      'social.mail': (action?: unknown): MailView => this.mailView(action === undefined ? '' : String(action)),
      'social.profile': (): ProfileView => this.profileView(),
      // dev (бриф G1: помечен dev — прецедент village.force)
      'social.force': (): SocialForceReceipt => this.forceReroll(),
    };
  }

  deactivate(): void {
    this.api = {};
  }

  getState(): SocialState {
    return this.state;
  }

  // ------------------------------------------------------------ приватный контекст

  private today(): string {
    return this.time!.localDateISO(this.time!.now());
  }

  private now(): number {
    return this.time!.now();
  }

  private saveId(): string {
    return this.saveCtx!.getSaveId();
  }

  /** имя предмета/валюты: общий каталог items (прецедент village.itemName) */
  private itemName(defId: string): string {
    const items = this.content!.get<Array<{ id: string; name: string }>>('items');
    return items.find((d) => d.id === defId)?.name ?? defId;
  }

  /** живые витрины деревни через deps (структурные типы deps.ts) */
  private vitrines(): SocialVitrines {
    return {
      state: this.deps.villageState(),
      trade: this.deps.villageTrade(),
      raid: this.deps.villageRaid(),
      buildings: this.deps.villageBuildings(),
    };
  }

  // ------------------------------------------------------------ витрины

  private stateView(): SocialStateView {
    return buildSocialStateView(this.vitrines(), this.state, { dateISO: this.today(), rerolls: this.rerolls });
  }

  private boardView(): BoardView {
    return buildBoardView(this.deps, this.vitrines(), this.newsTable!, {
      saveId: this.saveId(),
      dateISO: this.today(),
      itemName: (d) => this.itemName(d),
      rerolls: this.rerolls,
    });
  }

  private mailView(action: string): MailView {
    const day = this.today();
    if (action === 'read') {
      // маркер прочтения: повтор идемпотентен (та же запись — бриф G3);
      // материализует срез { v: 1, mailReadDay } — первое обращение
      if (this.state.mailReadDay !== day) {
        this.state = canonicalSocialState({ ...this.state, mailReadDay: day });
        this.markDirty();
      }
    }
    return buildMailView(this.vitrines(), this.mailTable!, this.state, {
      saveId: this.saveId(),
      dateISO: day,
      itemName: (d) => this.itemName(d),
      rerolls: this.rerolls,
    });
  }

  private profileView(): ProfileView {
    return buildProfileView(this.deps, this.vitrines(), this.profileTable!, {
      dateISO: this.today(),
      counters: this.stats!.snapshot(),
    });
  }

  // ------------------------------------------------------------ dev

  /** реролл витрин дня: сид-суффикс #N (сеансовая память); mailReadDay
   *  НЕ трогается — бейдж «непрочитано» не сфабрикован (бриф G1/G3) */
  private forceReroll(): SocialForceReceipt {
    this.rerolls += 1;
    const readDay = this.state.mailReadDay ?? null;
    return {
      header: `Соц-витрины перегенерированы (dev reroll #${this.rerolls})`,
      lines: [
        `доска/письма дня ${this.today()} — новый ролл по сид-суффиксу #${this.rerolls} (потоки social-board/social-letters)`,
        `mailReadDay НЕ тронут: ${readDay ?? '—'} — бейдж «непрочитано» честен`,
        'сеансовая память: после перезагрузки витрины вернутся к базовому сиду дня (срез social не расширяется)',
      ],
    };
  }
}
