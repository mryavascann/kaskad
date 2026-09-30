import { act, fireEvent } from "@testing-library/react";

/**
 * Opens every chart data table (`DataTable` mounts its rows on the first `toggle` of its `<details>`).
 * Sets `open` and dispatches `toggle` directly: jsdom queues the native event asynchronously.
 */
export function openDataTables(root: ParentNode = document) {
  root.querySelectorAll<HTMLDetailsElement>('details[data-slot="data-table"]').forEach((d) => {
    act(() => {
      d.open = true;
      fireEvent(d, new Event("toggle"));
    });
  });
}
