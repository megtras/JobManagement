import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PhotonReverseFeature = {
  properties?: {
    name?: string;
    street?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
};

function isValidCoordinate(lat: number, lng: number) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function formatAddress(props: NonNullable<PhotonReverseFeature["properties"]>) {
  return [props.name, props.street, props.city, props.county, props.state, props.postcode, props.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .filter((part, index, parts) => index === 0 || part?.toLowerCase() !== parts[index - 1]?.toLowerCase())
    .join(", ");
}

async function reverseGeocode(lat: number, lng: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lng), limit: "1", lang: "en" });
    const res = await fetch(`https://photon.komoot.io/reverse?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return { area: null, address: null };
    const data = await res.json();
    const feature = data?.features?.[0] as PhotonReverseFeature | undefined;
    const props = feature?.properties;
    if (!props) return { area: null, address: null };

    return {
      area: (props.city || props.county || props.district || props.state || props.name || "").trim() || null,
      address: formatAddress(props) || null,
    };
  } catch {
    return { area: null, address: null };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!isValidCoordinate(lat, lng)) {
    return NextResponse.json({ error: "Invalid location." }, { status: 400 });
  }

  const { area, address } = await reverseGeocode(lat, lng);
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      lastLocationLat: lat,
      lastLocationLng: lng,
      lastLocationArea: area,
      lastLocationAddress: address,
      lastLocationAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, area, address });
}
