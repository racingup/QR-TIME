import { render as baseRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  alerts as alertsFixture,
  pendingAbsences,
  pendingMissions,
  presence as presenceFixture,
} from '../test/fixtures'

const presenceMock = vi.fn()
const absentMock = vi.fn()
const alertsMock = vi.fn()
const reportMock = vi.fn()
const pendingMissionsMock = vi.fn()
const pendingAbsencesMock = vi.fn()
const approveMissionMock = vi.fn()
const rejectMissionMock = vi.fn()
const approveAbsenceMock = vi.fn()
const rejectAbsenceMock = vi.fn()

vi.mock('../api/manager', () => ({
  presence: () => presenceMock(),
  absent: () => absentMock(),
  alerts: () => alertsMock(),
  report: (m) => reportMock(m),
  reportDownloadUrl: (m, f) => `/dl?m=${m}&f=${f}`,
}))
vi.mock('../api/missions', () => ({
  pending: () => pendingMissionsMock(),
  approve: (id, payload) => approveMissionMock(id, payload),
  reject: (id, comment) => rejectMissionMock(id, comment),
  my: vi.fn(), create: vi.fn(), qr: vi.fn(),
}))
vi.mock('../api/absences', () => ({
  pending: () => pendingAbsencesMock(),
  approve: (id, comment) => approveAbsenceMock(id, comment),
  reject: (id, comment) => rejectAbsenceMock(id, comment),
  my: vi.fn(), create: vi.fn(), update: vi.fn(),
}))

// useAuth context — returns a manager (not the same id as the test fixtures' user)
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 999, username: 'test-mgr', is_manager: true, is_superuser: false },
  }),
}))

import ManagerDashboard from './ManagerDashboard'

const render = (ui) => baseRender(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => {
  presenceMock.mockReset()
  absentMock.mockReset()
  alertsMock.mockReset()
  reportMock.mockReset()
  pendingMissionsMock.mockReset()
  pendingAbsencesMock.mockReset()
  approveMissionMock.mockReset()
  rejectMissionMock.mockReset()
  approveAbsenceMock.mockReset()
  rejectAbsenceMock.mockReset()
})

afterEach(() => vi.clearAllMocks())

const primeHappyPath = () => {
  presenceMock.mockResolvedValue(presenceFixture)
  absentMock.mockResolvedValue({
    absent_on_leave: [
      {
        user_id: 3, username: 'bob', absence_type: 'SICK',
        date_start: '2026-04-21', date_end: '2026-04-21',
        half_day_start: false, half_day_end: false,
      },
    ],
    silent: [],
  })
  alertsMock.mockResolvedValue(alertsFixture)
  pendingMissionsMock.mockResolvedValue(pendingMissions)
  pendingAbsencesMock.mockResolvedValue(pendingAbsences)
}

describe('ManagerDashboard — overview', () => {
  it('renders without crashing (loading then content)', async () => {
    primeHappyPath()
    render(<ManagerDashboard />)
    expect(await screen.findByText(/temps réel/i)).toBeInTheDocument()
  })

  it('shows present, absent (red), pending mission and absence', async () => {
    primeHappyPath()
    render(<ManagerDashboard />)

    expect(await screen.findByText(/temps réel/i)).toHaveTextContent('présence (1)')
    expect(screen.getByText(/temps réel/i)).toHaveTextContent('absents (1)')
    // alice present
    expect(screen.getByText('alice')).toBeInTheDocument()
    // bob absent
    expect(screen.getByText('bob')).toBeInTheDocument()
    // pending mission row (FIELD)
    expect(screen.getByText(/FIELD/)).toBeInTheDocument()
    // pending absence row (VACATION)
    expect(screen.getByText(/VACATION/)).toBeInTheDocument()
  })

  it('opens approve modal and submits with manager-set radius', async () => {
    primeHappyPath()
    approveMissionMock.mockResolvedValue({ id: 42, status: 'APPROVED' })
    pendingMissionsMock.mockResolvedValueOnce(pendingMissions).mockResolvedValue({
      count: 0, results: [],
    })

    render(<ManagerDashboard />)
    await screen.findByText(/FIELD/)
    await userEvent.click(screen.getByRole('button', { name: /approuver/i }))

    // Modal opens with the requested radius prefilled (300 in fixture).
    const radiusInput = await screen.findByRole('spinbutton')
    expect(radiusInput).toHaveValue(300)
    await userEvent.clear(radiusInput)
    await userEvent.type(radiusInput, '450')
    // Click the modal's "Approuver" button (second on the page now).
    const buttons = screen.getAllByRole('button', { name: /approuver/i })
    await userEvent.click(buttons[buttons.length - 1])

    await waitFor(() =>
      expect(approveMissionMock).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ gps_radius_meters: 450 }),
      ),
    )
  })

  it('approves an absence directly from the list', async () => {
    primeHappyPath()
    approveAbsenceMock.mockResolvedValue({ id: 1, status: 'APPROVED' })

    render(<ManagerDashboard />)
    await screen.findByText(/VACATION/)

    await userEvent.click(screen.getByRole('button', { name: /^valider$/i }))
    await waitFor(() =>
      expect(approveAbsenceMock).toHaveBeenCalledWith(1, undefined),
    )
  })
})

describe('ManagerDashboard — reporting tab', () => {
  it('loads the report on tab change and lets the user pick a month', async () => {
    primeHappyPath()
    reportMock.mockResolvedValue({
      month: '2026-04',
      rows: [
        {
          user_id: 1, username: 'alice', sessions_count: 12,
          worked_hours: 76.5, overtime_balance_hours: 1.2,
          forgotten_sessions: 0, open_sessions: 0,
          vacation_quota: 25, vacation_used: 0, vacation_remaining: 25,
        },
      ],
    })
    render(<ManagerDashboard />)
    await screen.findByText(/temps réel/i)
    await userEvent.click(screen.getByRole('button', { name: /reporting/i }))

    await waitFor(() => expect(reportMock).toHaveBeenCalled())
    expect(await screen.findByText(/alice/)).toBeInTheDocument()
    expect(screen.getByText(/76\.50 h/)).toBeInTheDocument()
    expect(screen.getByText(/\+1\.20 h/)).toBeInTheDocument()
  })
})
