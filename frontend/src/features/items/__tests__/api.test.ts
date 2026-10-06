import { afterEach, describe, expect, it, vi } from 'vitest';
import { getItem, listItems } from '../api';

function jsonResponse(body: unknown, headers: Record<string, string> = {}, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('items api (INV-ITEM-LIST-001 contract)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists without query params by default and reports a complete list when the header is absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listItems()).resolves.toEqual({ items: [], truncated: false });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/inventory/items');
  });

  it('sends a trimmed, encoded search and reads X-Result-Truncated: true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ id: '1' }], { 'X-Result-Truncated': 'true' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listItems({ search: '  50% & co ' })).resolves.toEqual({ items: [{ id: '1' }], truncated: true });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/inventory/items?search=50%25+%26+co');
  });

  it('omits a blank search', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    await listItems({ search: '   ' });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/inventory/items');
  });

  it('surfaces list errors instead of an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'FORBIDDEN', message: 'no' }, {}, 403)));
    await expect(listItems()).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('gets one item by encoded id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'a/b' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getItem('a/b')).resolves.toEqual({ id: 'a/b' });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/inventory/items/a%2Fb');
  });
});
