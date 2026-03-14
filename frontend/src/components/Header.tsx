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
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h1 className="header-title">{title}</h1>
        </div>
        <div className="header-right">
          {pendingSync > 0 && (
            <span className="sync-badge" title={`${pendingSync} survey(s) pending sync`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="1 4 1 10 7 10" />
                <polyline points="23 20 23 14 17 14" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
              </svg>
              {pendingSync}
            </span>
          )}
          <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} title={isOnline ? 'Online' : 'Offline'} />
        </div>
      </div>
    </header>
  );
};

export default Header;
