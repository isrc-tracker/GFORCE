import { NextResponse } from 'next/server'
import { loadAllSkills } from '@/lib/automation/skill-store'

export async function GET() {
    const skills = await loadAllSkills()
    return NextResponse.json(skills)
}
