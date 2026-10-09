/**
 * The title a client reads on a listing card. Some IDX providers publish the full postal address as the title
 * ("41723 O Road, Paonia, Colorado CO 81428") while the city is also shown on the line beneath it ("Paonia, CO").
 * When everything after the street line is only that city, the state and the ZIP code, the card shows the street
 * line alone. Any other title, including a unit or building name after the street, is shown exactly as published.
 */
const STATES = "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|district of columbia|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming";
const STATE_NAMES = new RegExp(`\\b(?:${STATES})\\b`, "g");

export function listingDisplayTitle(item: { title: string; neighborhood?: string }): string {
  const title = (item.title ?? "").trim();
  const comma = title.indexOf(",");
  const city = (item.neighborhood ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (comma < 1 || !city) return title;
  const street = title.slice(0, comma).trim();
  // Only a street address (it starts with a house number) is shortened.
  if (!/^\d/.test(street)) return title;
  const rest = title.slice(comma + 1).toLowerCase();
  if (!rest.includes(city)) return title;
  const leftover = rest.split(city).join(" ")
    .replace(STATE_NAMES, " ")
    .replace(/\b[a-z]{2}\b/g, " ")       // state abbreviation
    .replace(/\b\d{5}(?:-\d{4})?\b/g, " ") // ZIP code
    .replace(/[\s,.]+/g, "");
  return leftover ? title : street;
}
