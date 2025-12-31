import { Button, Menu } from '@chakra-ui/react';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeMode } from '../../types';

const THEME_MODES: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function ThemeSwitcher() {
  const { mode, setMode } = useTheme();

  const currentLabel = THEME_MODES.find((t) => t.value === mode)?.label || 'Theme';

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button variant="outline" size="sm">
          {currentLabel}
        </Button>
      </Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content>
          {THEME_MODES.map((themeMode) => (
            <Menu.Item
              key={themeMode.value}
              value={themeMode.value}
              onClick={() => setMode(themeMode.value)}
            >
              {themeMode.label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
}
