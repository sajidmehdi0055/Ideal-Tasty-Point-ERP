import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './app/shell/AppShell';
import { DevSessionProvider } from './lib/session';
import { ItemListPage } from './features/items/ItemListPage';
import { ItemFormPage } from './features/items/ItemFormPage';
import { UomPage } from './features/uom/UomPage';
import { BrandsPage } from './features/brands/BrandsPage';
import { PackVariantsPage } from './features/pack-variants/PackVariantsPage';

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
            <Route path="/uom" element={<UomPage />} />
            <Route path="/brands" element={<BrandsPage />} />
            <Route path="/pack-variants" element={<PackVariantsPage />} />
            <Route path="*" element={<Navigate to="/items" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </DevSessionProvider>
  );
}
