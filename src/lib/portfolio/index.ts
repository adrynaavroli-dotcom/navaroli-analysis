/**
 * Portfolio optimization engine — POR-001 (Global Minimum Variance).
 * Consumes aligned return panels from the Returns Engine and covariance
 * estimates from the Correlation Engine; never fetches or transforms data itself.
 */
export * from './min-variance';
export * from './metrics';
export * from './walkforward';
