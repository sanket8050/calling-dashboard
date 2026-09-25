import { useApp } from './context/AppContext';
import { HomePage } from './pages/HomePage';
import { CallerPage } from './pages/CallerPage';
import { DashboardPage } from './pages/DashboardPage';
import { ImportExportPage } from './pages/ImportExportPage';

function BottomNav() {
  const { state, setMode, startCalling } = useApp();
  const mode = state.mode;

  const tabs = [
    { key: 'home', label: 'Home', emoji: '🏠', action: () => setMode('home') },
    { key: 'caller', label: 'Call', emoji: '📞', action: startCalling },
    { key: 'dashboard', label: 'Dashboard', emoji: '📊', action: () => setMode('dashboard') },
    { key: 'import', label: 'Import', emoji: '📥', action: () => setMode('import') },
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`bottom-tab ${mode === tab.key ? 'active' : ''}`}
          onClick={tab.action}
        >
          <span className="bottom-tab-icon">{tab.emoji}</span>
          <span className="bottom-tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function App() {
  const { state } = useApp();

  return (
    <div className="app-layout">
      <main className="app-main">
        {state.mode === 'home' && <HomePage />}
        {state.mode === 'caller' && <CallerPage />}
        {state.mode === 'dashboard' && <DashboardPage />}
        {state.mode === 'import' && <ImportExportPage />}
      </main>
      {state.mode !== 'caller' && <BottomNav />}
    </div>
  );
}
