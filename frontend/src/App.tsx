import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './app/shell/AppShell';
import { DevSessionProvider } from './lib/session';
import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './design-system/components';
import { ItemListPage } from './features/items/ItemListPage';
import { ItemFormPage } from './features/items/ItemFormPage';
import { CatalogSettingsPage } from './features/catalog-settings/CatalogSettingsPage';
import { PlaceholderPage } from './features/shared/PlaceholderPage';
import { AiAssistantProvider } from './features/ai-assistant';
import { StockLedgerPage, StockLocationsPage } from './features/stock';

export default function App() {
  return (
    <ThemeProvider>
      {/* Toasts (UI-REFRESH-001): any screen can call useToast(). */}
      <ToastProvider>
        <DevSessionProvider>
          <BrowserRouter>
            {/* Above the routes so the AI conversation survives screen changes (UI-AI-002). */}
            <AiAssistantProvider>
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
                  <Route path="/stock/locations" element={<StockLocationsPage />} />
                  <Route path="/stock/ledger" element={<StockLedgerPage />} />

                  <Route path="*" element={<Navigate to="/items" replace />} />
                </Routes>
              </AppShell>
            </AiAssistantProvider>
          </BrowserRouter>
        </DevSessionProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
