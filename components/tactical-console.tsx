'use client'

import { useState, useRef } from 'react'
import { Terminal, Zap, Loader2 } from 'lucide-react'

interface Props {
    onCommand: (command: string) => void
    isForging: boolean
}

export function TacticalConsole({ onCommand, isForging }: Props) {
    const [input, setInput] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    const submit = (e: React.FormEvent) => {
        e.preventDefault()
        const trimmed = input.trim()
        if (!trimmed || isForging) return
        onCommand(trimmed)
        setInput('')
    }

    return (
        <div className="glass-card rounded-2xl p-6 border-white/5">
            <div className="flex items-center gap-3 mb-4">
                <Terminal className="h-4 w-4 text-yellow-500" />
                <span className="text-[10px] font-black tracking-[0.4em] text-zinc-500 uppercase">
                    Tactical Console // Forge Protocol
                </span>
                {isForging && (
                    <span className="ml-auto text-[9px] font-black tracking-widest text-yellow-500 animate-pulse uppercase">
                        ● Processing
                    </span>
                )}
            </div>

            <form onSubmit={submit} className="flex gap-3">
                <div className="flex-1 relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-yellow-500 font-mono text-xs font-black select-none">
                        {'>'}
                    </span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        disabled={isForging}
                        placeholder="Describe a skill to forge... e.g. get Spotify monthly listeners for an artist"
                        className="w-full bg-black/60 border border-white/10 rounded-xl pl-9 pr-4 py-3.5 text-xs font-mono text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20 disabled:opacity-40 transition-all"
                    />
                </div>

                <button
                    type="submit"
                    disabled={isForging || !input.trim()}
                    className="px-6 py-3.5 bg-yellow-500 text-black rounded-xl font-black text-xs tracking-widest uppercase hover:bg-yellow-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_0_20px_rgba(234,179,8,0.3)]"
                >
                    {isForging
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> FORGING</>
                        : <><Zap className="h-3.5 w-3.5" /> FORGE</>
                    }
                </button>
            </form>
        </div>
    )
}
