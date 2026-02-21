export default function DashboardLoading() {
  return (
    <div className="page">
      <section className="page-head">
        <div style={{ display: "grid", gap: 8 }}>
          <div className="skel skel-text w-third" />
          <div className="skel skel-text w-two-thirds" />
        </div>
        <div className="skel skel-btn" />
      </section>

      <section className="metric-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card skel skel-kpi" />
        ))}
      </section>

      <section className="card stack">
        <div className="page-head">
          <div style={{ display: "grid", gap: 8 }}>
            <div className="skel skel-text w-half" />
            <div className="skel skel-text w-third" />
          </div>
          <div className="skel skel-btn" />
        </div>
        <div className="table-wrap">
          <table>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={4}>
                    <div className="skel skel-row" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
