/**
 * Run the native iOS restore/sync phase without querying purchases.
 *
 * Both native implementations promise an authoritative boolean. A rejection
 * or false result must reach the caller so restore cannot report success from
 * a subsequent empty purchase query.
 */
export declare const restorePurchasesIOSNative: () => Promise<void>;
//# sourceMappingURL=restorePurchases.d.ts.map