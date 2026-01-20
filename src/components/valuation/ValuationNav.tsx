import { Link, useLocation } from 'react-router-dom';
import { BarChart3, FolderOpen, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { to: '/valuation-engine', label: 'Workspaces', icon: FolderOpen },
  { to: '/valuation-engine/analysis', label: 'Analysis', icon: BarChart3 },
  { to: '/valuation-engine/settings', label: 'Settings', icon: Settings },
];

export function ValuationNav() {
  const location = useLocation();
  const { signOut, user } = useAuth();

  return (
    <aside className="w-64 border-r border-border bg-card min-h-screen flex flex-col">
      <div className="p-6 border-b border-border">
        <h1 className="font-semibold text-lg tracking-tight">Investment Analysis</h1>
        <p className="text-xs text-muted-foreground mt-1">Valuation Engine</p>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-xs font-medium text-primary">
              {user?.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{user?.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
