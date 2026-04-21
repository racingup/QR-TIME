import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createMock = vi.fn()
vi.mock('../api/missions', () => ({
  create: (payload) => createMock(payload),
  my: vi.fn(),
  pending: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  qr: vi.fn(),
}))

import MissionFormPage from './MissionFormPage'

beforeEach(() => createMock.mockReset())
afterEach(() => vi.clearAllMocks())

describe('MissionFormPage', () => {
  it('renders the form with REMOTE selected by default and no GPS fields', () => {
    render(<MissionFormPage />)

    expect(screen.getByRole('heading', { name: /demande de mission/i })).toBeInTheDocument()
    const typeSelect = screen.getByRole('combobox')
    expect(typeSelect).toHaveValue('REMOTE')
    // FIELD-only fields should not be present in REMOTE mode
    expect(screen.queryByPlaceholderText(/client renault/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/rayon gps souhaité/i)).not.toBeInTheDocument()
  })

  it('shows GPS + address fields when switching to FIELD', async () => {
    render(<MissionFormPage />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'FIELD')

    expect(screen.getByPlaceholderText(/client renault/i)).toBeInTheDocument()
    expect(screen.getByText(/rayon gps souhaité/i)).toBeInTheDocument()
    // Live preview text should mention the default radius and placeholder location
    expect(screen.getByText(/rayon de/i)).toHaveTextContent('500')
  })

  it('submits a REMOTE mission and shows the PENDING confirmation', async () => {
    createMock.mockResolvedValue({
      id: 99,
      status: 'PENDING',
      mission_type: 'REMOTE',
      date_start: '2026-04-22',
      date_end: '2026-04-22',
    })

    render(<MissionFormPage />)
    await userEvent.type(screen.getAllByDisplayValue('')[0], '2026-04-22')
    await userEvent.type(screen.getAllByDisplayValue('')[0], '2026-04-22')
    await userEvent.click(screen.getByRole('button', { name: /soumettre/i }))

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    const payload = createMock.mock.calls[0][0]
    expect(payload.mission_type).toBe('REMOTE')
    // REMOTE must strip gps_radius_meters + location_name.
    expect(payload.gps_radius_meters).toBeUndefined()
    expect(payload.location_name).toBeUndefined()

    expect(await screen.findByText(/demande envoyée/i)).toBeInTheDocument()
    expect(screen.getByText('PENDING')).toBeInTheDocument()
  })

  it('submits a FIELD mission with location + radius', async () => {
    createMock.mockResolvedValue({ id: 100, status: 'PENDING', mission_type: 'FIELD' })

    render(<MissionFormPage />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'FIELD')

    const dateInputs = screen.getAllByDisplayValue('')
    // dates
    await userEvent.type(dateInputs[0], '2026-04-22')
    await userEvent.type(dateInputs[1], '2026-04-22')

    await userEvent.type(
      screen.getByPlaceholderText(/client renault/i),
      'Client Renault',
    )

    await userEvent.click(screen.getByRole('button', { name: /soumettre/i }))

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    const payload = createMock.mock.calls[0][0]
    expect(payload.mission_type).toBe('FIELD')
    expect(payload.location_name).toBe('Client Renault')
    expect(payload.gps_radius_meters).toBe(500)
  })

})
