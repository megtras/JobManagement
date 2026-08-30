export interface WorkLocation {
  id?: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

interface CustomerLocationSource {
  id: string;
  addresses: WorkLocation[];
}

interface AppointmentLocationSource {
  id: string;
  customerId: string;
  locationAddress: string;
  locationLat: number | null;
  locationLng: number | null;
  assets?: Array<{
    id?: string;
    additionalAddress?: string | null;
    workLocationAddress?: string | null;
    workLocationLat?: number | null;
    workLocationLng?: number | null;
  }>;
}

function locationKey(address: string) {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}

export function mergeCustomerWorkLocations(
  customer: CustomerLocationSource,
  appointments: AppointmentLocationSource[]
): WorkLocation[] {
  const byAddress = new Map<string, WorkLocation>();

  function addLocation(location: WorkLocation) {
    const address = location.address.trim();
    if (!address) return;

    const key = locationKey(address);
    if (!byAddress.has(key)) {
      byAddress.set(key, { ...location, address });
    }
  }

  for (const address of customer.addresses) {
    addLocation(address);
  }

  for (const appointment of appointments) {
    if (appointment.customerId !== customer.id) continue;

    addLocation({
      id: `appointment-${appointment.id}`,
      address: appointment.locationAddress,
      lat: appointment.locationLat,
      lng: appointment.locationLng,
    });

    for (const asset of appointment.assets ?? []) {
      const address = asset.workLocationAddress || asset.additionalAddress;
      if (!address) continue;
      addLocation({
        id: asset.id ? `asset-${asset.id}` : undefined,
        address,
        lat: asset.workLocationLat ?? null,
        lng: asset.workLocationLng ?? null,
      });
    }
  }

  return Array.from(byAddress.values());
}
