import { useState } from 'react'
import { apiFetch } from './api'
import { SEED_CASES } from './seedCases'

// All state and network calls for the "Analyze FIR" workflow. The view is
// presentational; nothing else in the app talks to /api/analyze or
// /api/upload. It lives above the tab switch on purpose: an officer who
// opens a person or case from the results expects to come back to them.
export function useAnalysis({ onSaved }) {
  const demo = SEED_CASES[SEED_CASES.length - 1]
  const [narrative, setNarrative] = useState(demo.narrative)
  const [firNumber, setFirNumber] = useState(demo.fir_number)
  const [crimeType, setCrimeType] = useState(demo.crime_type)
  const [sampleLoaded, setSampleLoaded] = useState(false)
  const [showForm, setShowForm] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  function finish(data) {
    setResult(data)
    setShowForm(false)
    onSaved?.()
  }

  async function run() {
    setLoading(true)
    setError(null)
    try {
      finish(
        await apiFetch('/api/analyze', {
          method: 'POST',
          json: { narrative, fir_number: firNumber, crime_type: crimeType },
        })
      )
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function upload(file) {
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('fir_number', firNumber)
      form.append('crime_type', crimeType)
      const data = await apiFetch('/api/upload', { method: 'POST', form })
      if (data.narrative) setNarrative(data.narrative)
      finish(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function loadSample(firNumberValue) {
    const c = SEED_CASES.find((s) => s.fir_number === firNumberValue)
    if (!c) return
    setSampleLoaded(true)
    setNarrative(c.narrative)
    setFirNumber(c.fir_number)
    setCrimeType(c.crime_type)
  }

  function editNarrative(value) {
    setNarrative(value)
    setSampleLoaded(false)
  }

  return {
    narrative, editNarrative, firNumber, setFirNumber, crimeType, setCrimeType,
    sampleLoaded, loadSample, showForm, setShowForm, loading, result, error,
    run, upload, clear: () => { setResult(null); setError(null); setShowForm(true) },
  }
}
