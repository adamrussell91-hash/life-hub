// Median A$ per protocol and mode, from the usage logged on completed runs.
import { medianCosts } from '../../../packages/protocol-view/cost.mjs';

export async function protocolCostMedians(store, owner) {
  const rows = await store.list(owner, 5000, 0);
  return medianCosts(rows.map(({ value }) => value));
}
