'use client'

import { useEffect, useMemo, useState } from 'react'
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Code2,
    FileText,
    FolderOpenDot,
    Link2,
    Loader2,
    Menu,
    MoreHorizontal,
    Send,
    Video,
} from 'lucide-react'
import { toast, Toaster } from 'sonner'

const API_KEY = process.env.NEXT_PUBLIC_GFORCE_API_KEY ?? ''

function authFetch(url: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers ?? undefined)
    if (API_KEY) headers.set('x-gforce-key', API_KEY)
    return fetch(url, { ...init, headers })
}

type ArtifactType = 'links' | 'video' | 'documents' | 'software'
type StreamState = 'running' | 'done' | 'error'

interface Artifact {
    id: string
    type: ArtifactType
    title: string
    subtitle: string
    href?: string
    raw?: string
    createdAt: number
}

interface StreamEvent {
    id: string
    state: StreamState
    message: string
    detail?: string
    createdAt: number
}

interface PoolStats {
    slots: number
    inUse: number
    idle: number
    spawning: number
    queued: number
    browsers: number
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi

function makeId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function collectStrings(value: unknown, out: string[], depth = 0): void {
    if (depth > 8 || value == null) return
    if (typeof value === 'string') {
        out.push(value)
        return
    }
    if (Array.isArray(value)) {
        for (const item of value) collectStrings(item, out, depth + 1)
        return
    }
    if (typeof value === 'object') {
        for (const item of Object.values(value as Record<string, unknown>)) {
            collectStrings(item, out, depth + 1)
        }
    }
}

function classifyUrl(url: string): ArtifactType {
    const lower = url.toLowerCase()
    if (
        lower.includes('youtube.com') ||
        lower.includes('youtu.be') ||
        lower.includes('vimeo.com') ||
        lower.includes('tiktok.com') ||
        /\.(mp4|webm|mov|m3u8)(\?|#|$)/i.test(lower)
    ) {
        return 'video'
    }
    if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|json|xml)(\?|#|$)/i.test(lower)) {
        return 'documents'
    }
    return 'links'
}

function inferRunMode(prompt: string): 'skill' | 'software' {
    const p = prompt.trim().toLowerCase()
    if (p.startsWith('/build ')) return 'software'
    if (p.startsWith('/forge ')) return 'skill'
    if (
        /\b(build|create|generate|write|make)\b/.test(p) &&
        /\b(software|tool|script|program|app|code)\b/.test(p)
    ) {
        return 'software'
    }
    return 'skill'
}

function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function Page() {
    const [prompt, setPrompt] = useState('')
    const [activeFolder, setActiveFolder] = useState<ArtifactType>('links')
    const [working, setWorking] = useState(false)
    const [currentPrompt, setCurrentPrompt] = useState('')
    const [artifacts, setArtifacts] = useState<Artifact[]>([])
    const [stream, setStream] = useState<StreamEvent[]>([])
    const [poolStats, setPoolStats] = useState<PoolStats>({
        slots: 0,
        inUse: 0,
        idle: 0,
        spawning: 0,
        queued: 0,
        browsers: 0,
    })

    const pushEvent = (state: StreamState, message: string, detail?: string) => {
        const evt: StreamEvent = {
            id: makeId(),
            state,
            message,
            detail,
            createdAt: Date.now(),
        }
        setStream(prev => [evt, ...prev].slice(0, 120))
    }

    const addArtifact = (artifact: Artifact) => {
        setArtifacts(prev => [artifact, ...prev].slice(0, 300))
    }

    const captureResultArtifacts = (source: string, result: unknown) => {
        const textBits: string[] = []
        collectStrings(result, textBits)
        const urls = Array.from(
            new Set(
                textBits.flatMap(t => (t.match(URL_RE) ?? []).map(v => v.trim()))
            )
        ).slice(0, 40)

        if (urls.length === 0) {
            const raw = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            addArtifact({
                id: makeId(),
                type: 'documents',
                title: `${source} result snapshot`,
                subtitle: 'Structured output saved',
                raw: raw.slice(0, 8000),
                createdAt: Date.now(),
            })
            return
        }

        for (const url of urls) {
            let host = url
            try {
                host = new URL(url).host
            } catch {
                // Keep original URL if parsing fails.
            }
            addArtifact({
                id: makeId(),
                type: classifyUrl(url),
                title: host,
                subtitle: url,
                href: url,
                createdAt: Date.now(),
            })
        }
    }

    async function refreshPoolStats() {
        try {
            const res = await authFetch('/api/pool/stats')
            if (!res.ok) return
            const data = await res.json()
            setPoolStats(data)
        } catch {
            // Best effort live telemetry.
        }
    }

    useEffect(() => {
        refreshPoolStats()
        const id = setInterval(refreshPoolStats, 2000)
        return () => clearInterval(id)
    }, [])

    const folderCounts = useMemo(() => {
        return artifacts.reduce(
            (acc, item) => {
                acc[item.type] += 1
                return acc
            },
            { links: 0, video: 0, documents: 0, software: 0 } as Record<ArtifactType, number>
        )
    }, [artifacts])

    const activeItems = useMemo(
        () => artifacts.filter(item => item.type === activeFolder),
        [artifacts, activeFolder]
    )

    const latest = artifacts[0]

    const runPrompt = async () => {
        const text = prompt.trim()
        if (!text || working) return

        setPrompt('')
        setWorking(true)
        setCurrentPrompt(text)
        pushEvent('running', 'Prompt accepted', text)

        const mode = inferRunMode(text)
        pushEvent('running', 'Planner selected mode', mode === 'software' ? 'software build' : 'skill forge + execute')

        try {
            if (mode === 'software') {
                pushEvent('running', 'Building software artifact')
                const res = await authFetch('/api/software', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ intent: text }),
                })
                const data = await res.json()
                if (!res.ok || !data.success) throw new Error(data.error ?? 'Software build failed')

                addArtifact({
                    id: makeId(),
                    type: 'software',
                    title: data.filename,
                    subtitle: data.description ?? 'Software output',
                    href: data.downloadUrl,
                    createdAt: Date.now(),
                })
                pushEvent('done', 'Software generated', data.filename)
                toast.success(`Software built: ${data.filename}`)
            } else {
                pushEvent('running', 'Forging skill from prompt')
                const forgeRes = await authFetch('/api/forge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ intent: text }),
                })
                const forgeData = await forgeRes.json()
                if (!forgeRes.ok || !forgeData.success) throw new Error(forgeData.error ?? 'Forge failed')
                pushEvent('done', 'Skill forged', `${forgeData.name} (${forgeData.skillId})`)

                pushEvent('running', 'Executing forged skill')
                const execRes = await authFetch(`/api/skills/${encodeURIComponent(forgeData.skillId)}/execute`, {
                    method: 'POST',
                })
                const execData = await execRes.json()
                if (!execRes.ok || !execData.success) throw new Error(execData.error ?? 'Execution failed')

                captureResultArtifacts(forgeData.name, execData.result)
                pushEvent('done', 'Execution complete', execData.truncated ? 'result truncated by server' : 'result captured')
                toast.success(`Completed: ${forgeData.name}`)
            }
        } catch (err) {
            const message = (err as Error).message || 'Unknown error'
            pushEvent('error', 'Run failed', message)
            toast.error(message)
        } finally {
            setWorking(false)
            refreshPoolStats()
        }
    }

    const folders: Array<{ key: ArtifactType; title: string; icon: React.ElementType; color: string }> = [
        { key: 'links', title: 'Links', icon: Link2, color: 'from-cyan-400 to-blue-500' },
        { key: 'video', title: 'Video', icon: Video, color: 'from-fuchsia-400 to-purple-500' },
        { key: 'documents', title: 'Documents', icon: FileText, color: 'from-amber-400 to-orange-500' },
        { key: 'software', title: 'Software', icon: Code2, color: 'from-emerald-400 to-teal-500' },
    ]

    const nowEvents = stream.slice(0, 7)
    const upcomingEvents = stream.slice(7, 14)

    return (
        <div className="min-h-screen bg-[#0a1025] p-3 md:p-8">
            <Toaster position="top-right" theme="dark" />

            <div className="mx-auto max-w-[1420px] min-h-[90vh] overflow-hidden rounded-[26px] border-[5px] border-[#20274d] shadow-[0_40px_120px_rgba(0,0,0,0.55)] bg-[#edf0f8] lg:grid lg:grid-cols-12">
                <aside className="lg:col-span-5 bg-gradient-to-b from-[#21274b] to-[#1a2040] text-[#f2f5ff] p-7 md:p-10 flex flex-col gap-7 relative">
                    <div className="absolute right-10 top-8 h-24 w-24 opacity-25 [background-image:radial-gradient(circle,rgba(255,255,255,0.35)_1px,transparent_1px)] [background-size:8px_8px]" />
                    <button className="h-9 w-9 rounded-full bg-white/8 border border-white/15 flex items-center justify-center text-white/80">
                        <Menu className="h-4 w-4" />
                    </button>

                    <div>
                        <h1 className="text-5xl font-black tracking-tight">Hi Operator</h1>
                        <p className="text-base text-white/55 mt-2">Welcome back to the workspace. Type one prompt and everything runs automatically.</p>
                    </div>

                    <div>
                        <div className="rounded-2xl bg-white/8 border border-white/15 px-4 py-3 mb-4">
                            <p className="text-xs uppercase tracking-[0.24em] text-white/45">Current Mission</p>
                            <p className="text-sm text-white/80 mt-1 truncate">{currentPrompt || 'No prompt running yet'}</p>
                        </div>
                        <p className="text-sm font-semibold text-white/80 mb-3">Folders ({artifacts.length})</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {folders.map(folder => {
                                const Icon = folder.icon
                                const active = activeFolder === folder.key
                                return (
                                    <button
                                        key={folder.key}
                                        onClick={() => setActiveFolder(folder.key)}
                                        className={`rounded-2xl p-2.5 border text-left transition-all ${
                                            active
                                                ? 'border-cyan-300/80 bg-white/15'
                                                : 'border-white/10 bg-black/20 hover:bg-white/8'
                                        }`}
                                    >
                                        <div className={`h-16 rounded-xl bg-gradient-to-br ${folder.color} flex items-center justify-center relative overflow-hidden`}>
                                            <span className="absolute -right-1 -top-1 h-7 w-7 rounded-full bg-white/25" />
                                            <Icon className="h-5 w-5 text-white" />
                                        </div>
                                        <p className="text-xs font-semibold mt-2">{folder.title}</p>
                                        <p className="text-[11px] text-white/60 mt-0.5">{folderCounts[folder.key]} items</p>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/25 p-4 flex-1 min-h-[180px] overflow-y-auto">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-white/60">{activeFolder}</p>
                            <FolderOpenDot className="h-4 w-4 text-white/50" />
                        </div>

                        {activeItems.length === 0 && (
                            <p className="text-sm text-white/55">No items yet. Run a prompt to fill this folder.</p>
                        )}

                        <div className="space-y-2">
                            {activeItems.slice(0, 12).map(item => (
                                <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                                    <p className="text-sm font-semibold truncate">{item.title}</p>
                                    <p className="text-xs text-white/60 truncate mt-0.5">{item.subtitle}</p>
                                    {item.href && (
                                        <button
                                            className="text-xs text-cyan-300 mt-2 underline underline-offset-2"
                                            onClick={() => window.open(item.href, '_blank')}
                                        >
                                            Open
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault()
                            runPrompt()
                        }}
                        className="rounded-2xl border border-white/10 bg-black/30 p-2 flex items-center gap-2"
                    >
                        <input
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            disabled={working}
                            placeholder="Write your prompt..."
                            className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-white/45"
                        />
                        <button
                            type="submit"
                            disabled={working || !prompt.trim()}
                            className="h-10 w-10 rounded-xl bg-cyan-400 text-[#0f1738] flex items-center justify-center disabled:opacity-45"
                        >
                            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </button>
                    </form>
                </aside>

                <section className="lg:col-span-7 bg-[#f7f8fc] p-7 md:p-10 text-[#1c2445] flex flex-col gap-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 className="text-4xl font-black tracking-tight">Execution Board</h2>
                            <p className="text-sm text-[#5e668a] mt-1">Live representation of what the engine is doing from your single prompt.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-9 w-9 rounded-full bg-[#ffb3b3]" />
                            <div className="h-9 w-9 rounded-full bg-[#b3cbff] -ml-2" />
                            <div className="h-9 w-9 rounded-full bg-[#c5b3ff] -ml-2" />
                            <div className="h-9 w-9 rounded-full border border-[#d2d7ea] bg-white text-[#8b93b8] flex items-center justify-center text-sm font-semibold -ml-1">+</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Metric label="Active" value={poolStats.inUse} />
                        <Metric label="Queued" value={poolStats.queued} />
                        <Metric label="Saved" value={artifacts.length} />
                        <Metric label="Status" value={working ? 1 : 0} asStatus />
                    </div>

                    <div className="rounded-3xl border border-[#d8ddec] bg-white p-6 flex-1">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-black">Today</h3>
                            <MoreHorizontal className="h-4 w-4 text-[#8a92b7]" />
                        </div>
                        <div className="mt-4 space-y-2">
                            {nowEvents.length === 0 && (
                                <div className="rounded-xl border border-dashed border-[#d3d8e9] bg-[#fbfcff] p-4 text-sm text-[#7480a8]">
                                    Waiting for the first prompt...
                                </div>
                            )}
                            {nowEvents.map(event => (
                                <TaskRow
                                    key={event.id}
                                    title={event.message}
                                    detail={event.detail}
                                    state={event.state}
                                    time={formatTime(event.createdAt)}
                                />
                            ))}
                        </div>

                        <div className="flex items-center justify-between mt-8">
                            <h3 className="text-xl font-black">Upcoming</h3>
                            <MoreHorizontal className="h-4 w-4 text-[#8a92b7]" />
                        </div>
                        <div className="mt-4 space-y-2">
                            {upcomingEvents.length === 0 ? (
                                <TaskRow
                                    title={working ? 'Mission in progress' : 'Awaiting next prompt'}
                                    detail={working ? 'Planner and executors are running now' : 'Submit a prompt from the left panel'}
                                    state={working ? 'running' : 'done'}
                                />
                            ) : (
                                upcomingEvents.map(event => (
                                    <TaskRow
                                        key={event.id}
                                        title={event.message}
                                        detail={event.detail}
                                        state={event.state}
                                        time={formatTime(event.createdAt)}
                                    />
                                ))
                            )}
                        </div>

                        <div className="mt-8 rounded-2xl border border-[#e0e5f2] bg-[#f9fbff] p-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs uppercase tracking-[0.22em] text-[#7c84aa]">Latest Output</p>
                                <Clock3 className="h-3.5 w-3.5 text-[#8991b4]" />
                            </div>
                            {latest ? (
                                <div className="mt-2">
                                    <p className="text-sm font-semibold text-[#202a4d]">{latest.title}</p>
                                    <p className="text-xs text-[#66739f] mt-0.5 break-all">{latest.subtitle}</p>
                                    {latest.href && (
                                        <button
                                            className="text-xs font-semibold text-[#3d4fe0] mt-2 underline underline-offset-2"
                                            onClick={() => window.open(latest.href, '_blank')}
                                        >
                                            Open saved artifact
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-[#7d86ac] mt-2">No output saved yet.</p>
                            )}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    )
}

function Metric({ label, value, asStatus = false }: { label: string; value: number; asStatus?: boolean }) {
    if (asStatus) {
        return (
            <div className="rounded-2xl border border-[#d7dced] bg-white px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#7d86ac]">{label}</p>
                <div className="mt-1 flex items-center gap-2">
                    {value > 0 ? <Loader2 className="h-4 w-4 animate-spin text-[#4f5bd5]" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    <p className="text-sm font-bold text-[#26315a]">{value > 0 ? 'Running' : 'Idle'}</p>
                </div>
            </div>
        )
    }
    return (
        <div className="rounded-2xl border border-[#d7dced] bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#7d86ac]">{label}</p>
            <p className="text-2xl font-black text-[#1f284a] mt-1">{value}</p>
        </div>
    )
}

function TaskRow({
    title,
    detail,
    state,
    time,
}: {
    title: string
    detail?: string
    state: StreamState
    time?: string
}) {
    return (
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-[#e4e8f3] bg-[#fcfdff] px-3 py-2.5">
            <StatusBullet state={state} />
            <div>
                <p className="text-sm font-semibold text-[#25305a]">{title}</p>
                {detail && <p className="text-xs text-[#7180aa] mt-0.5">{detail}</p>}
            </div>
            <div className="flex flex-col items-end gap-1">
                <StateBadge state={state} />
                {time && (
                    <p className="text-[10px] text-[#9098bb]">{time}</p>
                )}
            </div>
        </div>
    )
}

function StatusBullet({ state }: { state: StreamState }) {
    if (state === 'running') {
        return <Loader2 className="h-4 w-4 animate-spin text-[#5a67ea]" />
    }
    if (state === 'done') {
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    }
    return <AlertTriangle className="h-4 w-4 text-rose-500" />
}

function StateBadge({ state }: { state: StreamState }) {
    if (state === 'running') {
        return (
            <span className="rounded-full bg-[#e6eefc] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#4f67d6]">
                In Progress
            </span>
        )
    }
    if (state === 'done') {
        return (
            <span className="rounded-full bg-[#eaf8ef] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#2e8a54]">
                Complete
            </span>
        )
    }
    return (
        <span className="rounded-full bg-[#fdecef] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#be3d5f]">
            Failed
        </span>
    )
}
