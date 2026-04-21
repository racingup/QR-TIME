import { useCallback, useEffect, useState } from 'react'
import * as missionsApi from '../api/missions'

export function useMyMissions() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await missionsApi.my()
      setItems(data.results || data)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])
  return { items, loading, refresh }
}

export function usePendingMissions() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await missionsApi.pending()
      setItems(data.results || data)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])
  return { items, loading, refresh }
}
