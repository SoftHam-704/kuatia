import { createContext, useContext, useMemo } from 'react';

export interface WorkspaceWindowContextValue {
  windowId: string;
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
  setBusy: (busy: boolean) => void;
}

const WorkspaceWindowContext = createContext<WorkspaceWindowContextValue | null>(null);

export function WorkspaceWindowProvider({
  windowId,
  isDirty,
  onFlag,
  children,
}: {
  windowId: string;
  isDirty: boolean;
  onFlag: (id: string, flags: { dirty?: boolean; busy?: boolean }) => void;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({
      windowId,
      isDirty,
      setDirty: (dirty: boolean) => onFlag(windowId, { dirty }),
      setBusy: (busy: boolean) => onFlag(windowId, { busy }),
    }),
    [windowId, isDirty, onFlag],
  );

  return (
    <WorkspaceWindowContext.Provider value={value}>
      {children}
    </WorkspaceWindowContext.Provider>
  );
}

export function useWorkspaceWindow() {
  return useContext(WorkspaceWindowContext);
}
