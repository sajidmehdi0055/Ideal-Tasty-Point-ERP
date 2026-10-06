import { afterEach, describe, expect, it, vi } from 'vitest';
import { listItems, listItemsPage } from './api';

function stubFetch(headers: Record<string, string> = {}) {
  const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200, headers }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('items api — list/search (INV-ITEM-LIST-001 contract)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends only the strict query keys (trimmed search, active, limit) and reads X-Result-Truncated', async () => {
    const fetchMock = stubFetch({ 'X-Result-Truncated': 'true' });
    await expect(listItemsPage({ search: '  oil ', active: true, limit: 50 })).resolves.toEqual({ items: [], truncated: true });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/inventory/items?search=oil&active=true&limit=50');
  });

  it('leaves out a blank search and reports not truncated when the header is absent', async () => {
    const fetchMock = stubFetch();
    await expect(listItemsPage({ search: '   ', active: true })).resolves.toEqual({ items: [], truncated: false });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/inventory/items?active=true');
  });

  it('listItems() without a query still calls the plain list route (Item list page)', async () => {
    const fetchMock = stubFetch();
    await expect(listItems()).resolves.toEqual([]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/inventory/items');
  });
});
