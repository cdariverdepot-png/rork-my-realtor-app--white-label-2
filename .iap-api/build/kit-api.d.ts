export type KitApiOptions = {
    apiKey: string;
    baseUrl?: string;
    fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
    /** Optional AsyncStorage-compatible persistent cache for direct client
     * payload reads. Cache failures never change a successful API result. */
    clientPayloadCache?: KitClientPayloadCache;
};
export type KitClientPayloadCache = {
    getItem: (key: string) => Promise<string | null> | string | null;
    setItem: (key: string, value: string) => Promise<void> | void;
    removeItem?: (key: string) => Promise<void> | void;
};
export type KitClientPayloadOptions = {
    /** Revalidate a cached payload with its scoped ETag. Without this flag,
     * a valid persistent entry is returned without a network request. */
    refresh?: boolean;
};
export type KitSubscription = {
    id: string;
    productId: string;
    platform: "IOS" | "Android";
    state: "Active" | "InGracePeriod" | "InBillingRetry" | "Expired" | "Revoked" | "Refunded" | "Paused" | "Unknown";
    expiresAt?: number;
    renewsAt?: number;
    willRenew?: boolean;
    cancellationReason?: string;
    currency?: string;
    priceAmountMicros?: number;
    startedAt: number;
    updatedAt: number;
    purchaseToken: string;
    originalTransactionId?: string;
    userId?: string;
};
export type EntitlementsResponse = {
    userId: string;
    productIds: string[];
    subscriptions: KitSubscription[];
};
export type StatusResponse = {
    active: boolean;
    subscription: KitSubscription | null;
};
export type KitProductPlatform = "IOS" | "Android";
export type KitProductClientPayload = {
    /** Current values are toml, json, and text; preserve unknown values. */
    format: string;
    body: string;
    version: number;
    updatedAt: number;
};
export type KitProductOffer = {
    id: string;
    kind: "FreeTrial" | "IntroPayUpFront" | "IntroPayAsYouGo" | "PromotionalOffer" | "BasePlan";
    duration?: string;
    numberOfPeriods?: number;
    priceAmountMicros?: number;
    currency?: string;
};
export type KitProduct = {
    productId: string;
    platform: KitProductPlatform;
    type: "Subscription" | "NonConsumable" | "Consumable";
    title: string;
    description?: string;
    baseLocale?: string;
    localizations?: {
        locale: string;
        title: string;
        description?: string;
    }[];
    regions?: "all" | string[];
    priceAmountMicros?: number;
    currency?: string;
    state: "Draft" | "Ready" | "Active" | "Removed";
    storeRef?: string;
    subscriptionGroupId?: string;
    subscriptionGroupName?: string;
    billingPeriod?: "P1W" | "P1M" | "P2M" | "P3M" | "P6M" | "P1Y";
    offers?: KitProductOffer[];
    updatedAt: number;
    clientPayload?: KitProductClientPayload;
};
export type KitProductsOptions = {
    platform?: KitProductPlatform;
    /** Include public client payload bodies in a bounded platform page. */
    includeClientPayload?: boolean;
    /** Page size for every catalog read (default 25, maximum 50). */
    limit?: number;
    /** Opaque cursor returned as `nextCursor` by the previous page. */
    cursor?: string;
};
export type KitProductsResponse = {
    products: KitProduct[];
    hasMore: boolean;
    /** Present when a catalog page has another page. */
    nextCursor?: string;
};
export type KitSubscriptionsResponse = {
    items: KitSubscription[];
    total: number;
};
export type KitMrrCurrencyEntry = {
    currency: string;
    mrrMicros: number;
};
export type KitMetricsResponse = {
    activeSubs: number;
    inGracePeriod: number;
    inBillingRetry: number;
    refunded30d: number;
    canceled30d: number;
    mrrMicros: number;
    currency: string;
    reportingCurrency: string;
    mrrByCurrency: KitMrrCurrencyEntry[];
    excludedMrrByCurrency: KitMrrCurrencyEntry[];
};
export type KitRevenueMetricsResponse = {
    days: {
        day: string;
        currency: string;
        productId: string;
        platform: KitProductPlatform;
        activeSubs: number;
        newSubs: number;
        renewals: number;
        cancellations: number;
        refunds: number;
        revenueMicros: number;
    }[];
    currencies: string[];
    productIds: string[];
    platforms: KitProductPlatform[];
    truncated: boolean;
};
export type KitProductUpsertResponse = {
    id: string;
    created: boolean;
};
export type KitProductStateResponse = {
    id: string;
    state: KitProduct["state"];
};
export type KitClientPayloadStateResponse = {
    expectedVersion: number;
    clientPayload?: KitProductClientPayload;
};
export type KitSetClientPayloadResponse = {
    id: string;
    created: boolean;
    changed: boolean;
    version: number;
    updatedAt: number;
};
export type KitRemoveClientPayloadResponse = {
    ok: boolean;
};
export type KitProductSyncResponse = {
    jobId: string;
    deduped: boolean;
};
export type KitProductSyncJobResponse = {
    _id: string;
    _creationTime: number;
    projectId: string;
    platform: KitProductPlatform;
    direction: "pull" | "push" | "both" | "purge-local";
    dryRun: boolean;
    status: "queued" | "running" | "succeeded" | "failed";
    progress: {
        phase: string;
        current?: number;
        total?: number;
        failuresCount?: number;
    };
    result?: {
        pulled: number;
        pushed: number;
        deleted?: number;
        failures: {
            productId: string;
            reason: string;
        }[];
        failuresTruncated?: boolean;
        plannedWrites?: {
            productId: string;
            step: string;
            detail?: string;
        }[];
        plannedWritesTruncated?: boolean;
        manualActions?: {
            productId: string;
            code: string;
            message: string;
        }[];
        manualActionsTruncated?: boolean;
    };
    error?: string;
    cancelRequested?: boolean;
    expectedDeadline?: number;
    createdBy?: string;
    startedAt?: number;
    completedAt?: number;
    createdAt: number;
};
export type KitClientPayloadResponse = {
    clientPayload: KitProductClientPayload;
};
export declare class KitApiError extends Error {
    readonly status: number;
    readonly body: unknown;
    constructor(status: number, body: unknown, message: string);
}
export declare function kitApi(options: KitApiOptions): {
    apiKey: string;
    baseUrl: string;
    /** GET /v1/subscriptions/status compatibility read.
     * @deprecated New account reads must authenticate the user on a developer
     * backend and call the secret-only, tokenless `/v2/subscriptions/status`.
     */
    status: (userId: string) => Promise<StatusResponse>;
    /** GET /v1/subscriptions/entitlements compatibility read.
     * @deprecated New account reads must authenticate the user on a developer
     * backend and call the secret-only, tokenless
     * `/v2/subscriptions/entitlements`.
     */
    entitlements: (userId: string) => Promise<EntitlementsResponse>;
    /** GET /v1/products — read the store-synced catalog. Client payloads
     * are excluded unless explicitly requested because they may add up to
     * 16 KiB per product. */
    products: (productOptions?: KitProductsOptions) => Promise<KitProductsResponse>;
    /** GET one public client payload by its store-specific natural key.
     * Payloads are app-facing data; never store secrets in them. */
    clientPayload: (productId: string, platform: KitProductPlatform, payloadOptions?: KitClientPayloadOptions) => Promise<KitClientPayloadResponse>;
    /** POST /v1/subscriptions/bind-user — call after a successful
     * verifyReceipt so kit knows which userId owns the verified
     * `purchaseToken`. Idempotent. */
    bindUser: (purchaseToken: string, userId: string) => Promise<{
        ok: boolean;
        bound: boolean;
    }>;
};
//# sourceMappingURL=kit-api.d.ts.map