import type { ReactNode } from 'react';

/**
 * Small, safe Markdown renderer for AI answers (UI-AI-001 contract gap 6:
 * `message` is plain model text; tables need safe Markdown rendering, no raw
 * HTML).
 *
 * Safety model: the output is built only from React elements and string
 * children, so React escapes every character of the model's text. There is
 * no `dangerouslySetInnerHTML`, no HTML parsing, no links/images/URLs (a
 * `[text](url)` stays literal text, so no `javascript:` URL can ever become
 * clickable) and no attribute is ever taken from the text. Raw HTML in an
 * answer therefore shows up as visible text, never as markup.
 *
 * Supported subset (what small instruct models typically produce):
 * paragraphs and line breaks, `#` headings (shown as bold lines), bullet and
 * numbered lists, GitHub-style tables (with `:---:` alignment; columns whose
 * cells are all numbers/amounts are right-aligned), fenced code blocks,
 * `---` rules, and inline **bold**, *italic*, `code`.
 * Written in-house instead of adding a Markdown dependency (owner rule: new
 * npm dependencies only with approval; this subset is small).
 */

type Align = 'left' | 'right' | 'center';

type Block =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'heading'; text: string }
  | { kind: 'list'; ordered: boolean; start: number; items: string[] }
  | { kind: 'table'; header: string[]; align: Align[]; rows: string[][] }
  | { kind: 'code'; text: string }
  | { kind: 'rule' };

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+•]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const NUMERIC_CELL = /^(Rs\.?\s?|PKR\s?)?[-+]?\d[\d,]*(\.\d+)?\s*%?$/i;

function splitRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '\\' && text[i + 1] === '|') {
      current += '|';
      i += 1;
    } else if (char === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseAlign(cell: string): Align {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  return 'left';
}

function isTableStart(lines: string[], index: number): boolean {
  const line = lines[index];
  const next = lines[index + 1];
  if (line === undefined || next === undefined) return false;
  return line.includes('|') && next.includes('-') && TABLE_SEPARATOR.test(next) && (next.includes('|') || line.trim().startsWith('|'));
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', lines: paragraph });
    paragraph = [];
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (FENCE.test(line)) {
      flushParagraph();
      const fence = line.trim().slice(0, 3);
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith(fence)) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      index += 1; // closing fence (or end of text)
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      flushParagraph();
      const header = splitRow(line);
      const align = splitRow(lines[index + 1] ?? '').map(parseAlign);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? '').includes('|') && (lines[index] ?? '').trim() !== '') {
        rows.push(splitRow(lines[index] ?? ''));
        index += 1;
      }
      blocks.push({ kind: 'table', header, align, rows });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: 'heading', text: heading[1] ?? '' });
      index += 1;
      continue;
    }

    if (RULE.test(line)) {
      flushParagraph();
      blocks.push({ kind: 'rule' });
      index += 1;
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = !bullet;
      const items: string[] = [];
      const start = ordered ? Number(ordered[1]) : 1;
      while (index < lines.length) {
        const current = lines[index] ?? '';
        const match = isOrdered ? ORDERED.exec(current) : BULLET.exec(current);
        if (match) {
          items.push((isOrdered ? match[2] : match[1]) ?? '');
          index += 1;
        } else if (current.trim() !== '' && /^\s{2,}\S/.test(current) && items.length > 0) {
          // Indented continuation line of the previous item.
          items[items.length - 1] = `${items[items.length - 1] ?? ''} ${current.trim()}`;
          index += 1;
        } else {
          break;
        }
      }
      blocks.push({ kind: 'list', ordered: isOrdered, start, items });
      continue;
    }

    paragraph.push(line.trim());
    index += 1;
  }
  flushParagraph();
  return blocks;
}

// Inline: `code`, **bold** / __bold__, *italic* / _italic_. Underscore
// emphasis needs non-word characters around it so identifiers such as
// inventory_get_stock_balances stay intact.
const INLINE_PATTERNS: { type: 'code' | 'strong' | 'em'; regex: RegExp }[] = [
  { type: 'code', regex: /`([^`\n]+)`/ },
  { type: 'strong', regex: /\*\*(?=\S)([\s\S]*?\S)\*\*/ },
  { type: 'strong', regex: /(?<![\w])__(?=\S)([\s\S]*?\S)__(?![\w])/ },
  { type: 'em', regex: /(?<![\w*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![\w*])/ },
  { type: 'em', regex: /(?<![\w])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\w])/ },
];

const MAX_INLINE_DEPTH = 4;

export function renderInline(text: string, depth = 0): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    let best: { type: 'code' | 'strong' | 'em'; match: RegExpExecArray } | null = null;
    if (depth < MAX_INLINE_DEPTH) {
      for (const pattern of INLINE_PATTERNS) {
        const match = pattern.regex.exec(rest);
        if (match && (best === null || match.index < best.match.index)) best = { type: pattern.type, match };
      }
    }
    if (!best) {
      nodes.push(rest);
      break;
    }
    if (best.match.index > 0) nodes.push(rest.slice(0, best.match.index));
    const inner = best.match[1] ?? '';
    if (best.type === 'code') {
      nodes.push(
        <code key={key} className="rounded bg-canvas-hover px-1 py-px font-mono text-[12px]">
          {inner}
        </code>,
      );
    } else if (best.type === 'strong') {
      nodes.push(
        <strong key={key} className="font-semibold">
          {renderInline(inner, depth + 1)}
        </strong>,
      );
    } else {
      nodes.push(<em key={key}>{renderInline(inner, depth + 1)}</em>);
    }
    key += 1;
    rest = rest.slice(best.match.index + best.match[0].length);
  }
  return nodes;
}

function columnAlign(table: Extract<Block, { kind: 'table' }>, column: number): Align {
  const explicit = table.align[column];
  if (explicit && explicit !== 'left') return explicit;
  const cells = table.rows.map(row => (row[column] ?? '').replace(/\*\*/g, '').trim()).filter(cell => cell !== '');
  if (cells.length > 0 && cells.every(cell => NUMERIC_CELL.test(cell))) return 'right';
  return 'left';
}

const ALIGN_CLASS: Record<Align, string> = { left: 'text-left', right: 'text-right', center: 'text-center' };

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.kind) {
    case 'paragraph':
      return (
        <p key={index} className="text-[13px] leading-5 text-ink">
          {block.lines.map((line, lineIndex) => (
            <span key={lineIndex}>
              {lineIndex > 0 ? <br /> : null}
              {renderInline(line)}
            </span>
          ))}
        </p>
      );
    case 'heading':
      return (
        <p key={index} className="text-[13px] font-semibold leading-5 text-ink">
          {renderInline(block.text)}
        </p>
      );
    case 'rule':
      return <hr key={index} className="border-line" />;
    case 'code':
      return (
        <pre
          key={index}
          className="overflow-x-auto rounded-control border border-line bg-canvas-sunken p-2 font-mono text-[12px] leading-[18px] text-ink"
        >
          <code>{block.text}</code>
        </pre>
      );
    case 'list': {
      const items = block.items.map((item, itemIndex) => (
        <li key={itemIndex} className="pl-1">
          {renderInline(item)}
        </li>
      ));
      return block.ordered ? (
        <ol key={index} start={block.start} className="list-decimal space-y-0 pl-5 text-[13px] leading-5 text-ink">
          {items}
        </ol>
      ) : (
        <ul key={index} className="list-disc space-y-0 pl-5 text-[13px] leading-5 text-ink">
          {items}
        </ul>
      );
    }
    case 'table': {
      const columns = Math.max(block.header.length, ...block.rows.map(row => row.length));
      const aligns = Array.from({ length: columns }, (_, column) => columnAlign(block, column));
      return (
        <div key={index} className="w-full overflow-x-auto rounded-control border border-line bg-canvas" data-testid="ai-md-table">
          <table className="w-full border-collapse">
            <thead className="bg-canvas-sunken">
              <tr className="border-b border-line">
                {aligns.map((align, column) => (
                  <th
                    key={column}
                    scope="col"
                    className={`whitespace-nowrap px-2.5 py-1.5 text-[10.5px] font-semibold uppercase leading-[14px] tracking-[0.04em] text-ink-secondary ${ALIGN_CLASS[align]}`}
                  >
                    {renderInline(block.header[column] ?? '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-line last:border-b-0">
                  {aligns.map((align, column) => (
                    <td
                      key={column}
                      className={`px-2.5 py-[7px] text-[12px] leading-4 text-ink ${ALIGN_CLASS[align]} ${
                        column === 0 ? 'font-medium' : ''
                      }`}
                    >
                      {renderInline(row[column] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }
}

export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return <div className="flex w-full flex-col gap-2 break-words">{blocks.map(renderBlock)}</div>;
}
