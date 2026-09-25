import { useApp } from './context/AppContext';
import { HomePage } from './pages/HomePage';
import { CallerPage } from './pages/CallerPage';
import { DashboardPage } from './pages/DashboardPage';
import { ImportExportPage } from './pages/ImportExportPage';

function NavBar() {
  const { state, setMode, startCalling } = useApp();
  const mode = state.mode;

  return (
    <nav className="app-nav">
      <div className="nav-inner">
        <button className="nav-brand" onClick={() => setMode('home')}>
          📞 <span className="brand-text">CallManager</span>
        </button>
        <div className="nav-tabs">
          <button
            className={`nav-tab ${mode === 'home' ? 'active' : ''}`}
            onClick={() => setMode('home')}
          >🏠 Home</button>
          <button
            className={`nav-tab ${mode === 'caller' ? 'active' : ''}`}
            onClick={startCalling}
          >📞 Caller</button>
          <button
            className={`nav-tab ${mode === 'dashboard' ? 'active' : ''}`}
            onClick={() => setMode('dashboard')}
          >📊 Dashboard</button>
          <button
            className={`nav-tab ${mode === 'import' ? 'active' : ''}`}
            onClick={() => setMode('import')}
          >📥 Import/Export</button>
        </div>
      </div>
    </nav>
  );
}

export function App() {
  const { state } = useApp();

  return (
    <div className="app-layout">
      <NavBar />
      <main>
        {state.mode === 'home' && <HomePage />}
        {state.mode === 'caller' && <CallerPage />}
        {state.mode === 'dashboard' && <DashboardPage />}
        {state.mode === 'import' && <ImportExportPage />}
      </main>
    </div>
  );
}
