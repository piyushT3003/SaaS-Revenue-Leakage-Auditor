import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { OverviewPage } from './pages/Overview/OverviewPage';
import { ReconciliationPage } from './pages/Reconciliation/ReconciliationPage';
import { ExceptionsPage } from './pages/Exceptions/ExceptionsPage';
import { CustomersPage } from './pages/Customers/CustomersPage';
import { BillingPage } from './pages/Billing/BillingPage';
import { UnitEconomicsPage } from './pages/UnitEconomics/UnitEconomicsPage';
import { AIAssistantPage } from './pages/AIAssistant/AIAssistantPage';
import { DataManagementPage } from './pages/DataManagement/DataManagementPage';
import { SettingsPage } from './pages/Settings/SettingsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="reconciliation" element={<ReconciliationPage />} />
          <Route path="exceptions" element={<ExceptionsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="unit-economics" element={<UnitEconomicsPage />} />
          <Route path="ai-assistant" element={<AIAssistantPage />} />
          <Route path="data-management" element={<DataManagementPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
