// Web Worker: solves one year's map layout off the main thread, so the Time
// Machine can preview every year without the page stuttering. It runs the very
// same solver as the live map (map-core's `solveLayout`), so with a seed the
// answer is identical to what the map shows for that year.
import { solveLayout, type SolveLayoutOptions } from "@media-map/map-core/solve";

type Request = { id: number; spec: SolveLayoutOptions };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage: (msg: unknown, transfer: Transferable[]) => void;
};

ctx.onmessage = (e) => {
  const { id, spec } = e.data;
  const nodes = solveLayout(spec);
  // x, y, r per planet, in the order of `spec.inputs`.
  const out = new Float64Array(nodes.length * 3);
  nodes.forEach((n, i) => {
    out[i * 3] = n.x;
    out[i * 3 + 1] = n.y;
    out[i * 3 + 2] = n.r;
  });
  ctx.postMessage({ id, out }, [out.buffer]);
};
