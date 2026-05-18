import { useCallback, useState } from 'react'
import * as clockApi from '../api/clock'
import { getCurrentPosition } from './useGeolocation'

/**
 * Drives the scan flow.
 * State shape:
 *   { status: 'idle' | 'scanning' | 'sending' | 'ok' | 'requires_justification' |
 *             'gps_out_of_range' | 'gps_error' | 'error',
 *     data?, error? }
 */
export function useClock() {
  const [state, setState] = useState({ status: 'idle' })

  const submitScan = useCallback(async (qrToken, justification = '') => {
    setState({ status: 'sending' })
    let coords = null
    try {
      coords = await getCurrentPosition()
    } catch (geoErr) {
      // We still try without coords — backend will 400 if site requires GPS.
      // For REMOTE missions GPS is optional; the backend decides.
      try {
        const data = await clockApi.scan({ qr_token: qrToken, justification })
        return _handleResponse(data, setState)
      } catch (e) {
        const body = e.response?.data
        if (e.response?.status === 403 && body?.error === 'EXEMPT_FROM_CLOCKING') {
          setState({ status: 'exempt', data: body })
        } else {
          setState({ status: 'gps_error', error: geoErr, serverError: body })
        }
        return null
      }
    }

    try {
      const data = await clockApi.scan({
        qr_token: qrToken,
        gps_lat: coords.lat,
        gps_lon: coords.lon,
        justification,
      })
      return _handleResponse(data, setState)
    } catch (e) {
      const body = e.response?.data
      if (e.response?.status === 403 && body?.error === 'GPS_OUT_OF_RANGE') {
        setState({ status: 'gps_out_of_range', data: body })
      } else if (e.response?.status === 403 && body?.error === 'EXEMPT_FROM_CLOCKING') {
        setState({ status: 'exempt', data: body })
      } else if (e.response?.status === 409 && body?.error === 'OPEN_SESSION_PREVIOUS_DAY') {
        setState({ status: 'open_session_previous_day', data: body })
      } else if (e.response?.status === 404) {
        setState({ status: 'error', error: 'QR inconnu' })
      } else {
        setState({ status: 'error', error: body?.detail || body?.error || 'Erreur serveur' })
      }
      return null
    }
  }, [])

  const reset = useCallback(() => setState({ status: 'idle' }), [])

  return { state, submitScan, reset }
}

function _handleResponse(data, setState) {
  if (data?.requires_justification) {
    setState({ status: 'requires_justification', data })
  } else {
    setState({ status: 'ok', data })
  }
  return data
}
