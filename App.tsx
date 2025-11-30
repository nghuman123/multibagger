
import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Screener from './pages/Screener';
import StockDetail from './pages/StockDetail';
import AIScanner from './pages/AIScanner';
import ErrorBoundary from './components/ErrorBoundary';

// Placeholder components
const ComingSoon = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center h-full text-gray-500">
    <h2 className="text-2xl font-bold mb-2">{title}</h2>
    <p>This feature is coming soon.</p>
  </div>
);

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="screener" element={<Screener />} />
            <Route path="stock/:ticker" element={<StockDetail />} />
            <Route path="ai-scanner" element={<AIScanner />} />
            <Route path="catalysts" element={<ComingSoon title="Catalyst Calendar" />} />
            <Route path="watchlist" element={<ComingSoon title="Watchlist" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
