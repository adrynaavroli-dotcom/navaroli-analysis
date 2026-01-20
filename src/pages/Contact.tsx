import { Linkedin } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { usePageContent } from '@/hooks/usePageContent';
import { Skeleton } from '@/components/ui/skeleton';

interface ContactContent {
  title: string;
  subtitle: string;
  linkedin_url: string;
  open_to_opportunities: boolean;
  opportunities_text: string;
}

export default function Contact() {
  const { data: pageContent, isLoading: contentLoading } = usePageContent('contact');
  const content = pageContent?.content as unknown as ContactContent | undefined;

  const linkedinUrl = content?.linkedin_url || 'https://linkedin.com';

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main>
        {/* Hero */}
        <section className="py-16 md:py-24">
          <div className="container">
            <div className="max-w-3xl mx-auto text-center">
              {contentLoading ? (
                <>
                  <Skeleton className="h-10 w-48 mx-auto mb-4" />
                  <Skeleton className="h-6 w-96 mx-auto" />
                </>
              ) : (
                <>
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                    {content?.title || 'Get in Touch'}
                  </h1>
                  <p className="text-lg text-muted-foreground">
                    {content?.subtitle || 
                      'Interested in discussing investment opportunities or my research? I would love to hear from you.'}
                  </p>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Contact Content */}
        <section className="py-12 border-t">
          <div className="container">
            <div className="max-w-xl mx-auto">
              {/* LinkedIn */}
              <div className="bento-card p-6">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Linkedin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium mb-1">LinkedIn</h3>
                    <p className="text-muted-foreground text-sm mb-2">
                      Connect for professional networking
                    </p>
                    <a 
                      href={linkedinUrl}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      View Profile →
                    </a>
                  </div>
                </div>
              </div>

              {/* Open to Opportunities */}
              {(content?.open_to_opportunities !== false) && (
                <div className="mt-8 p-6 bg-muted/30 rounded-lg border">
                  <h3 className="font-medium mb-2">Open to Opportunities</h3>
                  <p className="text-sm text-muted-foreground">
                    {content?.opportunities_text || 
                      'I am currently seeking positions in equity research, portfolio management, and investment analysis. Open to full-time roles and consulting projects.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t py-8 mt-12">
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
