import type { ScheduleStatus, Test } from '../types'

export function getScheduleStatus(test: Test, now = new Date()): ScheduleStatus {
  const start = new Date(test.scheduledStart)
  const end = new Date(test.scheduledEnd)
  if (now < start) return 'upcoming'
  if (now > end) return 'closed'
  return 'open'
}

export function formatScheduleRange(test: Test): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  return `${fmt(test.scheduledStart)} — ${fmt(test.scheduledEnd)}`
}

export function getScheduleMessage(status: ScheduleStatus, test: Test): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  switch (status) {
    case 'upcoming':
      return `This test opens on ${fmt(test.scheduledStart)}. Please return at the scheduled time.`
    case 'closed':
      return `The test window closed on ${fmt(test.scheduledEnd)}. No further attempts are allowed.`
    case 'open':
      return `Test window is open until ${fmt(test.scheduledEnd)}.`
  }
}
