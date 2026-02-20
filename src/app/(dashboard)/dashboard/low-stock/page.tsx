import { getLowStockItems } from "@/lib/queries";

export default async function LowStockPage() {
  const items = await getLowStockItems();

  return (
    <section className="card stack">
      <h1 style={{ margin: 0 }}>Low Stock Items ({items.length})</h1>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Current Stock</th>
              <th>Threshold</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.sku}</td>
                <td>{item.name}</td>
                <td className={item.current_stock < 0 ? "danger" : ""}>
                  {item.current_stock}
                </td>
                <td>{item.threshold}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="muted" colSpan={4}>
                  No low stock products.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
