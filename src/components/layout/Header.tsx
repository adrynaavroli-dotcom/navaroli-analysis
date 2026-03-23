import { Link, useLocation } from 'react-router-dom';
import { TrendingUp, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LanguageToggle } from '@/components/thesis/LanguageToggle';
import { AlertsBadge } from '@/components/alerts/AlertsBadge';
import { useAuth } from '@/hooks/useAuth';

// Links visible to everyone
const publicNavLinks = [
  { href: '/', label: 'Thesis' },
  { href: '/research', label: 'Research' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

// Links only visible to authenticated users
const protectedNavLinks = [
  { href: '/valuation-engine', label: 'Valuation' },
  { href: '/options-pricing', label: 'Options' },
  { href: '/admin', label: 'Admin' },
];

export function Header() {
  const location = useLocation();
  const { user, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Only show protected links when user is confirmed authenticated (not during loading)
  const navLinks = (!loading && user) 
    ? [...publicNavLinks, ...protectedNavLinks] 
    : publicNavLinks;

  return (
    <header className="sticky-header">
      <div className="container flex h-14 md:h-16 items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <div className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <TrendingUp className="h-3.5 w-3.5 md:h-4 md:w-4" />
          </div>
          <span className="text-base md:text-lg font-semibold tracking-tight">
            Investment Analysis
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={cn(
                'px-3 lg:px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                location.pathname === link.href
                  ? 'text-foreground bg-accent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
            >
              {link.label}
            </Link>
          ))}
          {user && <AlertsBadge />}
          <LanguageToggle />
        </nav>

        {/* Mobile Menu Button */}
        <div className="flex items-center gap-2 md:hidden">
          <LanguageToggle />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-background animate-fade-in">
          <nav className="container py-3 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'px-4 py-3 text-sm font-medium rounded-lg transition-colors',
                  location.pathname === link.href
                    ? 'text-foreground bg-accent'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
              >
                {link.label}
              </Link>
            ))}
            {user && (
              <div className="px-4 py-2">
                <AlertsBadge />
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
