/**
 * Headless-раннер runtime self-checks (инструмент верификации FIX-0.1; НЕ игровой код).
 * Запуск: `bun scripts/selftest.ts`
 * Тот же набор проверок, что и в debug-консоли (`selftest`) — только без браузера.
 * Драйверы сейва в node-среде деградируют в MemoryStorage (typeof-гарды).
 */
import { runAllSelfChecks, summarize } from '@/selfchecks/runner';

const groups = await runAllSelfChecks();
const s = summarize(groups);
for (const g of groups) {
  const passed = g.results.filter((r) => r.passed).length;
  console.log(`${g.passed ? 'OK ' : 'FAIL'} ${g.name}: ${passed}/${g.results.length}`);
  for (const r of g.results) {
    if (!r.passed) {
      console.log(`      X ${r.name}${r.expected ? ` (ожидалось: ${r.expected}, факт: ${r.actual})` : ''}`);
    }
  }
}
console.log(`ИТОГ: ${s.passed}/${s.total} проверок зелёные`);
process.exit(s.failed === 0 ? 0 : 1);
