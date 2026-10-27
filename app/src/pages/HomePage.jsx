// HomePage — the default landing page at `/`.
//
// Phase 1 of the Home page build (Oct 27, 2026): skeleton only, confirms
// the route works and the clickable title lands here. Phase 2 will move
// Team Stats content in. Phase 5 adds the point-differential chart.
//
// Layout uses CSS grid with `auto-fit` so adding a third or fourth block
// later just drops in without rewriting the layout rule — see §Phase 6.
export default function HomePage({ hawks, teamData }) {
  return (
    <div className="home-page" style={{ padding: '1rem 0' }}>
      <h2 style={{ marginTop: 0 }}>Home</h2>
      <p style={{ opacity: 0.7 }}>
        Phase 1 skeleton — routing is wired. Team Stats and the point-differential
        chart arrive in the next phases.
      </p>
    </div>
  )
}
