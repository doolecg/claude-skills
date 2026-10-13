export type WorkReportTab = 'today' | 'week' | 'month' | 'year'

declare module 'claude-code' {
  interface PluginState {
    'work-report': { tab: WorkReportTab; rev: number }
  }
}
