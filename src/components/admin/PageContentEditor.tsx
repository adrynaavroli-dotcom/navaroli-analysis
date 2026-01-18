import { useState, useEffect } from 'react';
import { usePageContent, useUpdatePageContent } from '@/hooks/usePageContent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Save, FileText, User, Home, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface HomeContent {
  hero_title: string;
  hero_subtitle: string;
  thesis_section_title: string;
  footer_text: string;
}

interface AboutContent {
  title: string;
  subtitle: string;
  philosophy_title: string;
  philosophy_content: string;
  methodology_title: string;
  methodology_content: string;
  disclaimer: string;
}

interface ContactContent {
  title: string;
  subtitle: string;
  email: string;
  linkedin_url: string;
  open_to_opportunities: boolean;
  opportunities_text: string;
}

export function PageContentEditor() {
  const { data: homeData, isLoading: homeLoading } = usePageContent('home');
  const { data: aboutData, isLoading: aboutLoading } = usePageContent('about');
  const { data: contactData, isLoading: contactLoading } = usePageContent('contact');
  
  const updateContent = useUpdatePageContent();
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);

  const [homeContent, setHomeContent] = useState<HomeContent>({
    hero_title: '',
    hero_subtitle: '',
    thesis_section_title: '',
    footer_text: '',
  });

  const [aboutContent, setAboutContent] = useState<AboutContent>({
    title: '',
    subtitle: '',
    philosophy_title: '',
    philosophy_content: '',
    methodology_title: '',
    methodology_content: '',
    disclaimer: '',
  });

  const [contactContent, setContactContent] = useState<ContactContent>({
    title: '',
    subtitle: '',
    email: '',
    linkedin_url: '',
    open_to_opportunities: true,
    opportunities_text: '',
  });

  useEffect(() => {
    if (homeData?.content) {
      setHomeContent(homeData.content as unknown as HomeContent);
    }
  }, [homeData]);

  useEffect(() => {
    if (aboutData?.content) {
      setAboutContent(aboutData.content as unknown as AboutContent);
    }
  }, [aboutData]);

  useEffect(() => {
    if (contactData?.content) {
      setContactContent(contactData.content as unknown as ContactContent);
    }
  }, [contactData]);

  const handleSaveHome = async () => {
    try {
      await updateContent.mutateAsync({
        pageKey: 'home',
        content: homeContent as unknown as Record<string, unknown>,
      });
      toast.success('Portada actualizada correctamente');
    } catch (error) {
      toast.error('Error al guardar los cambios');
    }
  };

  const handleSaveAbout = async () => {
    try {
      await updateContent.mutateAsync({
        pageKey: 'about',
        content: aboutContent as unknown as Record<string, unknown>,
      });
      toast.success('Página About actualizada correctamente');
    } catch (error) {
      toast.error('Error al guardar los cambios');
    }
  };

  const handleSaveContact = async () => {
    try {
      await updateContent.mutateAsync({
        pageKey: 'contact',
        content: contactContent as unknown as Record<string, unknown>,
      });
      toast.success('Página Contact actualizada correctamente');
    } catch (error) {
      toast.error('Error al guardar los cambios');
    }
  };

  const handleUpdatePrices = async () => {
    setIsUpdatingPrices(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-prices');
      
      if (error) throw error;
      
      toast.success(`Precios actualizados: ${data.updated} tesis, ${data.failed} errores`);
    } catch (error) {
      console.error('Error updating prices:', error);
      toast.error('Error al actualizar precios');
    } finally {
      setIsUpdatingPrices(false);
    }
  };

  if (homeLoading || aboutLoading || contactLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Price Update Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Actualizar Precios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Actualiza los precios de todas las tesis publicadas desde Yahoo Finance.
              Se actualiza automáticamente cada día a las 22:00 UTC.
            </p>
            <Button 
              onClick={handleUpdatePrices} 
              disabled={isUpdatingPrices}
              variant="outline"
            >
              {isUpdatingPrices ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Actualizando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Actualizar Ahora
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Page Content Editor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Contenido de Páginas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="home" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="home" className="flex items-center gap-2">
                <Home className="h-4 w-4" />
                Portada
              </TabsTrigger>
              <TabsTrigger value="about" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                About
              </TabsTrigger>
              <TabsTrigger value="contact" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Contact
              </TabsTrigger>
            </TabsList>

            <TabsContent value="home" className="space-y-4 mt-6">
              <div className="space-y-2">
                <Label htmlFor="hero_title">Título del Hero</Label>
                <Input
                  id="hero_title"
                  value={homeContent.hero_title}
                  onChange={(e) => setHomeContent({ ...homeContent, hero_title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hero_subtitle">Subtítulo del Hero</Label>
                <Textarea
                  id="hero_subtitle"
                  value={homeContent.hero_subtitle}
                  onChange={(e) => setHomeContent({ ...homeContent, hero_subtitle: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="thesis_section_title">Título Sección Tesis</Label>
                <Input
                  id="thesis_section_title"
                  value={homeContent.thesis_section_title}
                  onChange={(e) => setHomeContent({ ...homeContent, thesis_section_title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="footer_text">Texto del Footer</Label>
                <Input
                  id="footer_text"
                  value={homeContent.footer_text}
                  onChange={(e) => setHomeContent({ ...homeContent, footer_text: e.target.value })}
                />
              </div>
              <Button onClick={handleSaveHome} disabled={updateContent.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Guardar Portada
              </Button>
            </TabsContent>

            <TabsContent value="about" className="space-y-4 mt-6">
              <div className="space-y-2">
                <Label htmlFor="about_title">Título</Label>
                <Input
                  id="about_title"
                  value={aboutContent.title}
                  onChange={(e) => setAboutContent({ ...aboutContent, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="about_subtitle">Subtítulo</Label>
                <Textarea
                  id="about_subtitle"
                  value={aboutContent.subtitle}
                  onChange={(e) => setAboutContent({ ...aboutContent, subtitle: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="philosophy_title">Título Filosofía</Label>
                  <Input
                    id="philosophy_title"
                    value={aboutContent.philosophy_title}
                    onChange={(e) => setAboutContent({ ...aboutContent, philosophy_title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="methodology_title">Título Metodología</Label>
                  <Input
                    id="methodology_title"
                    value={aboutContent.methodology_title}
                    onChange={(e) => setAboutContent({ ...aboutContent, methodology_title: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="philosophy_content">Contenido Filosofía</Label>
                <Textarea
                  id="philosophy_content"
                  value={aboutContent.philosophy_content}
                  onChange={(e) => setAboutContent({ ...aboutContent, philosophy_content: e.target.value })}
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="methodology_content">Contenido Metodología</Label>
                <Textarea
                  id="methodology_content"
                  value={aboutContent.methodology_content}
                  onChange={(e) => setAboutContent({ ...aboutContent, methodology_content: e.target.value })}
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="disclaimer">Disclaimer</Label>
                <Textarea
                  id="disclaimer"
                  value={aboutContent.disclaimer}
                  onChange={(e) => setAboutContent({ ...aboutContent, disclaimer: e.target.value })}
                  rows={3}
                />
              </div>
              <Button onClick={handleSaveAbout} disabled={updateContent.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Guardar About
              </Button>
            </TabsContent>

            <TabsContent value="contact" className="space-y-4 mt-6">
              <div className="space-y-2">
                <Label htmlFor="contact_title">Título</Label>
                <Input
                  id="contact_title"
                  value={contactContent.title}
                  onChange={(e) => setContactContent({ ...contactContent, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_subtitle">Subtítulo</Label>
                <Textarea
                  id="contact_subtitle"
                  value={contactContent.subtitle}
                  onChange={(e) => setContactContent({ ...contactContent, subtitle: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={contactContent.email}
                    onChange={(e) => setContactContent({ ...contactContent, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                  <Input
                    id="linkedin_url"
                    value={contactContent.linkedin_url}
                    onChange={(e) => setContactContent({ ...contactContent, linkedin_url: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="open_to_opportunities"
                  checked={contactContent.open_to_opportunities}
                  onCheckedChange={(checked) => setContactContent({ ...contactContent, open_to_opportunities: checked })}
                />
                <Label htmlFor="open_to_opportunities">Abierto a oportunidades</Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="opportunities_text">Texto de oportunidades</Label>
                <Textarea
                  id="opportunities_text"
                  value={contactContent.opportunities_text}
                  onChange={(e) => setContactContent({ ...contactContent, opportunities_text: e.target.value })}
                  rows={3}
                />
              </div>
              <Button onClick={handleSaveContact} disabled={updateContent.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Guardar Contact
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
