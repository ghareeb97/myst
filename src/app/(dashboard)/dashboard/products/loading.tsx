export default function ProductsLoading() {
  return (
    <div className="page">
      <section className="page-head">
        <div style={{ display: "grid", gap: 8 }}>
          <div className="skel skel-text w-third" />
          <div className="skel skel-text w-two-thirds" />
        </div>
        <div className="skel skel-btn" />
      </section>

      <section className="card stack">
        <div className="skel skel-text w-half" />
        <div style={{ display: "flex", gap: 8 }}>
          <div className="skel skel-row" style={{ flex: 1 }} />
          <div className="skel skel-btn" />
        </div>
      </section>

      <section className="card table-wrap">
        <table>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                <td colSpan={6}>
                  <div className="skel skel-row" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
