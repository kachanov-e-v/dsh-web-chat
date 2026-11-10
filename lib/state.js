/** Shared Host state for the DeepSeek browser model. */
export function createState() {
  return {
    sessions: new Map(),
    browserProviders: {},
  };
}
