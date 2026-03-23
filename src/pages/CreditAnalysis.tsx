import { useState, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { CreditInputPanel } from '@/components/credit/CreditInputPanel';
import { CreditScorecard } from '@/components/credit/CreditScorecard';
import { ZScorePanel } from '@/components/credit/ZScorePanel';
import {
  CreditInputs,
  CreditAnalysisResult,
  analyzeCreditRisk,
  healthyCompanyExample,
  riskyCompanyExample,
} from '@/lib/credit-analysis';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ShieldCheck, AlertTriangle, BarChart3, RotateCcw, Beaker, Copy, Check, ChevronDown, ChevronUp, ClipboardPaste, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const AI_PROMPT = `Necesito los siguientes datos financieros anuales (en millones) de [NOMBRE DE LA EMPRESA] para realizar un análisis de crédito corporativo (Scorecard + Altman Z-Score). Por favor responde SOLO con un JSON con esta estructura exacta:

{
  "totalAssets": 0,
  "currentAssets": 0,
  "totalLiabilities": 0,
  "currentLiabilities": 0,
  "equity": 0,
  "retainedEarnings": 0,
  "revenue": 0,
  "ebit": 0,
  "ebitda": 0,
  "interestExpense": 0,
  "marketCap": 0
}

Campos requeridos:
• totalAssets — Activo Total
• currentAssets — Activo Corriente (activos líquidos <1 año)
• totalLiabilities — Pasivo Total
• currentLiabilities — Pasivo Corriente (<1 año)
• equity — Patrimonio Neto (capital propio)
• retainedEarnings — Reservas Retenidas (Retained Earnings)
• revenue — Ventas/Ingresos Totales
• ebit — EBIT (Beneficio Antes de Intereses e Impuestos)
• ebitda — EBITDA (opcional, si no está disponible pon null)
• interestExpense — Gastos Financieros (intereses pagados)
• marketCap — Capitalización de Mercado (opcional, si no está disponible pon null)

Usa los datos del último informe anual disponible. Todos los valores en millones.`;

function parseJsonInput(text: string): CreditInputs | null {
  try {
    // Try to extract JSON from the text (in case it's wrapped in markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    
    const requiredKeys = ['totalAssets', 'currentAssets', 'totalLiabilities', 'currentLiabilities', 'equity', 'retainedEarnings', 'revenue', 'ebit', 'interestExpense'];
    for (const key of requiredKeys) {
      if (parsed[key] === undefined || parsed[key] === null) return null;
    }
    
    return {
      totalAssets: Number(parsed.totalAssets) || 0,
      currentAssets: Number(parsed.currentAssets) || 0,
      totalLiabilities: Number(parsed.totalLiabilities) || 0,
      currentLiabilities: Number(parsed.currentLiabilities) || 0,
      equity: Number(parsed.equity) || 0,
      retainedEarnings: Number(parsed.retainedEarnings) || 0,
      revenue: Number(parsed.revenue) || 0,
      ebit: Number(parsed.ebit) || 0,
      ebitda: parsed.ebitda != null ? Number(parsed.ebitda) : null,
      interestExpense: Number(parsed.interestExpense) || 0,
      marketCap: parsed.marketCap != null ? Number(parsed.marketCap) : null,
    };
  } catch {
    return null;
  }
}

const emptyInputs: CreditInputs = {
  totalAssets: 0,
  currentAssets: 0,
  totalLiabilities: 0,
  currentLiabilities: 0,
  equity: 0,
  retainedEarnings: 0,
  revenue: 0,
  ebit: 0,
  ebitda: null,
  interestExpense: 0,
  marketCap: null,
};

export default function CreditAnalysis() {
  const [inputs, setInputs] = useState<CreditInputs>(emptyInputs);
  const [result, setResult] = useState<CreditAnalysisResult | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [showJsonImport, setShowJsonImport] = useState(false);

  const handleAnalyze = useCallback(() => {
    if (inputs.totalAssets <= 0 || inputs.revenue <= 0) return;
    setResult(analyzeCreditRisk(inputs));
  }, [inputs]);

  const handleReset = useCallback(() => {
    setInputs(emptyInputs);
    setResult(null);
    setJsonInput('');
  }, []);

  const loadExample = useCallback((example: CreditInputs) => {
    setInputs(example);
    setResult(analyzeCreditRisk(example));
  }, []);

  const handleCopyPrompt = useCallback(async () => {
    await navigator.clipboard.writeText(AI_PROMPT);
    setCopied(true);
    toast.success('Prompt copiado al portapapeles');
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleJsonImport = useCallback(() => {
    const parsed = parseJsonInput(jsonInput);
    if (parsed) {
      setInputs(parsed);
      setResult(analyzeCreditRisk(parsed));
      setJsonInput('');
      setShowJsonImport(false);
      toast.success('Datos importados correctamente');
    } else {
      toast.error('JSON inválido. Verifica el formato e inténtalo de nuevo.');
    }
  }, [jsonInput]);

  const isValid = inputs.totalAssets > 0 && inputs.revenue > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Header />

      <main className="container max-w-7xl py-6 px-3 sm:px-6 space-y-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-slate-100">
                Análisis de Crédito Corporativo
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-mono max-w-xl">
              Scorecard de ratios + Altman Z-Score para empresas no financieras
            </p>
          </div>

          {/* Example loaders */}
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadExample(healthyCompanyExample)}
              className="text-xs font-mono gap-1.5 bg-slate-800/50 border-slate-700/50 text-slate-300 hover:text-slate-100 hover:bg-slate-800"
            >
              <Beaker className="h-3 w-3 text-emerald-400" />
              Empresa Saludable
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadExample(riskyCompanyExample)}
              className="text-xs font-mono gap-1.5 bg-slate-800/50 border-slate-700/50 text-slate-300 hover:text-slate-100 hover:bg-slate-800"
            >
              <AlertTriangle className="h-3 w-3 text-red-400" />
              Empresa en Riesgo
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          {/* Input Panel */}
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/80 backdrop-blur-sm p-4 space-y-4 sticky top-20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-slate-500" />
                  <h2 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-widest">
                    Datos Financieros
                  </h2>
                </div>
                <span className="text-[9px] font-mono text-slate-600">en millones</span>
              </div>

              <CreditInputPanel inputs={inputs} onChange={setInputs} />

              {/* Quick Import Section */}
              <div className="space-y-2 border-t border-slate-700/30 pt-3">
                {/* AI Prompt Helper */}
                <button
                  onClick={() => setShowPrompt(!showPrompt)}
                  className="flex items-center gap-1.5 w-full text-left group"
                >
                  <Sparkles className="h-3 w-3 text-amber-400" />
                  <span className="text-[10px] font-mono text-slate-400 group-hover:text-slate-200 transition-colors">
                    Obtener datos con IA
                  </span>
                  {showPrompt
                    ? <ChevronUp className="h-3 w-3 text-slate-600 ml-auto" />
                    : <ChevronDown className="h-3 w-3 text-slate-600 ml-auto" />
                  }
                </button>

                {showPrompt && (
                  <div className="rounded border border-amber-500/20 bg-amber-950/10 p-2.5 space-y-2">
                    <p className="text-[10px] font-mono text-slate-400 leading-relaxed">
                      Copia este prompt y pégalo en ChatGPT, Gemini o Claude con el nombre de la empresa. 
                      Luego pega el JSON resultante abajo para importar los datos automáticamente.
                    </p>
                    <div className="relative">
                      <pre className="text-[9px] font-mono text-slate-500 bg-slate-800/60 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                        {AI_PROMPT}
                      </pre>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCopyPrompt}
                        className="absolute top-1 right-1 h-6 px-1.5 text-[9px] font-mono gap-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-700/50"
                      >
                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copied ? 'Copiado' : 'Copiar'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* JSON Import */}
                <button
                  onClick={() => setShowJsonImport(!showJsonImport)}
                  className="flex items-center gap-1.5 w-full text-left group"
                >
                  <ClipboardPaste className="h-3 w-3 text-blue-400" />
                  <span className="text-[10px] font-mono text-slate-400 group-hover:text-slate-200 transition-colors">
                    Importar JSON rápido
                  </span>
                  {showJsonImport
                    ? <ChevronUp className="h-3 w-3 text-slate-600 ml-auto" />
                    : <ChevronDown className="h-3 w-3 text-slate-600 ml-auto" />
                  }
                </button>

                {showJsonImport && (
                  <div className="rounded border border-blue-500/20 bg-blue-950/10 p-2.5 space-y-2">
                    <p className="text-[10px] font-mono text-slate-400">
                      Pega aquí la respuesta JSON de la IA:
                    </p>
                    <Textarea
                      value={jsonInput}
                      onChange={(e) => setJsonInput(e.target.value)}
                      placeholder='{"totalAssets": 50000, "currentAssets": 18000, ...}'
                      className="h-24 text-[10px] font-mono bg-slate-800/50 border-slate-700/50 text-slate-300 placeholder:text-slate-600 resize-none"
                    />
                    <Button
                      size="sm"
                      onClick={handleJsonImport}
                      disabled={!jsonInput.trim()}
                      className="w-full text-[10px] font-mono gap-1.5 bg-blue-600 hover:bg-blue-500 text-white disabled:bg-slate-800 disabled:text-slate-600"
                    >
                      <ClipboardPaste className="h-3 w-3" />
                      Importar y Analizar
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleAnalyze}
                  disabled={!isValid}
                  className={cn(
                    'flex-1 text-xs font-mono gap-1.5',
                    'bg-emerald-600 hover:bg-emerald-500 text-white',
                    'disabled:bg-slate-800 disabled:text-slate-600'
                  )}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Analizar
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="text-xs font-mono bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Results Dashboard */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4 sm:space-y-6">
            {result ? (
              <>
                {/* Overall Rating */}
                <div className={cn(
                  'rounded-lg border p-4 backdrop-blur-sm',
                  result.zScore.zone === 'safe'
                    ? 'border-emerald-500/20 bg-emerald-950/20'
                    : result.zScore.zone === 'distress'
                      ? 'border-red-500/20 bg-red-950/20'
                      : 'border-amber-500/20 bg-amber-950/20'
                )}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">Rating Estimado</span>
                      <p className={cn(
                        'text-lg font-mono font-bold mt-0.5',
                        result.zScore.zone === 'safe' ? 'text-emerald-400'
                          : result.zScore.zone === 'distress' ? 'text-red-400'
                            : 'text-amber-400'
                      )}>
                        {result.overallRatingEs}
                      </p>
                    </div>
                    {result.zScore.zone === 'safe'
                      ? <ShieldCheck className="h-8 w-8 text-emerald-400/30" />
                      : <AlertTriangle className="h-8 w-8 text-red-400/30" />
                    }
                  </div>
                </div>

                {/* Scorecard */}
                <div className="rounded-lg border border-slate-700/50 bg-slate-900/80 backdrop-blur-sm p-4">
                  <CreditScorecard ratios={result.ratios} />
                </div>

                {/* Z-Score */}
                <div className="rounded-lg border border-slate-700/50 bg-slate-900/80 backdrop-blur-sm p-4">
                  <ZScorePanel result={result.zScore} />
                </div>
              </>
            ) : (
              /* Empty state */
              <div className="rounded-lg border border-slate-700/30 border-dashed bg-slate-900/40 p-12 flex flex-col items-center justify-center text-center">
                <ShieldCheck className="h-10 w-10 text-slate-700 mb-3" />
                <p className="text-sm text-slate-500 font-mono mb-1">
                  Introduce datos financieros y pulsa "Analizar"
                </p>
                <p className="text-xs text-slate-600 font-mono">
                  o carga un ejemplo para probar la herramienta
                </p>
              </div>
            )}

            {/* Disclaimer */}
            <div className="rounded border border-slate-800/50 bg-slate-900/30 px-3 py-2">
              <p className="text-[10px] font-mono text-slate-600 leading-relaxed">
                ⚖️ Este modelo es una herramienta educativa basada en datos históricos y no constituye
                una recomendación de inversión o una calificación crediticia oficial. El Altman Z-Score
                fue diseñado para empresas manufactureras públicas (1968) y puede no ser aplicable a
                todos los sectores.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
