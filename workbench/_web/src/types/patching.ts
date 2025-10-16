interface Point {
  x: number;
  y: number;
  tokenIndices: number[]; // Array of token indices in the group
  counterIndex: number; // 0 for first counter, 1 for second counter
}

export interface Connection {
  start: Point;
  end: Point;
}

type Edit = Connection;

export interface PatchingConfig {
  edits: Edit[];
  model: string;
  source: string;
  destination: string;
  submodule: "attn" | "mlp" | "blocks" | "heads";
  correctId: number;
  incorrectId: number | undefined;
  patchTokens: boolean;
}
