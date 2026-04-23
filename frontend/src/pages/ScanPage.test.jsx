import { render as baseRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Capture the QRScanner's onDecode prop so tests can fire it manually.
let lastOnDecode = null

vi.mock('../components/QRScanner', () => ({
  default: ({ onDecode }) => {
    lastOnDecode = onDecode
    return <div data-testid="mock-qr-scanner">[QR scanner mock]</div>
  },
}))

const mockScan = vi.fn()
vi.mock('../api/clock', () => ({
  scan: (...args) => mockScan(...args),
  today: vi.fn(),
  history: vi.fn(),
  day: vi.fn(),
  regularize: vi.fn(),
  editSession: vi.fn(),
}))

// GPS consent already granted in tests — gate is skipped.
vi.mock('../api/me', () => ({
  consent: {
    get: () => Promise.resolve({ gps: { granted: true, at: '2026-04-01T00:00:00Z' } }),
    set: vi.fn().mockResolvedValue({ ok: true }),
  },
  summary: vi.fn(),
  holidays: vi.fn(),
  exportData: vi.fn(),
  deleteAccount: vi.fn(),
}))

import ScanPage from './ScanPage'

const render = (ui) => baseRender(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => {
  lastOnDecode = null
  mockScan.mockReset()
  // Stub geolocation: always succeeds with Notre-Dame coords.
  global.navigator.geolocation = {
    getCurrentPosition: (success) =>
      success({ coords: { latitude: 48.853, longitude: 2.3499 } }),
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ScanPage', () => {
  it('renders idle state with the QR scanner mounted', async () => {
    render(<ScanPage />)
    // Wait for the consent fetch to resolve and the scanner to mount.
    expect(await screen.findByRole('heading', { name: /scanner/i })).toBeInTheDocument()
    expect(screen.getByTestId('mock-qr-scanner')).toBeInTheDocument()
    expect(screen.getByText(/présentez le QR code/i)).toBeInTheDocument()
  })

  it('shows justification UI when backend returns requires_justification', async () => {
    mockScan.mockResolvedValueOnce({ requires_justification: true, action: 'IN' })

    render(<ScanPage />)
    // Simulate the scanner detecting a code.
    await waitFor(() => expect(lastOnDecode).toBeTruthy())
    lastOnDecode('site-token-abc')

    expect(await screen.findByText(/justification requise/i)).toBeInTheDocument()
    const textarea = screen.getByTestId('justification-input')
    expect(textarea).toBeInTheDocument()

    // Confirm button should now resubmit with the justification text.
    mockScan.mockResolvedValueOnce({
      action: 'IN',
      clock_in_rounded: '2026-04-21T09:00:00Z',
    })
    await userEvent.type(textarea, 'RDV médical')
    await userEvent.click(screen.getByRole('button', { name: /confirmer/i }))

    await waitFor(() => {
      expect(mockScan).toHaveBeenLastCalledWith({
        qr_token: 'site-token-abc',
        gps_lat: 48.853,
        gps_lon: 2.3499,
        justification: 'RDV médical',
      })
    })
    expect(await screen.findByText(/pointage enregistré/i)).toBeInTheDocument()
  })

  it('shows out-of-range message with exact distance and allowed radius', async () => {
    mockScan.mockRejectedValueOnce({
      response: {
        status: 403,
        data: { error: 'GPS_OUT_OF_RANGE', distance_m: 312, allowed_m: 150 },
      },
    })

    render(<ScanPage />)
    await waitFor(() => expect(lastOnDecode).toBeTruthy())
    lastOnDecode('site-token-abc')

    expect(await screen.findByText(/hors périmètre/i)).toBeInTheDocument()
    expect(screen.getByText(/312 m/)).toBeInTheDocument()
    expect(screen.getByText(/150 m/)).toBeInTheDocument()
  })

  it('shows GPS error message when geolocation is denied', async () => {
    // Override geolocation to fail.
    global.navigator.geolocation = {
      getCurrentPosition: (_success, error) =>
        error({ code: 1, message: 'denied' }),
    }
    // Backend call fails too (no GPS provided).
    mockScan.mockRejectedValueOnce({ response: { status: 400 } })

    render(<ScanPage />)
    await waitFor(() => expect(lastOnDecode).toBeTruthy())
    lastOnDecode('site-token-abc')

    expect(await screen.findByText(/GPS indisponible/i)).toBeInTheDocument()
    expect(screen.getByText(/refusé l'accès/i)).toBeInTheDocument()
  })
})
