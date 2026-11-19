// Generates docs/MISTAKE_MATRIX.md from src/game/rules/matrix.ts (single source of truth).
// Run: npm run matrix
import { writeFileSync } from 'node:fs';
import { MISTAKES, MATRIX_CONFIG, ACTION_LABEL, sourceLine, type Cell } from '../src/game/rules/matrix';
import { RULES_VERSION, DATE_CHECKED, SRC } from '../src/game/rules/registry';

const cell = (c: Cell) => (c.action === 'none' ? '—' : `${ACTION_LABEL[c.action]}${c.exam?.length ? ` (${c.exam.join(', ')})` : ''}`);
const affects = (c: Cell, exam: boolean) => (c.action === 'none' ? '—' : exam ? (c.action === 'gameOnly' ? 'не (игра)' : 'испит') : c.action === 'note' ? 'час (совет)' : 'резултат од часот');
const rows = MISTAKES.map((m) => `| ${m.title}${m.detected ? '' : ' *(не е детектирано)*'} | ${m.did} | ${m.detect} | ${cell(m.lesson.polygon)} | ${cell(m.lesson.city)} | ${cell(m.exam.polygon)} | ${cell(m.exam.city)} | ${affects(m.lesson.city.action !== 'none' ? m.lesson.city : m.lesson.polygon, false)} / ${affects(m.exam.city.action !== 'none' ? m.exam.city : m.exam.polygon, true)} | ${sourceLine(m, m.exam.city.action !== 'none' ? m.exam.city : m.exam.polygon)} — ${m.why} | ${m.status === 'confirmed' ? 'потврдено' : '**за проверка од инструктор**'} |`);
const md = `# Матрица на грешки — Часови / Полагање × Полигон / Градска

Генерирано од \`src/game/rules/matrix.ts\` (регистар ${RULES_VERSION}, проверено ${DATE_CHECKED}). Не уредувај рачно — \`npm run matrix\`.

Три работи се држат одвоено: **сообраќаен закон** (ЗБСП), **официјални критериуми на испитот** (Образец бр. 1 и бр. 4, Правилник Сл. весник 29/2025) и **дополнителни игровни казни**.

- Праг: над **${MATRIX_CONFIG.examThreshold.polygon}** негативни поени = не положено (полигон: ${MATRIX_CONFIG.examThresholdStatus.polygon === 'confirmed' ? 'потврдено, чл. 36 ст. 2' : 'за проверка'}; градска: ${MATRIX_CONFIG.examThresholdStatus.city === 'confirmed' ? 'потврдено' : 'иста вредност, **за проверка од инструктор**'}).
- Ставка вредна повеќе од прагот сама по себе = испитот завршува (\`examEndOnCritical: ${MATRIX_CONFIG.examEndOnCritical}\`, практиката на испитувачот е **за проверка**).
- Часови никогаш не носат официјални поени; влијаат само на резултатот од часот.
- Извори: [${SRC.law.title}](${SRC.law.url}) · [${SRC.exam.title}](${SRC.exam.url}) · [${SRC.handbook.title}](${SRC.handbook.url})

| Грешка | Што направи играчот | Како се детектира | Часови · Полигон | Часови · Градска | Полагање · Полигон | Полагање · Градска | Влијае на (час / испит) | Извор и причина | Статус |
|---|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
writeFileSync('docs/MISTAKE_MATRIX.md', md);
console.log(`docs/MISTAKE_MATRIX.md — ${MISTAKES.length} mistakes`);
