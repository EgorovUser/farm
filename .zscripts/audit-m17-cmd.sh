#!/bin/bash
# .zscripts/audit-m17-cmd.sh — AUDIT-M17: команда в debug-консоль + вывод последних строк
# использование: audit-m17-cmd.sh "social.state" [строк-ответа]
CMD="$1"
N="${2:-40}"
agent-browser fill 'input[placeholder*="help"]' "$CMD" > /dev/null 2>&1
agent-browser press Enter > /dev/null 2>&1
sleep 1.2
agent-browser eval "(()=>{const el=document.querySelector('input[placeholder*=help]'); let scan=el.closest('div'); for(let k=0;k<6&&scan;k++){ if(scan.innerText&&scan.innerText.length>200) break; scan=scan.parentElement;} const t=(scan?.innerText||''); const parts=t.split('❯'); return parts.length>1 ? parts[parts.length-2] : t;})()" 2>&1 | head -"$N"
