import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  alerts as alertsFixture,
  pendingAbsences,
  pendingMissions,
  presence as presenceFixture,
} from '../test/fixtures'

const presenceMock = vi.fn()
const alertsMock = vi.fn()
const pendingMissionsMock = vi.fn()
const pendingAbsencesMock = vi.fn()
const approveMissionMock = vi.fn()
const rejectMissionMock = vi.fn()
const approveAbsenceMock = vi.fn()

vi.mock('../api/manager', () => ({
  presence: () => presenceMock(),
  alerts: () => alertsMock(),
}))
vi.mock('../api/missions', () => ({
  pending: () => pendingMissionsMock(),
  approve: (id, comment) => approveMissionMock(id, comment),
  reject: (id, comment) => rejectMissionMock(id, comment),
  my: vi.fn(), create: vi.fn(), qr: vi.fn(),
}))
vi.mock('../api/absences', () => ({
  pending: () => pendingAbsencesMock(),
  approve: (id, comment) => approveAbsenceMock(id, comment),
  my: vi.fn(), create: vi.fn(),
}))

import ManagerDashboard from './ManagerDashboard'

beforeEach(() => {
  presenceMock.mockReset()
  alertsMock.mockReset()
  pendingMissionsMock.mockReset()
  pendingAbsencesMock.mockReset()
  approveMissionMock.mockReset()
  rejectMissionMock.mockReset()
  approveAbsenceMock.mockReset()
})

afterEach(() => vi.clearAllMocks())

const primeHappyPath = () => {
  presenceMock.mockResolvedValue(presenceFixture)
  alertsMock.mockResolvedValue(alertsFixture)
  pendingMissionsMock.mockResolvedValue(pendingMissions)
  pendingAbsencesMock.mockResolvedValue(pendingAbsences)
}

describe('ManagerDashboard', () => {
  it('renders without crashing (shows loading first)', () => {
    presenceMock.mockReturnValue(new Promise(() => {}))
    alertsMock.mockReturnValue(new Promise(() => {}))
    pendingMissionsMock.mockReturnValue(new Promise(() => {}))
    pendingAbsencesMock.mockReturnValue(new Promise(() => {}))
    render(<ManagerDashboard />)
    expect(screen.getByText(/chargement/i)).toBeInTheDocument()
  })

  it('shows presence, pending missions, and pending absences from the API', async () => {
    primeHappyPath()
    render(<ManagerDashboard />)

    expect(await screen.findByText(/présence en temps réel/i)).toHaveTextContent('(1)')
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText(/Siège Paris/)).toBeInTheDocument()

    // Pending mission label shows mission_type.
    expect(screen.getByText(/FIELD/)).toBeInTheDocument()
    // Pending absence label shows absence_type.
    expect(screen.getByText(/VACATION/)).toBeInTheDocument()
  })

  it('calls missions.approve when the Valider button is clicked, then refreshes', async () => {
    primeHappyPath()
    approveMissionMock.mockResolvedValue({ id: 42, status: 'APPROVED' })
    // Second fetch pass returns an emptied pending list.
    pendingMissionsMock.mockResolvedValueOnce(pendingMissions).mockResolvedValue({
      count: 0, results: [],
    })

    render(<ManagerDashboard />)
    await screen.findByText(/FIELD/) // initial data loaded

    const approveButtons = screen.getAllByRole('button', { name: /valider/i })
    await userEvent.click(approveButtons[0])

    await waitFor(() =>
      expect(approveMissionMock).toHaveBeenCalledWith(42, ''),
    )
    await waitFor(() => expect(pendingMissionsMock).toHaveBeenCalledTimes(2))
  })

  it('calls missions.reject with a prompt comment on Refuser', async () => {
    primeHappyPath()
    rejectMissionMock.mockResolvedValue({ id: 42, status: 'REJECTED' })
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Pas pertinent')

    render(<ManagerDashboard />)
    await screen.findByText(/FIELD/)

    const rejectButtons = screen.getAllByRole('button', { name: /refuser/i })
    await userEvent.click(rejectButtons[0])

    await waitFor(() =>
      expect(rejectMissionMock).toHaveBeenCalledWith(42, 'Pas pertinent'),
    )
    promptSpy.mockRestore()
  })

  it('calls absences.approve on the second Valider button', async () => {
    primeHappyPath()
    approveAbsenceMock.mockResolvedValue({ id: 1, status: 'APPROVED' })

    render(<ManagerDashboard />)
    await screen.findByText(/VACATION/)

    const approveButtons = screen.getAllByRole('button', { name: /valider/i })
    // [0] = mission, [1] = absence
    await userEvent.click(approveButtons[1])

    await waitFor(() =>
      expect(approveAbsenceMock).toHaveBeenCalledWith(1, ''),
    )
  })
})
