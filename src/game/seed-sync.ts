/**
 * SeedSync — управление сидом дневных ротаций (02-BUSES §6, [FIX-0.1 D]).
 * Сид = dailySeed(saveId + дата часов). dayTick пересеивает по каждому
 * пропущенному дню; syncToClock выравнивает под текущую дату часов после
 * капнутого досчёта (иначе последний dayTick оставлял «старый» день).
 *
 * [M01 · DEBT-15] syncToClock синхронизирует lastDate и после ЗАГРУЗКИ сейва
 * с cross-day offset: bootstrap.initGame зовёт его сразу за пересевом, иначе
 * возврат времени (time -1d после F5) оставлял сид от чужого дня — no-op.
 */
import { dailySeed } from '@/shared/utils/rng';

export interface SeedSyncDeps {
  setSeed(seed: number): void;
  saveId(): string;
  /** локальная дата ISO (YYYY-MM-DD) для момента времени */
  dateISO(now: number): string;
  now(): number;
}

export class SeedSync {
  private lastDate: string | null = null;

  constructor(private readonly deps: SeedSyncDeps) {}

  /** пересев под конкретный день (dayTick несёт dateISO каждого пропущенного дня) */
  reseed(dateISO: string): void {
    this.deps.setSeed(dailySeed(this.deps.saveId(), dateISO));
    this.lastDate = dateISO;
  }

  onDayTick(dateISO: string | undefined): void {
    this.reseed(dateISO ?? this.deps.dateISO(this.deps.now()));
  }

  /** выравнивание под текущую дату часов; безкаповый случай — no-op по датам */
  syncToClock(): void {
    const today = this.deps.dateISO(this.deps.now());
    if (today !== this.lastDate) this.reseed(today);
  }
}
