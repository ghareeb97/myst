export default function InvoicesLoading() {
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

      <section className="card stack">
        <div className="skel skel-text w-half" />
        <div className="table-wrap">
          <table>
            <tbody>
              {Array.from({ length: 9 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={9}>
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
