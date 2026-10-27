'use client';

/**
 * Таблица сейва: действия (сохранить/скачать/сброс) + инспекция SaveDirector.
 * Перенос из state-panel.tsx + срезы и живые даты (v11).
 */
import { Download, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/stores/game-store';
import { getGame } from '@/game/game-instance';
import { formatClock, formatDateTime } from '@/shared/utils/format';
import { Row } from './shared';

export function SaveTab() {
  const runCommand = useGameStore((s) => s.runCommand);
  const saveInfo = useGameStore((s) => s.saveInfo);

  const downloadSave = () => {
    const json = getGame().save.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `koreni-ruda-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="h-8 border-zinc-700 bg-transparent text-[11px] hover:bg-zinc-800" onClick={() => runCommand('save now')}>
          <Save className="mr-1 size-3.5" /> сохранить
        </Button>
        <Button size="sm" variant="outline" className="h-8 border-zinc-700 bg-transparent text-[11px] hover:bg-zinc-800" onClick={downloadSave}>
          <Download className="mr-1 size-3.5" /> скачать JSON
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 border-red-900/60 bg-transparent text-[11px] text-red-400 hover:bg-red-950/40"
          onClick={() => {
            if (window.confirm('Стереть сейв полностью? Прогресс не восстановить.')) {
              runCommand('save wipe');
            }
          }}
        >
          <Trash2 className="mr-1 size-3.5" /> сброс
        </Button>
      </div>

      {saveInfo ? (
        <>
          <Row label="формат" value={`v${saveInfo.saveVersion}`} tone="text-amber-300" />
          <Row label="хранилище" value={saveInfo.storageKind} />
          <Row label="saveId" value={saveInfo.saveId} hint="основа детерминизма роллов квестов (M15 §3)" />
          <Row label="записан" value={formatDateTime(saveInfo.savedAt)} hint={`последняя активность: ${formatClock(saveInfo.lastSeen)}`} />
          <Row label="не сохранено" value={saveInfo.dirty ? 'есть изменения' : 'чисто'} tone={saveInfo.dirty ? 'text-amber-400' : 'text-emerald-400'} />
          <div className="mt-2">
            <p className="mb-1.5 text-[10px] text-zinc-600">срезы ({saveInfo.slices.length}):</p>
            <div className="flex flex-wrap gap-1">
              {saveInfo.slices.map((s) => (
                <span key={s} className="rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-px font-mono text-[10px] text-zinc-400">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <Row label="сейв" value="ещё не инициализирован" />
      )}

      <p className="mt-3 text-[10px] leading-snug text-zinc-600">
        автосейв каждые 30 с и при сворачивании вкладки · экспорт/импорт — формат 02-BUSES §11: save export / save import {'{…}'}
      </p>
    </div>
  );
}
