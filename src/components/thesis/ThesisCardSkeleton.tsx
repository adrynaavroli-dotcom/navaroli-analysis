import { cn } from '@/lib/utils';

interface ThesisCardSkeletonProps {
  className?: string;
}

export function ThesisCardSkeleton({ className }: ThesisCardSkeletonProps) {
  return (
    <div className={cn('bento-card', className)}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-5 w-16 skeleton-pulse" />
            <div className="h-5 w-12 skeleton-pulse rounded-full" />
          </div>
          <div className="h-4 w-32 skeleton-pulse" />
        </div>
      </div>

      {/* Sparkline */}
      <div className="h-8 w-full skeleton-pulse mb-4" />

      {/* Price Info */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="h-3 w-12 skeleton-pulse mb-1.5" />
          <div className="h-6 w-20 skeleton-pulse" />
        </div>
        <div className="text-right">
          <div className="h-3 w-10 skeleton-pulse mb-1.5 ml-auto" />
          <div className="h-5 w-24 skeleton-pulse" />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border/50">
        <div className="h-5 w-20 skeleton-pulse rounded" />
        <div className="h-4 w-24 skeleton-pulse" />
      </div>
    </div>
  );
}
