function cleanValue(value?: string | null) {
  return value?.trim() ?? "";
}

export function buildWazeLink(address?: string | null, lat?: number | null, lng?: number | null) {
  const params = new URLSearchParams();
  const cleanedAddress = cleanValue(address);

  if (lat != null && lng != null) {
    params.set("ll", `${lat},${lng}`);
  }

  if (cleanedAddress) {
    params.set("q", cleanedAddress);
  }

  if ([...params.keys()].length === 0) {
    return "";
  }

  params.set("navigate", "yes");
  return `https://waze.com/ul?${params.toString()}`;
}
