import type { Cluster } from './types'

export const ALERTS_ENABLED_KEY = 'trendforge-alerts-enabled'
export const BROWSER_NOTIFY_KEY = 'trendforge-browser-notify'

export interface ShiftAlert {
  clusterName: string
  shift: number
  volume: number
  avgSentiment: number
}

export function loadAlertsEnabled(): boolean {
  try {
    const v = localStorage.getItem(ALERTS_ENABLED_KEY)
    return v === null ? true : v === 'true'
  } catch {
    return true
  }
}

export function saveAlertsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ALERTS_ENABLED_KEY, String(enabled))
  } catch {}
}

export function loadBrowserNotify(): boolean {
  try {
    return localStorage.getItem(BROWSER_NOTIFY_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveBrowserNotify(enabled: boolean): void {
  try {
    localStorage.setItem(BROWSER_NOTIFY_KEY, String(enabled))
  } catch {}
}

export function detectShiftAlerts(clusters: Cluster[], threshold: number, minVolume = 2): ShiftAlert[] {
  return clusters
    .filter(c => c.shift >= threshold && c.volume >= minVolume)
    .sort((a, b) => b.shift - a.shift)
    .map(c => ({
      clusterName: c.name,
      shift: c.shift,
      volume: c.volume,
      avgSentiment: c.avgSentiment,
    }))
}

export function findNewShiftAlerts(
  clusters: Cluster[],
  threshold: number,
  previouslyNotified: Record<string, number>,
): { alerts: ShiftAlert[]; nextNotified: Record<string, number> } {
  const nextNotified = { ...previouslyNotified }
  const alerts: ShiftAlert[] = []

  for (const c of clusters) {
    if (c.shift < threshold || c.volume < 2) continue
    const prev = previouslyNotified[c.name] ?? 0
    if (prev >= threshold) continue
    nextNotified[c.name] = c.shift
    alerts.push({
      clusterName: c.name,
      shift: c.shift,
      volume: c.volume,
      avgSentiment: c.avgSentiment,
    })
  }

  return { alerts, nextNotified }
}

export function formatShiftAlertMessage(alert: ShiftAlert): string {
  return `${alert.clusterName} spiking (+${alert.shift.toFixed(1)} velocity)`
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.requestPermission()
}

export function showBrowserNotification(title: string, body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, tag: 'trendforge-shift' })
  } catch {}
}
