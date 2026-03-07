export function SkeletonCard() {
  return <div className="h-20 bg-gray-200 rounded-lg animate-pulse" />
}

export function SkeletonChat() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="self-start w-3/5 h-12 bg-gray-200 rounded-lg animate-pulse" />
      <div className="self-end w-2/5 h-10 bg-gray-200 rounded-lg animate-pulse" />
      <div className="self-start w-4/5 h-14 bg-gray-200 rounded-lg animate-pulse" />
      <div className="self-end w-1/3 h-10 bg-gray-200 rounded-lg animate-pulse" />
      <div className="self-start w-3/5 h-12 bg-gray-200 rounded-lg animate-pulse" />
    </div>
  )
}

export function SkeletonText() {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-4 bg-gray-200 rounded animate-pulse w-full" />
      <div className="h-4 bg-gray-200 rounded animate-pulse w-4/5" />
      <div className="h-4 bg-gray-200 rounded animate-pulse w-3/5" />
    </div>
  )
}
