import { useState } from 'react';
import Header from './components/Header';
import SurveyList from './components/SurveyList';
import SurveyForm from './components/SurveyForm';
import { useOfflineSync } from './hooks/useOfflineSync';
import './App.css';

type View = { page: 'list' } | { page: 'new' } | { page: 'edit'; id: string };

function App() {
  const [view, setView] = useState<View>({ page: 'list' });
  const [listRefresh, setListRefresh] = useState(0);
  const { isOnline, queueLength } = useOfflineSync();

  const handleSaved = () => {
    setListRefresh(n => n + 1);
    setView({ page: 'list' });
  };

  const headerTitle =
    view.page === 'list' ? 'Site Surveys' :
    view.page === 'new' ? 'New Survey' : 'Edit Survey';

  const headerBack =
    view.page !== 'list' ? () => setView({ page: 'list' }) : undefined;

  return (
    <div className="app">
      <Header
        title={headerTitle}
        onBack={headerBack}
        isOnline={isOnline}
        pendingSync={queueLength}
      />
      <main className="main-content">
        {view.page === 'list' && (
          <SurveyList
            onNewSurvey={() => setView({ page: 'new' })}
            onEditSurvey={(id) => setView({ page: 'edit', id })}
            refreshTrigger={listRefresh}
          />
        )}
        {view.page === 'new' && (
          <SurveyForm
            onSaved={handleSaved}
            onCancel={() => setView({ page: 'list' })}
          />
        )}
        {view.page === 'edit' && (
          <SurveyForm
            surveyId={view.id}
            onSaved={handleSaved}
            onCancel={() => setView({ page: 'list' })}
          />
        )}
      </main>
    </div>
  );
}

export default App;
