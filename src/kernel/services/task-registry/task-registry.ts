/**
 * TaskRegistry — реестр исполнителей (02-BUSES §10).
 * «Модули не знают друг друга, но работники могут выполнять их работу»:
 * система-исполнитель регистрирует задачу ('farm.water'), координатор
 * (WorkersDirector, фаза 3) берёт её по id. Отсутствие исполнителя — штатный отказ.
 */
import type { Result } from '@/shared/types/result';
import { err, ok } from '@/shared/types/result';

export interface TaskContext {
  now: number;
  workerId?: string;
  /** произвольные параметры от заказчика */
  params?: Record<string, unknown>;
}

export interface TaskResultInfo {
  message?: string;
  [key: string]: unknown;
}

export interface TaskExecutor {
  /** человекочитаемое описание задачи */
  label?: string;
  run(ctx: TaskContext): Result<TaskResultInfo>;
}

export class TaskRegistry {
  private readonly tasks = new Map<string, TaskExecutor>();

  register(taskId: string, executor: TaskExecutor): void {
    this.tasks.set(taskId, executor);
  }

  unregister(taskId: string): boolean {
    return this.tasks.delete(taskId);
  }

  has(taskId: string): boolean {
    return this.tasks.has(taskId);
  }

  /** Штатный отказ, если исполнитель не зарегистрирован */
  runTask(taskId: string, ctx: TaskContext): Result<TaskResultInfo> {
    const executor = this.tasks.get(taskId);
    if (!executor) return err(`исполнитель "${taskId}" не зарегистрирован`);
    try {
      return executor.run(ctx);
    } catch (e) {
      return err(`исполнитель "${taskId}" упал: ${String(e)}`);
    }
  }

  list(): Array<{ id: string; label?: string }> {
    return [...this.tasks.entries()]
      .map(([id, executor]) => ({ id, label: executor.label }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}
