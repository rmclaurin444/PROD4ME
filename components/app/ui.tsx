export function Avatar({ text, size = 'size-9' }: { text: string; size?: string }) {
  return (
    <div className={`${size} grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-lime-300 to-emerald-700 text-xs font-black text-black`}>
      {text}
    </div>
  )
}

export function TagPills({ tags, onTag }: { tags: string[]; onTag?: (tag: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map(tag => (
        <button
          key={tag}
          onClick={() => onTag?.(tag)}
          className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold hover:bg-lime-300 hover:text-black"
        >
          #{tag.replaceAll(' ', '')}
        </button>
      ))}
    </div>
  )
}
