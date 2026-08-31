export declare function boundedInterval(value: unknown, fallback: number, minimum: number, maximum: number): number;
export declare function browserBridgeIntervals(env?: Record<string, unknown>): {
  pollMs: number;
  mentionObserveMs: number;
  discoveryObserveMs: number;
};
