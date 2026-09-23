import { Card } from './Card';
import { Skeleton } from './Skeleton';

export function PageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl" aria-busy="true" aria-label="Loading page">
      {/* Header */}
      <div className="mb-8">
        <Skeleton shine className="h-8 w-1/4 mb-2" />
        <Skeleton className="h-4 w-1/3" />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <Skeleton shine className="h-6 w-1/3 mb-4" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </Card>

          <Card className="p-6">
            <Skeleton shine className="h-6 w-1/4 mb-4" />
            <Skeleton className="h-64 w-full" />
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="p-6">
            <Skeleton shine className="h-6 w-1/2 mb-4" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </Card>

          <Card className="p-6">
            <Skeleton shine className="h-6 w-2/3 mb-4" />
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}