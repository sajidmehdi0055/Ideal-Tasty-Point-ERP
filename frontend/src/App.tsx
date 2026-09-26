import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './app/shell/AppShell';
import { DevSessionProvider } from './lib/session';
import { ItemListPage } from './features/items/ItemListPage';
import { ItemFormPage } from './features/items/ItemFormPage';
import { CatalogSettingsPage } from './features/catalog-settings/CatalogSettingsPage';
import { PlaceholderPage } from './features/shared/PlaceholderPage';

export default function App() {
  return (
    <DevSessionProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/items" replace />} />
            <Route path="/items" element={<ItemListPage />} />
            <Route path="/items/new" element={<ItemFormPage />} />
            <Route path="/items/:id/edit" element={<ItemFormPage />} />

            <Route path="/catalog-settings" element={<CatalogSettingsPage />} />
            {/* Pre-UI-UOM-001 routes, kept as redirects so old links/bookmarks still land on the right tab. */}
            <Route path="/uom" element={<Navigate to="/catalog-settings" state={{ tab: 'uom' }} replace />} />
            <Route path="/brands" element={<Navigate to="/catalog-settings" state={{ tab: 'brands' }} replace />} />
            <Route
              path="/pack-variants"
              element={<Navigate to="/catalog-settings" state={{ tab: 'pack-variants' }} replace />}
            />

            <Route
              path="/suppliers"
              element={
                <PlaceholderPage
                  title="Suppliers"
                  description="Supplier Master's backend is live on main (S-03). This screen isn't wired up yet — frontend integration is pending."
                />
              }
            />
            <Route
              path="/purchases"
              element={
                <PlaceholderPage
                  title="Purchases & Rates"
                  description="Purchase Record and Rate Comparison's backend is live on main (S-03). This screen isn't wired up yet — frontend integration is pending."
                />
              }
            />
            <Route
              path="/stock/locations"
              element={
                <PlaceholderPage
                  title="Stock Locations"
                  description="Stock Location's backend is live on main (S-04). This screen isn't wired up yet — frontend integration is pending, and the S-04 database migration has not been applied to the real operational database yet either."
                />
              }
            />
            <Route
              path="/stock/ledger"
              element={
                <PlaceholderPage
                  title="Stock Ledger"
                  description="Opening stock, adjustments, balances and movement history's backend is live on main (S-04). This screen isn't wired up yet — frontend integration is pending, and the S-04 database migration has not been applied to the real operational database yet either."
                />
              }
            />

            <Route path="*" element={<Navigate to="/items" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </DevSessionProvider>
  );
}
