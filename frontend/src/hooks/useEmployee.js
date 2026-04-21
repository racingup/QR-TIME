import { useCallback, useEffect, useState } from 'react'
import * as clockApi from '../api/clock'
import * as meApi from '../api/me'

export function useEmployee(month) {
  const [summary, setSummary] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, h] = await Promise.all([meApi.summary(), clockApi.history(month)])
      setSummary(s)
      setHistory(h)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { summary, history, loading, error, refresh }
}
