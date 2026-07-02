import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';

export interface ThemeColors {
  primary: string;
  primaryContainer: string;
  secondary: string;
  secondaryContainer: string;
  background: string;
  surface: string;
  surfaceVariant: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
  textGreen: string;
  textRed: string;
  accent: string;
  isDark: boolean;
}

const lightColors: ThemeColors = {
  primary: '#6750A4',
  primaryContainer: '#EADDFF',
  secondary: '#625B71',
  secondaryContainer: '#E8DEF8',
  background: '#FDFBFF',
  surface: '#FEF7FF',
  surfaceVariant: '#E7E0EC',
  card: '#F7F2FA',
  text: '#1C1B1F',
  textSecondary: '#49454F',
  border: '#CAC4D0',
  error: '#B3261E',
  success: '#2E7D32',
  textGreen: '#0F8641',
  textRed: '#C62828',
  accent: '#7D5260',
  isDark: false,
};

const darkColors: ThemeColors = {
  primary: '#D0BCFF',
  primaryContainer: '#4F378B',
  secondary: '#CCC2DC',
  secondaryContainer: '#4A4458',
  background: '#0F0D13',
  surface: '#141218',
  surfaceVariant: '#49454F',
  card: '#1D1B20',
  text: '#E6E1E5',
  textSecondary: '#CAC4D0',
  border: '#49454F',
  error: '#F2B8B5',
  success: '#81C784',
  textGreen: '#81C784',
  textRed: '#E57373',
  accent: '#EFB8C8',
  isDark: true,
};

interface ThemeContextType {
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  colors: lightColors,
  isDark: false,
  toggleTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState(systemScheme === 'dark');

  useEffect(() => {
    setIsDark(systemScheme === 'dark');
  }, [systemScheme]);

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ colors, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
