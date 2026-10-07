/**
 * Debug logger for Expo IAP. log/debug/info print only when EXPO_IAP_DEV_MODE
 * is set for library development, so apps stay silent even in dev mode;
 * warn and error always print.
 */
export declare const ExpoIapConsole: {
    log: (...args: any[]) => void;
    debug: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
    info: (...args: any[]) => void;
};
//# sourceMappingURL=debug.d.ts.map