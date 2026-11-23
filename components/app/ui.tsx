export function Avatar({ text, src, size = 'size-9' }: { text: string; src?: string | null; size?: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={text}
        className={`${size} shrink-0 rounded-full object-cover`}
      />
    )
  }
  return (
    <div className={`${size} grid shrink-0 place-items-center rounded-full bg-brand text-brand-foreground text-xs font-black`}>
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
          className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold hover:bg-brand hover:text-brand-foreground"
        >
          #{tag.replaceAll(' ', '')}
        </button>
      ))}
    </div>
  )
}
