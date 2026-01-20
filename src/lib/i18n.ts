// Simple i18n system for thesis area
// Supports Spanish (es) and English (en)

export type Language = 'es' | 'en';

export const translations = {
  en: {
    // Thesis list
    thesisLibrary: 'Thesis Library',
    investmentTheses: 'investment theses',
    investmentThesis: 'investment thesis',
    filters: 'Filters',
    clearAllFilters: 'Clear all filters',
    noThesesFound: 'No theses found matching your filters.',
    loading: 'Loading...',
    
    // Filters
    sector: 'Sector',
    direction: 'Direction',
    strategy: 'Strategy',
    marketCap: 'Market Cap',
    allSectors: 'All Sectors',
    allDirections: 'All Directions',
    allStrategies: 'All Strategies',
    allSizes: 'All Sizes',
    long: 'Long',
    short: 'Short',
    
    // Strategies
    value: 'Value',
    growth: 'Growth',
    compounder: 'Compounder',
    turnaround: 'Turnaround',
    dividend: 'Dividend',
    
    // Market caps
    mega: 'Mega Cap',
    large: 'Large Cap',
    mid: 'Mid Cap',
    small: 'Small Cap',
    micro: 'Micro Cap',
    
    // Card
    current: 'Current',
    target: 'Target',
    
    // Detail page
    executiveSummary: 'Executive Summary',
    investmentCase: 'Investment Case',
    valuation: 'Valuation',
    risks: 'Risks',
    keyMetrics: 'Key Metrics',
    priceHistory: 'Price History',
    analysisDate: 'Analysis Date',
    noRisksProvided: 'No risks provided.',
    noInvestmentCase: 'No investment case provided.',
    noValuation: 'No valuation provided.',
    backToPortfolio: 'Back to Portfolio',
    
    // Stats
    totalPortfolioValue: 'Total Portfolio Value',
    avgUpside: 'Avg. Upside',
    longShortRatio: 'Long/Short Ratio',
    topSector: 'Top Sector',
    
    // Language
    language: 'Language',
    english: 'English',
    spanish: 'Spanish',
  },
  es: {
    // Thesis list
    thesisLibrary: 'Biblioteca de Tesis',
    investmentTheses: 'tesis de inversión',
    investmentThesis: 'tesis de inversión',
    filters: 'Filtros',
    clearAllFilters: 'Limpiar filtros',
    noThesesFound: 'No se encontraron tesis con estos filtros.',
    loading: 'Cargando...',
    
    // Filters
    sector: 'Sector',
    direction: 'Dirección',
    strategy: 'Estrategia',
    marketCap: 'Capitalización',
    allSectors: 'Todos los Sectores',
    allDirections: 'Todas las Direcciones',
    allStrategies: 'Todas las Estrategias',
    allSizes: 'Todos los Tamaños',
    long: 'Largo',
    short: 'Corto',
    
    // Strategies
    value: 'Valor',
    growth: 'Crecimiento',
    compounder: 'Compounder',
    turnaround: 'Reestructuración',
    dividend: 'Dividendos',
    
    // Market caps
    mega: 'Mega Cap',
    large: 'Large Cap',
    mid: 'Mid Cap',
    small: 'Small Cap',
    micro: 'Micro Cap',
    
    // Card
    current: 'Actual',
    target: 'Objetivo',
    
    // Detail page
    executiveSummary: 'Resumen Ejecutivo',
    investmentCase: 'Caso de Inversión',
    valuation: 'Valoración',
    risks: 'Riesgos',
    keyMetrics: 'Métricas Clave',
    priceHistory: 'Historial de Precios',
    analysisDate: 'Fecha de Análisis',
    noRisksProvided: 'No se proporcionaron riesgos.',
    noInvestmentCase: 'No se proporcionó caso de inversión.',
    noValuation: 'No se proporcionó valoración.',
    backToPortfolio: 'Volver al Portafolio',
    
    // Stats
    totalPortfolioValue: 'Valor Total del Portafolio',
    avgUpside: 'Upside Promedio',
    longShortRatio: 'Ratio Largo/Corto',
    topSector: 'Sector Principal',
    
    // Language
    language: 'Idioma',
    english: 'Inglés',
    spanish: 'Español',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function t(key: TranslationKey, language: Language): string {
  return translations[language][key] || translations.en[key] || key;
}

// Helper to get the current language from localStorage
export function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem('thesis-language');
  return (stored === 'es' || stored === 'en') ? stored : 'en';
}

export function setStoredLanguage(lang: Language): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('thesis-language', lang);
  }
}
