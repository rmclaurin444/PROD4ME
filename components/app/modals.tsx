'use client'

import { useState } from 'react'
import { Check, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/app/ui'
import { beats } from '@/components/app/data'

export function Comments({ beat, comments, draft, setDraft, onPost, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-5 md:items-center">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#151515] p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-lime-300">Beat comments</p>
            <h2 className="mt-1 text-2xl font-black">{beat.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close comments">
            <X />
          </button>
        </div>

        <div className="mt-6 flex max-h-72 flex-col gap-4 overflow-y-auto">
          {comments.map((comment: any, i: number) => (
            <div key={`${comment.name}-${i}`} className="flex gap-3">
              <Avatar text={comment.avatar} />
              <div className="rounded-2xl bg-white/10 px-4 py-3">
                <p className="text-xs font-black">{comment.name}</p>
                <p className="mt-1 text-sm text-white/80">{comment.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-2">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) onPost()
            }}
            className="input"
            placeholder="Add a comment..."
            aria-label="Add a comment"
          />
          <Button onClick={onPost} className="bg-lime-300 text-black">
            <Send />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function PostTrack({ saved, onClose, onPublish }: any) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [choice, setChoice] = useState(saved[0] ?? 0)
  const beat = beats[choice]

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#151515] p-6">
        <div className="flex justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-lime-300">Artist mode</p>
            <h2 className="mt-1 text-2xl font-black">Post Your Track</h2>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <label className="text-xs font-bold text-muted-foreground">
            Track title
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="input mt-2"
              placeholder="My finished song"
            />
          </label>
          <label className="text-xs font-bold text-muted-foreground">
            Song link
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="input mt-2"
              placeholder="Spotify, YouTube, or SoundCloud URL"
            />
          </label>
          <label className="text-xs font-bold text-muted-foreground">
            Beat used
            <select
              value={choice}
              onChange={e => setChoice(Number(e.target.value))}
              className="input mt-2"
            >
              {(saved.length ? saved : [0]).map((i: number) => (
                <option key={i} value={i}>
                  {beats[i].title} · {beats[i].producer}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Button
          disabled={!title || !url}
          onClick={() => onPublish({ title, url, beat: beat.title, art: beat.art })}
          className="mt-6 w-full bg-lime-300 font-black text-black"
        >
          <Check data-icon="inline-start" /> Publish to profile
        </Button>
      </div>
    </div>
  )
}

export function Offer({ beat, onClose }: any) {
  const [note, setNote] = useState('')

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#151515] p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-lime-300">Purchase options</p>
            <h2 className="mt-1 text-2xl font-black">{beat.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <div className="mt-6 flex gap-3">
          <Button onClick={onClose} className="flex-1 bg-lime-300 font-black text-black">
            Buy Now · ${beat.price}
          </Button>
          <Button onClick={onClose} variant="outline" className="flex-1 border-white/20">
            Make Offer
          </Button>
        </div>

        <input className="input mt-4" placeholder="Your offer in dollars" />
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          className="input mt-3 min-h-24 resize-y"
          placeholder="Optional message to the producer"
        />
        <Button onClick={onClose} className="mt-3 w-full bg-lime-300 font-black text-black">
          Send offer with message
        </Button>
      </div>
    </div>
  )
}
