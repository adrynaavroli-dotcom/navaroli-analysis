import { ArrowDown } from 'lucide-react';
import { usePageContent } from '@/hooks/usePageContent';

interface HomeContent {
  hero_title: string;
  hero_subtitle: string;
  thesis_section_title: string;
  footer_text: string;
}

export function HeroSection() {
  const { data: pageContent } = usePageContent('home');
  const content = pageContent?.content as unknown as HomeContent | undefined;

  return (
    <section className="relative py-20 md:py-32 overflow-hidden">
      {/* Subtle grid background */}
      <div className="absolute inset-0 grid-bg opacity-50" />
      
      <div className="container relative">
        <div className="max-w-3xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            Equity Research Portfolio
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-6 animate-fade-in-up">
            {content?.hero_title?.split(' ').slice(0, -1).join(' ') || 'Institutional-Grade'}
            <br />
            <span className="gradient-text">
              {content?.hero_title?.split(' ').slice(-1)[0] || 'Equity Research'}
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-8 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            {content?.hero_subtitle || 
              'Deep dive fundamental analysis combining human insight with AI efficiency. Rigorous valuation frameworks applied to high-conviction investment ideas.'}
          </p>

          {/* Scroll indicator */}
          <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <a
              href="#portfolio"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Explore thesis library
              <ArrowDown className="h-4 w-4 animate-bounce" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
