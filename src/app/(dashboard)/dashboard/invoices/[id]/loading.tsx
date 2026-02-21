export default function InvoiceDetailLoading() {
  return (
    <div className="page">
      <section className="card stack">
        <div className="page-head">
          <div style={{ display: "grid", gap: 8 }}>
            <div className="skel skel-text w-two-thirds" />
            <div className="skel skel-text w-half" />
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div className="skel skel-btn" />
            <div className="skel skel-btn" />
          </div>
        </div>
        <div className="summary-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="summary-item" style={{ display: "grid", gap: 6 }}>
              <div className="skel skel-text w-half" />
              <div className="skel skel-text w-two-thirds" />
            </div>
          ))}
        </div>
      </section>

      <section className="card stack">
        <div className="skel skel-text w-third" />
        <div className="table-wrap">
          <table>
            <tbody>
              {Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5}>
                    <div className="skel skel-row" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack">
        <div className="skel skel-text w-third" />
        <div className="summary-grid">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="summary-item" style={{ display: "grid", gap: 6 }}>
              <div className="skel skel-text w-half" />
              <div className="skel skel-text w-two-thirds" />
            </div>
          ))}
        </div>
      </section>

      <div className="card stack">
        <div className="skel skel-text w-third" />
        <div className="skel skel-row" />
        <div className="skel skel-btn" />
      </div>
    </div>
  );
}
