import type { ManagedListing } from "@/contexts/ListingsContext";

export function listingStatusLabel(item: Pick<ManagedListing, "status" | "tag" | "sourceUrl" | "sourceArchived">) {
  if (item.sourceArchived) return "Archived";
  if (item.status) return { active: "Active", pending: "Pending", contingent: "Contingent", sold: "Sold", off_market: "Off market" }[item.status];
  // A source that did not publish a status gets no status claim; the listings manager explains why
  // separately ("status not provided by source"). Clients never see an internal sync state.
  return item.tag || "Listing";
}
