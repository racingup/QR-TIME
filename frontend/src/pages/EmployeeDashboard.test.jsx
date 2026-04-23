import { render as baseRender, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aliceHistory, aliceSummary } from '../test/fixtures'

const summaryMock = vi.fn()
const historyMock = vi.fn()

vi.mock('../api/me', () => ({
  summary: () => summaryMock(),
}))
vi.mock('../api/clock', () => ({
  history: (m) => historyMock(m),
  today: vi.fn(),
  scan: vi.fn(),
  day: vi.fn(),
  regularize: vi.fn(),
  editSession: vi.fn(),
}))

import EmployeeDashboard from './EmployeeDashboard'

const render = (ui) => baseRender(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => {
  summaryMock.mockReset()
  historyMock.mockReset()
})

afterEach(() => vi.clearAllMocks())

describe('EmployeeDashboard', () => {
  it('renders without crashing and shows the loading state', () => {
    summaryMock.mockReturnValue(new Promise(() => {})) // pending forever
    historyMock.mockReturnValue(new Promise(() => {}))
    render(<EmployeeDashboard />)
    expect(screen.getByText(/chargement/i)).toBeInTheDocument()
  })

  it('displays summary data from the API (alice fixture)', async () => {
    summaryMock.mockResolvedValue(aliceSummary)
    historyMock.mockResolvedValue(aliceHistory)

    render(<EmployeeDashboard />)

    expect(await screen.findByRole('heading', { name: /alice/i })).toBeInTheDocument()
    // Worked 240 min = 4h00, target 504 min = 8h24
    expect(screen.getByText(/4h00/)).toBeInTheDocument()
    expect(screen.getByText(/8h24/)).toBeInTheDocument()
    // Overtime +0.60h in green
    expect(screen.getByText(/\+0\.60 h/)).toBeInTheDocument()
    // Vacation remaining
    expect(screen.getByText('25.00')).toBeInTheDocument()
  })

  it('renders the month history grouped by day with correct totals', async () => {
    summaryMock.mockResolvedValue(aliceSummary)
    historyMock.mockResolvedValue(aliceHistory)

    render(<EmployeeDashboard />)

    // Two distinct days should appear: 2026-04-21 (today) and 2026-04-20 (yesterday).
    await waitFor(() => {
      expect(screen.getByText('2026-04-20')).toBeInTheDocument()
      expect(screen.getByText('2026-04-21')).toBeInTheDocument()
    })
    // Yesterday total: 210 + 330 = 540 min = 9h00
    expect(screen.getByText('9h00')).toBeInTheDocument()
  })

  it('calls the history endpoint with the current month on mount', async () => {
    summaryMock.mockResolvedValue(aliceSummary)
    historyMock.mockResolvedValue([])

    render(<EmployeeDashboard />)

    await waitFor(() => expect(historyMock).toHaveBeenCalledTimes(1))
    const month = historyMock.mock.calls[0][0]
    expect(month).toMatch(/^\d{4}-\d{2}$/)
  })
})
