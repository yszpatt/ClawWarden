import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchSettings, updateSettings } from '../api/settings';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>('dark');

    // Load initial theme
    useEffect(() => {
        const loadTheme = async () => {
            try {
                const settings = await fetchSettings();
                setThemeState(settings.theme || 'dark');
            } catch (error) {
                console.error('Failed to load theme:', error);
            }
        };
        loadTheme();
    }, []);

    // Apply theme class to body
    useEffect(() => {
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(`${theme}-theme`);
    }, [theme]);

    const setTheme = async (newTheme: Theme) => {
        setThemeState(newTheme);
        try {
            // We need to fetch current settings first to not overwrite other settings
            // In a real app with better API this might be simpler
            const currentSettings = await fetchSettings();
            await updateSettings({ ...currentSettings, theme: newTheme });
        } catch (error) {
            console.error('Failed to persist theme:', error);
        }
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
