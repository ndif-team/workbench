export interface Token {
  // Index of the token in the prompt
  idx: number;
  id: number;
  text: string;
  targetIds: number[];
}

export interface TokenOption {
  value: number; // token id
  text: string; // token text
  prob?: number; // probability
}

export interface Prediction {
  // Index of the token in the prompt
  idx: number;
  ids: number[];
  probs: number[];
  texts: string[];
}

export interface Model {
  name: string;
  type: "chat" | "base";
  n_layers: number;
  params: string;
  gated: boolean;
  allowed: boolean;
}
