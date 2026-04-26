import React from 'react';

interface HeaderProps {
  title: string;
  onBack?: () => void;
  isOnline: boolean;
  pendingSync: number;
}

const Header: React.FC<HeaderProps> = ({ title, onBack, isOnline, pendingSync }) => {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-left">
          {onBack && (
            <button className="btn-icon" onClick={onBack} aria-label="Go back">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="header-brand">
            <span className="header-brand-icon">&#9728;</span>
            <h1 className="header-title">{title}</h1>
          </div>
        </div>
        <div className="header-right">
          {pendingSync > 0 && (
            <span className="sync-badge" title={pendingSync + ' surveys pending'}>
              {pendingSync} pending
            </span>
          )}
          <span
            className={isOnline ? 'status-dot online' : 'status-dot offline'}
            title={isOnline ? 'Online' : 'Offline'}
          />
        </div>
      </div>
    </header>
  );
};

export default Header;
