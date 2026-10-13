export type CleanViewTask = { id: string; name: string; status: 'done' | 'active' | 'upcoming' }
export type CleanViewChecklist = { tasks: CleanViewTask[] }
export type BrandSkinValue = {
  palette?: { primary?: string; secondary?: string; accent?: string; background?: string; text?: string }
}

declare module 'claude-code' {
  interface PluginState {
    'road-trip': { view: string }
    'clean-view': { checklist: CleanViewChecklist }
    'brand-skin': { skin: BrandSkinValue }
  }
}
