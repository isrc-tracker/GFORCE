'use client'

import { useState, useEffect, useRef } from 'react'
import {
    Zap, ShieldAlert, Loader2,
    Link2, Database, Code2, FileText, LayoutGrid, Play,
    CheckCircle2, Circle, XCircle, ArrowRight, X,
} from 'lucide-react'
import { toast, Toaster } from 'sonner'

const API_KEY = process.env.NEXT_PUBLIC_GFORCE_API_KEY ?? ''
const AUTH: HeadersInit = API_KEY ? { 'x-gforce-key': API_KEY } : {}

function authFetch(url: string, init?: RequestInit) {
    return fetch(url, { ...init, headers: { ...AUTH, ...(init?.headers ?? {}) } })
}

interface SessionResult {
    id: string
    name: string
    prompt: string
    category: 'links' | 'data' | 'code' | 'documents' | 'video'
    data: any
    error?: string
    truncated?: boolean
    createdAt: number
}

interface ActivityStep {
    label: string
    status: 'pending' | 'active' | 'done' | 'error'
}

interface AuditSite { site: string; status: 'pass' | 'fail'; title?: string; error?: string }

const CATEGORIES = [
    { id: 'all',       label: 'All',   icon: LayoutGrid, bg: 'bg-zinc-700'   },
    { id: 'links',     label: 'Links', icon: Link2,      bg: 'bg-blue-600'   },
    { id: 'data',      label: 'Data',  icon: Database,   bg: 'bg-green-600'  },
    { id: 'code',      label: 'Code',  icon: Code2,      bg: 'bg-violet-600' },
    { id: 'documents', label: 'Docs',  icon: FileText,   bg: 'bg-orange-600' },
    { id: 'video',     label: 'Video', icon: Play,       bg: 'bg-red-600'    },
]

function categorize(data: any): SessionResult['category'] {
    if (!data) return 'data'
    const str = typeof data === 'string' ? data : JSON.stringify(data)
    if (/youtube\.com|vimeo\.com|\.mp4|\.webm|\/video\//i.test(str)) return 'video'
    if (/https?:\/\//.test(str)) return 'links'
    if (typeof data === 'string' && str.length > 500 && !str.trimStart().startsWith('{') && !str.trimStart().startsWith('[')) return 'documents'
    return 'data'
}

const SUGGESTIONS = [
    'Scrape top 10 Hacker News titles and scores',
    'Get top 5 Amazon results for mechanical keyboards',
    'Extract all links from news.ycombinator.com',
]

export default function GForce() {
    const [prompt, setPrompt] = useState('')
    const [isRunning, setIsRunning] = useState(false)
    const [activeTask, setActiveTask] = useState<string | null>(null)
    const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([])
    const [results, setResults] = useState<SessionResult[]>([])
    const [selectedCategory, setSelectedCategory] = useState('all')
    const [selectedResult, setSelectedResult] = useState<SessionResult | null>(null)
    const [poolStats, setPoolStats] = useState({ inUse: 0, idle: 0, queued: 0 })
    const [isAuditing, setIsAuditing] = useState(false)

    const promptRef = useRef<HTMLInputElement>(null)
    const timers = useRef<ReturnType<typeof setTimeout>[]>([])

    useEffect(() => {
        promptRef.current?.focus()
        const poll = async () => {
            try {
                const res = await authFetch('/api/pool/stats')
                if (res.ok) {
                    const d = await res.json()
                    setPoolStats({ inUse: d.inUse ?? 0, idle: d.idle ?? 0, queued: d.queued ?? 0 })
                }
            } catch { }
        }
        poll()
        const id = setInterval(poll, 3000)
        return () => clearInterval(id)
    }, [])

    function clearTimers() {
        timers.current.forEach(clearTimeout)
        timers.current = []
    }

    const handleRun = async () => {
        const intent = prompt.trim()
        if (!intent || isRunning || isAuditing) return
        setPrompt('')
        setIsRunning(true)
        setActiveTask(intent)
        setSelectedResult(null)
        setActivitySteps([
            { label: 'Analyzing prompt', status: 'active' },
            { label: 'Generating automation skill', status: 'pending' },
            { label: 'Running in browser', status: 'pending' },
        ])
        clearTimers()
        timers.current.push(setTimeout(() => setActivitySteps(s => [
            { ...s[0], status: 'done' }, { ...s[1], status: 'active' }, s[2],
        ]), 2000))
        timers.current.push(setTimeout(() => setActivitySteps(s => [
            s[0], { ...s[1], status: 'done' }, { ...s[2], status: 'active' },
        ]), 5000))

        try {
            const res = await authFetch('/api/forge-run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ intent }),
            })
            const data = await res.json()
            clearTimers()

            if (data.success) {
                setActivitySteps([
                    { label: 'Analyzing prompt', status: 'done' },
                    { label: 'Generating automation skill', status: 'done' },
                    { label: 'Running in browser', status: 'done' },
                ])
                const result: SessionResult = {
                    id: `${data.skill.id}-${Date.now()}`,
                    name: data.skill.name,
                    prompt: intent,
                    category: categorize(data.result),
                    data: data.result,
                    truncated: Boolean(data.truncated),
                    createdAt: Date.now(),
                }
                setResults(prev => [result, ...prev])
                setSelectedResult(result)
                toast.success(data.skill.name)
            } else {
                setActivitySteps(prev => prev.map(s =>
                    s.status !== 'done' ? { ...s, status: 'error' as const } : s
                ))
                const errorResult: SessionResult = {
                    id: `err-${Date.now()}`,
                    name: 'Task Failed',
                    prompt: intent,
                    category: 'data',
                    data: null,
                    error: `[${data.stage ?? 'error'}] ${data.error}`,
                    createdAt: Date.now(),
                }
                setResults(prev => [errorResult, ...prev])
                setSelectedResult(errorResult)
                toast.error('Task failed')
            }
        } catch (err) {
            clearTimers()
            setActivitySteps(prev => prev.map(s =>
                s.status !== 'done' ? { ...s, status: 'error' as const } : s
            ))
            toast.error((err as Error).message)
        } finally {
            setIsRunning(false)
        }
    }

    const runAudit = async () => {
        if (isAuditing || isRunning) return
        setIsAuditing(true)
        setActiveTask('Stealth Fingerprint Audit')
        setSelectedResult(null)
        setActivitySteps([
            { label: 'SannySoft fingerprint test', status: 'active' },
            { label: 'BrowserScan analysis', status: 'pending' },
            { label: 'CreepJS evaluation', status: 'pending' },
        ])
        clearTimers()
        timers.current.push(setTimeout(() => setActivitySteps(s => [
            { ...s[0], status: 'done' }, { ...s[1], status: 'active' }, s[2],
        ]), 25000))
        timers.current.push(setTimeout(() => setActivitySteps(s => [
            s[0], { ...s[1], status: 'done' }, { ...s[2], status: 'active' },
        ]), 55000))

        try {
            const res = await authFetch('/api/audit/run', { method: 'POST' })
            const data = await res.json()
            clearTimers()
            if (!data.success) throw new Error(data.error ?? 'Audit failed')
            setActivitySteps(data.results.map((r: AuditSite) => ({
                label: r.site,
                status: (r.status === 'pass' ? 'done' : 'error') as ActivityStep['status'],
            })))
            const passed = data.results.filter((r: AuditSite) => r.status === 'pass').length
            passed === data.results.length
                ? toast.success(`Stealth: ${passed}/${data.results.length} clean`)
                : toast.warning(`Stealth: ${passed}/${data.results.length} passed`)
        } catch (err) {
            clearTimers()
            setActivitySteps(prev => prev.map(s =>
                s.status !== 'done' ? { ...s, status: 'error' as const } : s
            ))
            toast.error('Audit failed')
        } finally {
            setIsAuditing(false)
        }
    }

    const filteredResults = selectedCategory === 'all'
        ? results
        : results.filter(r => r.category === selectedCategory)

    const counts = Object.fromEntries(
        CATEGORIES.map(c => [c.id, c.id === 'all' ? results.length : results.filter(r => r.category === c.id).length])
    )

    const busy = isRunning || isAuditing
    const hasActivity = activitySteps.length > 0

    return (
        <div className="h-screen bg-[#0d0d14] text-white font-sans flex overflow-hidden">
            <Toaster position="top-right" theme="dark" richColors />

            {/* ══ LEFT PANEL ══ */}
            <div className="w-[320px] shrink-0 border-r border-white/[0.06] flex flex-col overflow-hidden p-5 gap-5">

                {/* Logo */}
                <div className="flex items-center gap-2.5">
                    <Zap className="h-5 w-5 text-yellow-400 fill-yellow-400 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]" />
                    <span className="text-sm font-black tracking-[0.18em] uppercase">G-Force</span>
                    <div className="ml-auto flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-[9px] font-bold tracking-[0.2em] text-green-400 uppercase">Online</span>
                    </div>
                </div>

                {/* Prompt Input */}
                <div className="relative">
                    <input
                        ref={promptRef}
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleRun()}
                        disabled={busy}
                        placeholder="What do you want to automate?"
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-3.5 pr-14 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-yellow-500/40 focus:ring-1 focus:ring-yellow-500/10 disabled:opacity-50 transition-all"
                    />
                    <button
                        onClick={handleRun}
                        disabled={busy || !prompt.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors shadow-[0_0_16px_rgba(234,179,8,0.25)]"
                    >
                        {isRunning
                            ? <Loader2 className="h-3.5 w-3.5 text-black animate-spin" />
                            : <ArrowRight className="h-3.5 w-3.5 text-black" />
                        }
                    </button>
                </div>

                {/* Category Folders */}
                <div>
                    <p className="text-[9px] font-bold tracking-[0.22em] text-zinc-600 uppercase mb-3">
                        Saved · {results.length}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all ${selectedCategory === cat.id
                                    ? 'border-yellow-500/30 bg-yellow-500/5'
                                    : 'border-transparent bg-white/[0.03] hover:bg-white/[0.05]'
                                }`}
                            >
                                <div className={`h-9 w-9 rounded-xl ${cat.bg} flex items-center justify-center`}>
                                    <cat.icon className="h-4 w-4 text-white" />
                                </div>
                                <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-wide">{cat.label}</span>
                                <span className="text-sm font-black text-zinc-300 leading-none">{counts[cat.id]}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Result Items */}
                <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5">
                    {filteredResults.length === 0 ? (
                        <div className="py-8 text-center text-[9px] font-bold tracking-[0.2em] text-zinc-700 uppercase">
                            {results.length === 0 ? 'No results yet' : 'Empty category'}
                        </div>
                    ) : filteredResults.map(r => {
                        const cat = CATEGORIES.find(c => c.id === r.category) ?? CATEGORIES[0]
                        const isSelected = selectedResult?.id === r.id
                        return (
                            <button
                                key={r.id}
                                onClick={() => setSelectedResult(r)}
                                className={`w-full text-left p-3 rounded-xl border transition-all ${isSelected
                                    ? 'border-yellow-500/30 bg-yellow-500/5'
                                    : 'border-transparent bg-white/[0.02] hover:bg-white/[0.04]'
                                }`}
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${r.error ? 'bg-red-500/20' : cat.bg}`}>
                                        {r.error
                                            ? <XCircle className="h-3 w-3 text-red-400" />
                                            : <cat.icon className="h-3 w-3 text-white" />
                                        }
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[11px] font-semibold text-zinc-300 truncate">{r.name}</div>
                                        <div className="text-[9px] text-zinc-600 truncate mt-0.5">{r.prompt}</div>
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-2 pt-3 border-t border-white/[0.06]">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-700 shrink-0" />
                    <span className="text-[9px] text-zinc-700 font-mono tabular-nums">
                        {poolStats.inUse} active · {poolStats.idle} idle
                    </span>
                    <button
                        onClick={runAudit}
                        disabled={busy}
                        className="ml-auto flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600 hover:text-zinc-300 disabled:opacity-40 transition-colors"
                    >
                        {isAuditing
                            ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            : <ShieldAlert className="h-2.5 w-2.5" />
                        }
                        Audit
                    </button>
                </div>
            </div>

            {/* ══ RIGHT PANEL ══ */}
            <div className="flex-1 flex flex-col overflow-hidden">

                {/* Header */}
                <div className="px-8 py-6 border-b border-white/[0.06]">
                    <h2 className="text-xl font-bold leading-tight truncate">
                        {activeTask ?? 'Command Center'}
                    </h2>
                    <p className="text-[11px] text-zinc-500 mt-1">
                        {isRunning ? 'In progress...' :
                            isAuditing ? 'Running stealth audit (60–90s)...' :
                            hasActivity && activitySteps.some(s => s.status === 'error') ? 'Task failed' :
                            hasActivity ? 'Completed' :
                            'Waiting for input'}
                    </p>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8">
                    {!hasActivity && !selectedResult ? (

                        /* Idle / Empty State */
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="h-16 w-16 rounded-3xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mb-5">
                                <Zap className="h-8 w-8 text-yellow-500/50" />
                            </div>
                            <h3 className="text-base font-bold text-zinc-400 mb-2">Ready to automate</h3>
                            <p className="text-sm text-zinc-600 max-w-xs leading-relaxed mb-6">
                                Type a prompt on the left and hit Enter. G-Force will forge a skill and run it instantly.
                            </p>
                            <div className="flex flex-col gap-2 w-full max-w-sm">
                                {SUGGESTIONS.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => { setPrompt(s); promptRef.current?.focus() }}
                                        className="px-4 py-2.5 text-[11px] font-medium text-zinc-500 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:border-yellow-500/30 hover:text-zinc-300 transition-all text-left"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                    ) : (
                        <div className="space-y-8 max-w-2xl">

                            {/* Activity Steps */}
                            {hasActivity && (
                                <div>
                                    <p className="text-[9px] font-bold tracking-[0.25em] text-zinc-600 uppercase mb-5">Activity</p>
                                    <div className="space-y-4">
                                        {activitySteps.map((step, i) => (
                                            <div key={i} className="flex items-center gap-4">
                                                <div className="shrink-0 w-5">
                                                    {step.status === 'done'    && <CheckCircle2 className="h-5 w-5 text-green-400" />}
                                                    {step.status === 'active'  && <Loader2      className="h-5 w-5 text-yellow-400 animate-spin" />}
                                                    {step.status === 'pending' && <Circle       className="h-5 w-5 text-zinc-800" />}
                                                    {step.status === 'error'   && <XCircle      className="h-5 w-5 text-red-400" />}
                                                </div>
                                                <span className={`flex-1 text-sm font-medium ${
                                                    step.status === 'done'    ? 'text-zinc-500' :
                                                    step.status === 'active'  ? 'text-white'    :
                                                    step.status === 'error'   ? 'text-red-400'  : 'text-zinc-700'
                                                }`}>
                                                    {step.label}
                                                </span>
                                                <span className={`text-[9px] font-bold uppercase tracking-widest shrink-0 ${
                                                    step.status === 'done'    ? 'text-green-500' :
                                                    step.status === 'active'  ? 'text-yellow-400 animate-pulse' :
                                                    step.status === 'error'   ? 'text-red-400'   : 'text-zinc-700'
                                                }`}>
                                                    {step.status === 'done'    ? 'Done'    :
                                                     step.status === 'active'  ? 'Running' :
                                                     step.status === 'error'   ? 'Failed'  : 'Waiting'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Result Panel */}
                            {selectedResult && (
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <p className="text-[9px] font-bold tracking-[0.25em] text-zinc-600 uppercase">Result</p>
                                        <div className="flex items-center gap-2">
                                            {selectedResult.truncated && (
                                                <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 text-[9px] font-bold uppercase tracking-widest rounded-lg">
                                                    Truncated
                                                </span>
                                            )}
                                            <button
                                                onClick={() => setSelectedResult(null)}
                                                className="text-zinc-700 hover:text-zinc-400 transition-colors"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className={`rounded-2xl border overflow-hidden ${selectedResult.error ? 'border-red-500/20' : 'border-white/[0.06]'}`}>
                                        <div className={`px-5 py-3 border-b flex items-center justify-between ${selectedResult.error ? 'bg-red-500/5 border-red-500/20' : 'bg-white/[0.02] border-white/[0.04]'}`}>
                                            <span className="text-xs font-bold text-zinc-400 truncate">{selectedResult.name}</span>
                                            <span className={`text-[9px] font-bold uppercase tracking-widest ml-3 shrink-0 ${selectedResult.error ? 'text-red-400' : 'text-green-400'}`}>
                                                {selectedResult.error ? 'Failed' : 'Success'}
                                            </span>
                                        </div>
                                        <div className="bg-black/50 p-5 max-h-[55vh] overflow-y-auto font-mono text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap select-text">
                                            {selectedResult.error
                                                ? <span className="text-red-400">{selectedResult.error}</span>
                                                : typeof selectedResult.data === 'string'
                                                    ? selectedResult.data
                                                    : JSON.stringify(selectedResult.data, null, 2)
                                            }
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
