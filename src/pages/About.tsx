import { Header } from '@/components/layout/Header';
import { TrendingUp, Target, BookOpen, Award } from 'lucide-react';
import { usePageContent } from '@/hooks/usePageContent';
import { Skeleton } from '@/components/ui/skeleton';

interface AboutContent {
  title: string;
  subtitle: string;
  philosophy_title: string;
  philosophy_content: string;
  methodology_title: string;
  methodology_content: string;
  disclaimer: string;
}

export default function About() {
  const { data: pageContent, isLoading } = usePageContent('about');
  const content = pageContent?.content as unknown as AboutContent | undefined;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main>
        {/* Hero */}
        <section className="py-16 md:py-24">
          <div className="container">
            <div className="max-w-3xl mx-auto text-center">
              {isLoading ? (
                <>
                  <Skeleton className="h-10 w-64 mx-auto mb-4" />
                  <Skeleton className="h-6 w-96 mx-auto" />
                </>
              ) : (
                <>
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                    {content?.title || 'About Investment Analysis'}
                  </h1>
                  <p className="text-lg text-muted-foreground">
                    {content?.subtitle || 
                      'Institutional-grade equity research combining rigorous fundamental analysis with modern analytical frameworks.'}
                  </p>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Philosophy */}
        <section className="py-12 border-t">
          <div className="container">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight mb-4">
                  {content?.philosophy_title || 'Investment Philosophy'}
                </h2>
                <div className="text-muted-foreground space-y-4">
                  {(content?.philosophy_content || 
                    `Our approach focuses on identifying high-quality businesses trading at 
                    reasonable valuations. We emphasize long-term value creation over 
                    short-term market movements.

                    Each thesis undergoes rigorous analysis covering competitive positioning, 
                    financial health, management quality, and intrinsic value estimation.

                    We believe in transparency and clearly communicate our investment rationale, 
                    including potential risks and catalysts for each position.`
                  ).split('\n\n').map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bento-card p-6 text-center">
                  <TrendingUp className="h-8 w-8 mx-auto mb-3 text-primary" />
                  <h3 className="font-semibold mb-1">Fundamental Focus</h3>
                  <p className="text-sm text-muted-foreground">
                    Deep dive into financials and business models
                  </p>
                </div>
                <div className="bento-card p-6 text-center">
                  <Target className="h-8 w-8 mx-auto mb-3 text-primary" />
                  <h3 className="font-semibold mb-1">Clear Targets</h3>
                  <p className="text-sm text-muted-foreground">
                    Explicit price targets with reasoning
                  </p>
                </div>
                <div className="bento-card p-6 text-center">
                  <BookOpen className="h-8 w-8 mx-auto mb-3 text-primary" />
                  <h3 className="font-semibold mb-1">Transparent</h3>
                  <p className="text-sm text-muted-foreground">
                    Full methodology disclosure
                  </p>
                </div>
                <div className="bento-card p-6 text-center">
                  <Award className="h-8 w-8 mx-auto mb-3 text-primary" />
                  <h3 className="font-semibold mb-1">Quality First</h3>
                  <p className="text-sm text-muted-foreground">
                    Focus on exceptional businesses
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Methodology */}
        <section className="py-12 border-t bg-muted/30">
          <div className="container">
            <h2 className="text-2xl font-semibold tracking-tight mb-8 text-center">
              {content?.methodology_title || 'Research Methodology'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="bento-card p-6">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <span className="text-lg font-bold text-primary">1</span>
                </div>
                <h3 className="font-semibold mb-2">Business Analysis</h3>
                <p className="text-sm text-muted-foreground">
                  Understanding competitive advantages, market dynamics, and long-term 
                  sustainability of the business model.
                </p>
              </div>
              <div className="bento-card p-6">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <span className="text-lg font-bold text-primary">2</span>
                </div>
                <h3 className="font-semibold mb-2">Financial Deep Dive</h3>
                <p className="text-sm text-muted-foreground">
                  Comprehensive analysis of financial statements, cash flows, 
                  capital allocation, and return metrics.
                </p>
              </div>
              <div className="bento-card p-6">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <span className="text-lg font-bold text-primary">3</span>
                </div>
                <h3 className="font-semibold mb-2">Valuation</h3>
                <p className="text-sm text-muted-foreground">
                  Multiple valuation approaches including DCF, comparable analysis, 
                  and asset-based methodologies.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Disclaimer */}
        <section className="py-12 border-t">
          <div className="container">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-lg font-semibold mb-4">Disclaimer</h2>
              <p className="text-sm text-muted-foreground">
                {content?.disclaimer || 
                  `This platform is for educational and portfolio demonstration purposes only. 
                  The content presented here does not constitute financial advice, investment 
                  recommendations, or solicitation to buy or sell securities. Past performance 
                  is not indicative of future results. Always conduct your own research and 
                  consult with a qualified financial advisor before making investment decisions.`}
              </p>
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
                This is a portfolio demonstration. Not financial advice.
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
