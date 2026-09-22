import { StrictMode, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './design-system/index.css';
import { AppShell } from './app/AppShell';
import { LoginScreen } from './screens/LoginScreen';
import { readSession, signOut } from './lib/session';
import type { Session } from './lib/session';

function App() {
  const [session, setSession] = useState<Session | null>(() => readSession());

  const handleSignOut = useCallback(() => {
    setSession((current) => {
      if (current) void signOut(current.token);
      return null;
    });
  }, []);

  if (!session) return <LoginScreen onAuthenticated={setSession} />;
  return <AppShell session={session} onSignOut={handleSignOut} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
