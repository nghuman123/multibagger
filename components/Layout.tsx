import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Search, 
  LineChart, 
  Zap, 
  Settings, 
  Menu, 
  X,
  Telescope
} from 'lucide-react';

const Layout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const location = useLocation();

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const navItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'Screener', path: '/screener', icon: <Search size={20} /> },
    { name: 'AI Scanner', path: '/ai-scanner', icon: <Telescope size={20} /> },
    { name: 'Catalysts', path: '/catalysts', icon: <Zap size={20} /> },
    { name: 'Watchlist', path: '/watchlist', icon: <LineChart size={20} /> },
  ];

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden font-sans">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-gray-900 border-r border-gray-800">
        <div className="p-6 border-b border-gray-800 flex items-center space-x-2">
          <div className="w-8 h-8 bg-accent-500 rounded-lg flex items-center justify-center">
            <span className="font-bold text-gray-900 text-lg">α</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">AlphaHunter</h1>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 rounded-lg transition-colors group ${
                  isActive
                    ? 'bg-primary-500/10 text-primary-400 border-r-2 border-primary-500'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span className="mr-3">{item.icon}</span>
              <span className="font-medium">{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button className="flex items-center w-full px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            <Settings size={18} className="mr-3" />
            Settings
          </button>
        </div>
      </aside>

      {/* Mobile Header & Content */}
      <div className="flex-1 flex flex-col h-full relative">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-accent-500 rounded-lg flex items-center justify-center">
              <span className="font-bold text-gray-900">α</span>
            </div>
            <span className="font-bold text-lg">AlphaHunter</span>
          </div>
          <button onClick={toggleMobileMenu} className="p-2 text-gray-400 hover:text-white">
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </header>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="absolute inset-0 z-50 bg-gray-950/95 backdrop-blur-sm md:hidden flex flex-col p-6 space-y-4">
            <div className="flex justify-end">
              <button onClick={closeMobileMenu} className="p-2 text-gray-400">
                <X size={24} />
              </button>
            </div>
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  `flex items-center px-4 py-4 rounded-xl text-lg ${
                    isActive ? 'bg-primary-500/10 text-primary-400' : 'text-gray-400'
                  }`
                }
              >
                <span className="mr-4">{item.icon}</span>
                {item.name}
              </NavLink>
            ))}
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-gray-950 p-4 md:p-8 scroll-smooth">
          <div className="max-w-7xl mx-auto">
             <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
