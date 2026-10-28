#!/bin/bash
# M16.1 helper: команда в debug-консоли + чтение ответа (eval-обёртка)
CMD="$1"
N="${2:-14}"
agent-browser find role textbox fill --name "Командная строка отладочной консоли" "$CMD" > /dev/null 2>&1
agent-browser press Enter > /dev/null 2>&1
sleep 1.3
agent-browser eval "(() => { const j = document.querySelector('.min-h-0.flex-1.overflow-y-auto'); if (!j) return 'NOJ'; const es = Array.from(j.children).map(e => e.textContent.replace(/^[0-9]{2}:[0-9]{2}:[0-9]{2}/, '')); let k = -1; for (let x = 0; x < es.length; x++) if (es[x].startsWith('❯')) k = x; return k < 0 ? JSON.stringify(es.slice(-8)) : JSON.stringify(es.slice(k, k + ${N})); })()" 2>&1 | tail -1
