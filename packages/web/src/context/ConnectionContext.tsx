import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { ConnectionManager, connectionManager } from '../services/ConnectionManager';

const ConnectionContext = createContext<ConnectionManager | null>(null);

interface ConnectionProviderProps {
    children: ReactNode;
}

/**
 * Provider that provides the global ConnectionManager to child components.
 * Connection is lazy - it only connects when a component calls manager.connect().
 */
export function ConnectionProvider({ children }: ConnectionProviderProps) {
    const manager = useMemo(() => connectionManager, []);

    // Cleanup on unmount only
    useEffect(() => {
        return () => manager.disconnect();
    }, [manager]);

    return (
        <ConnectionContext.Provider value={manager}>
            {children}
        </ConnectionContext.Provider>
    );
}

/**
 * Hook to access the ConnectionManager singleton.
 */
export function useConnection(): ConnectionManager {
    const manager = useContext(ConnectionContext);
    if (!manager) {
        throw new Error('useConnection must be used within a ConnectionProvider');
    }
    return manager;
}
