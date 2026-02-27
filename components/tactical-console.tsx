'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Terminal, Zap } from 'lucide-react'

interface Props {
    onCommand: (command: string) => void
    isForging: boolean
}

const SUGGESTIONS = [
    'scrape top 5 products from amazon search for headphones',
    'extract first 10 google result links for "best studio monitors"',
    'capture page title and h1 from current page',
]

export function TacticalConsole({ onCommand, isForging }: Props) {
    const [input, setInput] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const submit = (e: React.FormEvent) => {
        e.preventDefault()
        const trimmed = input.trim()
        if (!trimmed || isForging) return
        onCommand(trimmed)
        setInput('')
        inputRef.current?.focus()
    }

    return (
        <div className="bg-zinc-950 border border-white/[0.06] rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
                <Terminal className="h-4 w-4 text-yellow-500" />
                <span className="text-[10px] font-black tracking-[0.35em] text-zinc-500 uppercase">
                    Tactical Console - Forge Protocol
                </span>
                {isForging && (
                    <span className="ml-auto flex items-center gap-1.5 text-[9px] font-black tracking-widest text-yellow-400 animate-pulse uppercase">
                        <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
                        Forging
                    </span>
                )}
            </div>

            <form onSubmit={submit} className="flex gap-3">
                <div className="flex-1 relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-yellow-500/60 font-mono text-xs select-none">
                        {'>'}
                    </span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        disabled={isForging}
                        placeholder="Describe a browser automation skill to forge..."
                        className="w-full bg-black/60 border border-white/[0.08] rounded-xl pl-8 pr-4 py-3.5 text-sm font-mono text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-yellow-500/40 focus:ring-1 focus:ring-yellow-500/10 disabled:opacity-40 transition-all"
                    />
                </div>

                <button
                    type="submit"
                    disabled={isForging || !input.trim()}
                    className="px-6 py-3.5 bg-yellow-500 text-black rounded-xl font-black text-xs tracking-widest uppercase hover:bg-yellow-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_0_24px_rgba(234,179,8,0.25)]"
                >
                    {isForging
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Forging</>
                        : <><Zap className="h-3.5 w-3.5" /> Forge</>
                    }
                </button>
            </form>

            <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-[10px] text-zinc-600">
                    Enter = forge skill
                </p>
                <p className="text-[10px] text-zinc-600 font-mono">
                    {input.length}/2000
                </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                {SUGGESTIONS.map((suggestion) => (
                    <button
                        key={suggestion}
                        type="button"
                        disabled={isForging}
                        onClick={() => {
                            setInput(suggestion)
                            inputRef.current?.focus()
                        }}
                        className="px-2.5 py-1.5 text-[10px] font-semibold tracking-wide bg-zinc-900 border border-white/[0.06] rounded-lg text-zinc-400 hover:text-zinc-200 hover:border-yellow-500/30 transition-all disabled:opacity-40"
                    >
                        {suggestion}
                    </button>
                ))}
            </div>
        </div>
    )
}
