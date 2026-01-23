import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ReviewBadgeProps {
  needsReview: boolean;
  updatedAt?: string;
}

export function ReviewBadge({ needsReview, updatedAt }: ReviewBadgeProps) {
  if (!needsReview) return null;

  const lastUpdate = updatedAt 
    ? new Date(updatedAt).toLocaleDateString('es-ES', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
      })
    : 'hace tiempo';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-700 border-amber-200">
            <Clock className="h-3 w-3" />
            Revisar
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Última actualización: {lastUpdate}</p>
          <p className="text-xs text-muted-foreground">Han pasado más de 6 meses</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
