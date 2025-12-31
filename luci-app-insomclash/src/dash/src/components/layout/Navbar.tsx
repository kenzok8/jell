import { HStack, Box } from '@chakra-ui/react';
import { Link, useLocation } from 'react-router-dom';
import { Home, FileText, Settings, Activity, Sun, Moon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

const NAV_ITEMS = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/logs', label: 'Logs', icon: FileText },
  { path: '/manager', label: 'Manager', icon: Settings },
  { path: '/tools', label: 'Tools', icon: Activity },
];



function Logo() {
  return (
    <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
      <div style={{ position: 'relative', width: '32px', height: '32px' }}>
        {/* Main rotating hexagon */}
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            animation: 'rotate 8s linear infinite',
          }}
        >
          <defs>
            <linearGradient id="blueGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#00d4ff', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: '#0099ff', stopOpacity: 1 }} />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="8" fill="url(#blueGradient)" />
          <path d="M16 8L22 12V20L16 24L10 20V12L16 8Z" fill="#0a1628" stroke="#00d4ff" strokeWidth="1.5" />
          <circle cx="16" cy="16" r="3" fill="#00ff88" />
        </svg>

        {/* Electro pulse effect */}
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            animation: 'pulse 2s ease-in-out infinite',
          }}
        >
          <path d="M16 13V11M16 21V19M19 16H21M11 16H13" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        </svg>
      </div>
      <style>{`
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </Link>
  );
}

export function Navbar() {
  const location = useLocation();
  const { isDark, setMode, mode } = useTheme();

  const toggleTheme = () => {
    if (mode === 'system') {
      setMode('dark');
    } else if (mode === 'dark') {
      setMode('light');
    } else {
      setMode('system');
    }
  };

  return (
    <Box
      as="nav"
      bg="#0a1628"
      borderBottomWidth="1px"
      borderColor="#1e3a5f"
      boxShadow="sm"
      position="fixed"
      top={0}
      left={0}
      right={0}
      zIndex={1000}
    >
      <Box maxW="7xl" mx="auto" px={{ base: 4, md: 8, lg: 12 }}>
        <HStack h="16" justify="space-between" align="center">
          {/* Logo - Left */}
          <Box minW={{ base: 'auto', md: '200px' }}>
            <Logo />
          </Box>

          {/* Navigation - Center */}
          <HStack gap={0} flex={1} justify="center" overflowX={{ base: 'auto', md: 'visible' }} css={{
            '&::-webkit-scrollbar': {
              display: 'none',
            },
            'msOverflowStyle': 'none',
            'scrollbarWidth': 'none',
          }}>
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '0 12px',
                    height: '64px',
                    minWidth: '60px',
                    borderBottom: isActive ? '2px solid #00d4ff' : '2px solid transparent',
                    color: isActive ? '#00d4ff' : '#5a7a9e',
                    textDecoration: 'none',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderBottomColor = '#5a7a9e';
                      e.currentTarget.style.color = '#ffffff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderBottomColor = 'transparent';
                      e.currentTarget.style.color = '#5a7a9e';
                    }
                  }}
                >
                  <Icon size={18} />
                  <Box
                    as="span"
                    display={{ base: 'none', md: 'block' }}
                    fontSize="sm"
                    fontWeight={isActive ? '600' : '500'}
                  >
                    {item.label}
                  </Box>
                </Link>
              );
            })}
          </HStack>

          {/* Theme Toggle - Right */}
          <Box minW={{ base: 'auto', md: '200px' }} display="flex" justifyContent="flex-end">
            <button
              onClick={toggleTheme}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#5a7a9e',
                transition: 'color 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#00d4ff'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#5a7a9e'}
              title={mode === 'system' ? 'System theme' : mode === 'dark' ? 'Dark mode' : 'Light mode'}
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </Box>
        </HStack>
      </Box>
    </Box>
  );
}
