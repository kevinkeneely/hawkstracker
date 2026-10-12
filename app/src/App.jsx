import { useEffect, useState } from 'react'
import PlayerStatsTable from "./components/PlayerStatsTable.jsx";

function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/hawksData.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load hawksData.json (${response.status})`)
        }
        return response.json()
      })
      .then((json) => setData(json))
      .catch((err) => setError(err.message))
  }, [])

  return (
    <main>
      <header>
        <h1>Hawks Tracker</h1>
        <p>Atlanta Hawks {data?.season ?? '2025–26'} season dashboard</p>
      </header>
      <section>
        {error && <p>Error: {error}</p>}
        {!error && !data && <p>Loading…</p>}
        {data && <PlayerStatsTable players={data.players} />}
      </section>
    </main>
  )
}

export default App
