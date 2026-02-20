export function resolveLowStockThreshold(input: {
  productThreshold: number | null;
  globalThreshold: number;
}) {
  return input.productThreshold ?? input.globalThreshold;
}

export function isLowStock(input: {
  stock: number;
  productThreshold: number | null;
  globalThreshold: number;
}) {
  const threshold = resolveLowStockThreshold({
    productThreshold: input.productThreshold,
    globalThreshold: input.globalThreshold
  });

  return input.stock <= threshold;
}
