import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Markdown, parseBlocks } from '../markdown';

describe('Markdown (safe in-house renderer)', () => {
  it('renders bold, italic and inline code without touching snake_case identifiers', () => {
    const { container } = render(
      <Markdown text={'**Cooking Oil** — total *86.5 L*, tool `inventory_get_stock_balances` and inventory_list_suppliers'} />,
    );
    expect(container.querySelector('strong')).toHaveTextContent('Cooking Oil');
    expect(container.querySelector('em')).toHaveTextContent('86.5 L');
    expect(container.querySelector('code')).toHaveTextContent('inventory_get_stock_balances');
    expect(container).toHaveTextContent('inventory_list_suppliers');
    expect(container.querySelectorAll('em')).toHaveLength(1);
  });

  it('renders bullet and numbered lists', () => {
    const { container } = render(<Markdown text={'In 2 locations:\n- Main Store — 72 L\n• Lower Kitchen — 14.5 L\n\n1. First\n2. Second'} />);
    const lists = container.querySelectorAll('ul, ol');
    expect(lists).toHaveLength(2);
    expect(lists[0]?.querySelectorAll('li')).toHaveLength(2);
    expect(lists[1]?.tagName).toBe('OL');
    expect(lists[1]?.querySelectorAll('li')).toHaveLength(2);
  });

  it('renders a GitHub-style table, right-aligning numeric columns and honouring :--- alignment', () => {
    const text = [
      'Lowest rate: **Punjab Oil Mills**.',
      '',
      '| Supplier | Pack | Rate / L | Purchases | Note |',
      '|---|---|---|---:|:---:|',
      '| Punjab Oil Mills | 16 L tin | Rs 528.13 | 3 | ok |',
      '| Al-Madina Traders | 10 L tin | **Rs 545.00** | 4 | ok |',
    ].join('\n');
    render(<Markdown text={text} />);
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map(header => header.textContent)).toEqual(['Supplier', 'Pack', 'Rate / L', 'Purchases', 'Note']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(headers[0]).toHaveClass('text-left');
    expect(headers[2]).toHaveClass('text-right'); // auto: all cells are amounts
    expect(headers[3]).toHaveClass('text-right'); // explicit ---:
    expect(headers[4]).toHaveClass('text-center'); // explicit :---:
    expect(within(table).getByText('Rs 545.00').tagName).toBe('STRONG');
  });

  it('never renders raw HTML: tags, event handlers and script stay visible text', () => {
    const attack = '<img src=x onerror="alert(1)"> <script>alert(2)</script> <b>bold?</b> <a href="javascript:alert(3)">x</a>';
    const { container } = render(<Markdown text={`${attack}\n\n| a | b |\n|---|---|\n| <iframe src="//evil"> | <svg onload=alert(4)> |`} />);
    for (const tag of ['img', 'script', 'b', 'a', 'iframe', 'svg']) {
      expect(container.querySelector(tag)).toBeNull();
    }
    expect(container).toHaveTextContent('<img src=x onerror="alert(1)">');
    expect(container).toHaveTextContent('<script>alert(2)</script>');
    expect(container).toHaveTextContent('<iframe src="//evil">');
    expect(container.innerHTML).not.toMatch(/<(img|script|iframe|a|svg)[\s>]/);
  });

  it('keeps Markdown links and images as plain text (no clickable URL from model text)', () => {
    const { container } = render(<Markdown text={'See [details](javascript:alert(1)) and ![x](http://evil/x.png)'} />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('[details](javascript:alert(1))');
  });

  it('renders fenced code blocks literally', () => {
    const { container } = render(<Markdown text={'```\n**not bold** <b>x</b>\n```'} />);
    const pre = container.querySelector('pre');
    expect(pre).toHaveTextContent('**not bold** <b>x</b>');
    expect(pre?.querySelector('strong')).toBeNull();
  });

  it('keeps line breaks inside a paragraph and treats headings as bold lines', () => {
    expect(parseBlocks('## Summary\nline one\nline two')).toEqual([
      { kind: 'heading', text: 'Summary' },
      { kind: 'paragraph', lines: ['line one', 'line two'] },
    ]);
    const { container } = render(<Markdown text={'line one\nline two'} />);
    expect(container.querySelectorAll('br')).toHaveLength(1);
  });

  it('does not hang or crash on pathological input', () => {
    const nasty = `${'**'.repeat(2000)}${'_'.repeat(2000)}${'|'.repeat(500)}\n${'|---'.repeat(200)}`;
    const started = Date.now();
    render(<Markdown text={nasty} />);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
