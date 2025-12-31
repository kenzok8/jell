# Dashboard Specifications

## Design Philosophy

Minimalis namun modern, menghindari desain AI yang pasaran. Fokus pada functionality dan user experience.

## Layout Structure

### Navbar
- Animated logo dengan efek rotasi dan pulse (electro style)
- Icon-only navigation menu (center aligned)
- Theme switcher dark/light (right aligned)
- Fixed positioning (tidak scroll)

### Pages/Routes

#### Home (`/`)
- Dashboard overview dengan header "InsomClash"
- Stats cards (Service Status, Uptime, Memory Usage)
- Service Control Panel (Start/Stop/Restart buttons)
- Resource Monitoring Chart (CPU & Memory dengan AreaChart)

#### Control (`/control`)
- **Mihomo Control Panel**
  - Start button
  - Stop button
  - Restart button
  - Service status indicator (real-time)
  
#### Logs (`/logs`)
- Real-time log viewer
- Log level filter
- Auto-scroll toggle
- Clear logs button

#### Config (`/config`)
- Mock menu (untuk development)
- Akan diimplementasikan kemudian

#### Tools (`/tools`)
- Mock menu (untuk development)
- Akan diimplementasikan kemudian

## Backend API Endpoints

Base URL: `http://192.168.2.1:8080/api/v1`

### Mihomo Endpoints

```
GET    /api/v1/mihomo/status    - Get service status
POST   /api/v1/mihomo/start     - Start service
POST   /api/v1/mihomo/stop      - Stop service
POST   /api/v1/mihomo/restart   - Restart service
GET    /api/v1/mihomo/logs      - Get service logs
```

### Config Endpoints

```
GET    /api/v1/config/          - Get app configuration
```

## Theme System

### Theme Modes
- Dark (default)
- Light
- System (follow OS preference)

### Color Scheme

**Blue Ocean Theme:**
- Primary: #00d4ff (Cyan Blue)
- Accent: #00ff88 (Neon Green)
- Background Dark: #0a1628 (Deep Navy)
- Surface Dark: #14283e (Navy Blue)
- Border: #1e3a5f (Medium Blue)
- Text Light: #f0f8ff (Almost White)
- Active/Hover: #00d4ff dengan opacity variations

**CSS Variables:**
```css
/* Light Mode */
--bg: 240 248 255 (Light Blue)
--surface: 255 255 255 (White)
--text: 10 22 40 (Dark Navy)

/* Dark Mode */
--bg: 10 22 40 (Dark Navy)
--surface: 20 40 70 (Navy Surface)
--text: 240 248 255 (Light Blue)
--border: 30 58 95 (Border Blue)
```

## UI Components

### Component Library
- **Chakra UI v3.29.0** - Primary UI component library
- **Tailwind CSS** - Utility-first CSS framework
- **lucide-react** - Icon library (Home, Settings, FileText, Wrench, Activity, Play, Square, RotateCw, Sun, Moon, Server, Users)
- **@chakra-ui/charts** - Chart components dengan recharts
- **react-router-dom 7.9.5** - Client-side routing

### Animated Components
- **Logo Component**: 
  - SVG dengan dual-layer animation
  - Rotating hexagon (360deg, 8s linear infinite)
  - Pulsing electro effect (scale 1-1.1, opacity 0.3-1, 2s ease-in-out infinite)
  - Linear gradient #00d4ff to #0099ff
  - Green core circle #00ff88

### Component Requirements
- Semua component menggunakan Chakra UI v3
- Tailwind CSS untuk utility styling
- Responsive design (mobile-first: base/md/lg breakpoints)
- Accessible (a11y compliant)
- Fixed navbar dengan compensating padding di layout
- Icon-only navigation untuk clean minimal design

## Technical Requirements

### Code Standards
- **LARANGAN MUTLAK**: Tidak boleh ada comment di dalam kode
- Clean code principles
- TypeScript strict mode
- Proper type definitions
- ESLint compliant

### State Management
- React hooks (useState, useEffect, useContext)
- Context API untuk theme management
- Custom hooks: useMihomoStatus, useMihomoLogs
- No external state management library

### Data Fetching
- Fetch API
- Auto-refresh untuk status dan logs
- Error handling dan loading states
- Retry mechanism untuk failed requests

### Performance
- Code splitting per route
- Lazy loading untuk heavy components
- Memoization where necessary
- Optimistic UI updates

## File Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx          (Fixed navbar dengan animated logo)
│   │   └── Layout.tsx          (Main layout wrapper)
│   ├── common/
│   │   └── StatsCard.tsx       (Reusable stats card dengan Blue Ocean colors)
│   └── charts/
│       └── ResourceChart.tsx   (AreaChart untuk CPU/Memory monitoring)
├── pages/
│   ├── Home.tsx                (Implemented dengan stats & charts)
│   ├── Control.tsx             (Mock - Coming Soon)
│   ├── Logs.tsx                (Mock - Coming Soon)
│   ├── Config.tsx              (Mock - Coming Soon)
│   └── Tools.tsx               (Mock - Coming Soon)
├── services/
│   └── api.ts                  (API service layer dengan error handling)
├── types/
│   └── index.ts                (TypeScript type definitions)
├── config/
│   └── api.ts                  (API configuration)
├── hooks/
│   ├── useMihomoStatus.ts      (Custom hook untuk status polling)
│   └── useMihomoLogs.ts        (Custom hook untuk logs)
├── App.tsx                     (Main app dengan routing)
├── main.tsx                    (Entry point)
└── index.css                   (Blue Ocean CSS variables & animations)
```

## Implementation Priority

### Phase 1 (MVP) ✅ COMPLETED
1. ✅ Setup routing (React Router)
2. ✅ Blue Ocean theme implementation
3. ✅ Navbar dengan animated logo dan layout
4. ✅ Home page dengan stats cards, control panel, dan charts
5. ✅ API service layer dengan error handling
6. ✅ Mobile responsive (Samsung S8+ 360x740)
7. ✅ Desktop optimized (1920x1080)
8. ✅ Backend CORS configuration

### Phase 2 (IN PROGRESS)
1. ⏳ Logs page dengan real-time viewer
2. ⏳ Control page implementation
3. ⏳ Error handling dan toast notifications
4. ⏳ Loading states dan skeleton loaders
5. ⏳ Real-time data integration (replace mock data)

### Phase 3 (PLANNED)
1. Config page implementation
2. Tools page implementation
3. Advanced filtering dan search
4. Performance optimization
5. PWA features

## Dependencies Required

```json
{
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router-dom": "^7.9.5",
    "@chakra-ui/react": "^3.29.0",
    "@chakra-ui/charts": "latest",
    "lucide-react": "latest",
    "date-fns": "^4.1.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "~5.7.2",
    "vite": "^7.2.2",
    "tailwindcss": "latest"
  }
}
```

## Environment Variables

```env
VITE_API_BASE_URL=http://192.168.2.1:8080
```

## Notes

- **Blue Ocean Theme**: Single theme dengan cyan (#00d4ff) dan green (#00ff88) sebagai accent colors
- **Animated Logo**: Rotating hexagon dengan pulsing electro effect (8s rotation, 2s pulse)
- **Fixed Navbar**: Sticky positioning dengan proper layout compensation
- **Icon-Only Navigation**: Clean minimal design tanpa text labels
- **Mobile Optimized**: Tested di Samsung S8+ (360x740px)
- **Desktop Optimized**: Tested di 1920x1080 resolution
- Mock pages (Control, Logs, Config, Tools) menampilkan "Coming Soon"
- Real-time updates menggunakan polling (5-10 detik interval)
- Theme preference disimpan di localStorage
- Responsive breakpoints: base (mobile) / md (tablet) / lg (desktop)
- No comments in code (strict policy)
