import { useState } from 'react';
import { Mail, Linkedin, Send, Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function Contact() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate form submission
    await new Promise((resolve) => setTimeout(resolve, 1000));

    toast({
      title: 'Message sent!',
      description: 'Thank you for reaching out. I will get back to you soon.',
    });

    setName('');
    setEmail('');
    setMessage('');
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main>
        {/* Hero */}
        <section className="py-16 md:py-24">
          <div className="container">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                Get in Touch
              </h1>
              <p className="text-lg text-muted-foreground">
                Interested in discussing investment opportunities or my research? 
                I would love to hear from you.
              </p>
            </div>
          </div>
        </section>

        {/* Contact Content */}
        <section className="py-12 border-t">
          <div className="container">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-5xl mx-auto">
              {/* Contact Info */}
              <div>
                <h2 className="text-xl font-semibold mb-6">Connect With Me</h2>
                
                <div className="space-y-6">
                  <div className="bento-card p-6">
                    <div className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Mail className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium mb-1">Email</h3>
                        <p className="text-muted-foreground text-sm mb-2">
                          For professional inquiries and opportunities
                        </p>
                        <a 
                          href="mailto:contact@example.com" 
                          className="text-sm text-primary hover:underline"
                        >
                          contact@example.com
                        </a>
                      </div>
                    </div>
                  </div>

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
                          href="https://linkedin.com" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          View Profile →
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 p-6 bg-muted/30 rounded-lg border">
                  <h3 className="font-medium mb-2">Open to Opportunities</h3>
                  <p className="text-sm text-muted-foreground">
                    I am currently seeking positions in equity research, portfolio management, 
                    and investment analysis. Open to full-time roles and consulting projects.
                  </p>
                </div>
              </div>

              {/* Contact Form */}
              <div>
                <h2 className="text-xl font-semibold mb-6">Send a Message</h2>
                
                <form onSubmit={handleSubmit} className="bento-card p-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="How can I help you?"
                      rows={5}
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              </div>
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
