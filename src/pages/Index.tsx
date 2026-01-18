import { useState, useMemo } from 'react';
import { Filter, LayoutGrid } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { HeroSection } from '@/components/thesis/HeroSection';
import { StatsOverview } from '@/components/thesis/StatsOverview';
import { ThesisCard } from '@/components/thesis/ThesisCard';
import { ThesisCardSkeleton } from '@/components/thesis/ThesisCardSkeleton';
import { FilterBar } from '@/components/thesis/FilterBar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useTheses } from '@/hooks/useTheses';
import { usePageContent } from '@/hooks/usePageContent';
import { ThesisFilters } from '@/types/thesis';

interface HomeContent {
  hero_title: string;
  hero_subtitle: string;
  thesis_section_title: string;
  footer_text: string;
}

export default function Index() {
  const [filters, setFilters] = useState<ThesisFilters>({
    sector: null,
    direction: null,
    strategy: null,
    marketCap: null,
  });

  const { data: theses, isLoading, error } = useTheses(filters);
  const { data: pageContent } = usePageContent('home');
  const content = pageContent?.content as unknown as HomeContent | undefined;

  const availableSectors = useMemo(() => {
    if (!theses) return [];
    return [...new Set(theses.map((t) => t.sector))].sort();
  }, [theses]);

  const hasActiveFilters = Object.values(filters).some((v) => v !== null);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main>
        {/* Hero */}
        <HeroSection />

        {/* Portfolio Section */}
        <section id="portfolio" className="py-12 md:py-16">
          <div className="container">
            {/* Stats Overview */}
            {theses && theses.length > 0 && (
              <div className="mb-12">
                <StatsOverview theses={theses} />
              </div>
            )}

            {/* Section Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight mb-1">
                  {content?.thesis_section_title || 'Thesis Library'}
                </h2>
                <p className="text-muted-foreground">
                  {isLoading
                    ? 'Loading...'
                    : `${theses?.length || 0} investment ${
                        theses?.length === 1 ? 'thesis' : 'theses'
                      }`}
                </p>
              </div>

              {/* Mobile Filter Button */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden">
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                    {hasActiveFilters && (
                      <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                        !
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80">
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6">
                    <FilterBar
                      filters={filters}
                      onFilterChange={setFilters}
                      availableSectors={availableSectors}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* Main Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Desktop Sidebar Filters */}
              <aside className="hidden lg:block">
                <div className="sticky top-20">
                  <div className="flex items-center gap-2 mb-6">
                    <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Filters</span>
                  </div>
                  <FilterBar
                    filters={filters}
                    onFilterChange={setFilters}
                    availableSectors={availableSectors}
                  />
                </div>
              </aside>

              {/* Thesis Grid (Bento) */}
              <div className="lg:col-span-3">
                {error ? (
                  <div className="bento-card text-center py-12">
                    <p className="text-destructive">
                      Error loading theses. Please try again.
                    </p>
                  </div>
                ) : isLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <ThesisCardSkeleton key={i} />
                    ))}
                  </div>
                ) : theses && theses.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {theses.map((thesis, index) => (
                      <ThesisCard key={thesis.id} thesis={thesis} index={index} />
                    ))}
                  </div>
                ) : (
                  <div className="bento-card text-center py-12">
                    <p className="text-muted-foreground">
                      No theses found matching your filters.
                    </p>
                    {hasActiveFilters && (
                      <Button
                        variant="link"
                        onClick={() =>
                          setFilters({
                            sector: null,
                            direction: null,
                            strategy: null,
                            marketCap: null,
                          })
                        }
                        className="mt-2"
                      >
                        Clear all filters
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t py-8">
          <div className="container">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} Investment Analysis. All rights reserved.
              </p>
              <p className="text-xs text-muted-foreground">
                {content?.footer_text || 'This is a portfolio demonstration. Not financial advice.'}
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
