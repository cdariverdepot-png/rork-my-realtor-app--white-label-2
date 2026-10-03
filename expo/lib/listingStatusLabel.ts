import type { ManagedListing } from "@/contexts/ListingsContext";

export function listingStatusLabel(item: Pick<ManagedListing, "status" | "tag" | "sourceUrl" | "sourceArchived">) {
  if (item.sourceArchived) return "Archived";
  if (item.status) return { active: "Active", pending: "Pending", contingent: "Contingent", sold: "Sold", off_market: "Off market" }[item.status];
  return item.sourceUrl ? "Status unconfirmed" : item.tag || "Listing";
}
