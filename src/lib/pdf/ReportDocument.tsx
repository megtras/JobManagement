import {
  Document, Page, Text, View, Image, StyleSheet,
} from "@react-pdf/renderer";
import { GEN_LOGO_DATA_URI } from "./gen-logo-data";

const styles = StyleSheet.create({
  page:    { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: "#1a1a1a" },
  header:  { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  logo:    { width: 130, height: 45, marginBottom: 6 },
  title:   { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#1e3a8a" },
  sub:     { fontSize: 10, color: "#666", marginTop: 2 },
  companyAddr:  { fontSize: 9, color: "#555", marginTop: 2, lineHeight: 1.3 },
  companyPhone: { fontSize: 9, color: "#555", marginTop: 6 },
  section: { marginBottom: 16 },
  signatureSection: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1e3a8a", marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 },
  row:     { flexDirection: "row", marginBottom: 4 },
  label:   { width: 130, color: "#666" },
  value:   { flex: 1, fontFamily: "Helvetica-Bold" },
  badge:   { backgroundColor: "#dbeafe", color: "#1e3a8a", padding: "2 8", borderRadius: 4, fontSize: 9 },
  sigBox:  { width: 200, height: 80, border: "1px solid #d1d5db", borderRadius: 4, overflow: "hidden" },
  assetBlock: { marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #f0f0f0" },
  assetNo:    { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1a1a1a", marginBottom: 5 },
  fieldRow:   { flexDirection: "row", marginBottom: 4 },
  fieldLabel: { width: 120, color: "#666", fontSize: 9 },
  fieldValue: { flex: 1, fontSize: 10, color: "#1a1a1a" },
  photoRow:   { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoCell:  { alignItems: "center", width: 80 },
  photoCaption: { fontSize: 8, color: "#666", marginTop: 3, textAlign: "center", lineHeight: 1.2 },
  photo:    { width: 80, height: 80, borderRadius: 4, border: "1px solid #e5e7eb", objectFit: "cover" },
  footer:  { position: "absolute", bottom: 30, left: 40, right: 40, borderTop: "1px solid #e5e7eb", paddingTop: 8, fontSize: 9, color: "#9ca3af", flexDirection: "row", justifyContent: "space-between" },
});

interface Asset {
  label: string;
  acType?: string | null;
  jobCategoryName?: string | null;
  unitPrice?: number | string | null;
  billingType?: "CHARGEABLE" | "WARRANTY" | null;
  remarks?: string | null;
  technicianRemark?: string | null;
  additionalAddress?: string | null;
  propertyType?: string | null;
  photos?: { src: string; label: string }[];
  workLocationAddress?: string | null;
}

interface Props {
  reportDate: string;
  technicianName: string;
  technicianSignature: string; // base64 data URL
  clientName: string;
  clientSignature: string;    // base64 data URL
  jobCategory: string;
  locationAddress: string;
  appointmentDate: string;
  appointmentTime: string;
  assets: Asset[];
  billingType: "CHARGEABLE" | "WARRANTY";
  warrantyNote?: string | null;
  totalPrice: number;
}

export function ReportDocument(props: Props) {
  const {
    reportDate, technicianName, technicianSignature,
    clientName, clientSignature,
    jobCategory, locationAddress, appointmentDate, appointmentTime,
    assets, billingType, warrantyNote, totalPrice,
  } = props;
  const isWarranty = billingType === "WARRANTY";
  const isFullyFoc = totalPrice <= 0;

  function assetBillingLabel(asset: Asset) {
    if (asset.billingType === "WARRANTY") return "FOC (Warranty)";
    const price = Number(asset.unitPrice) || 0;
    return `RM ${price.toFixed(2)}`;
  }

  return (
    <Document title="Service Report — GenPlus Aircond">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Image src={GEN_LOGO_DATA_URI} style={styles.logo} />
            <Text style={styles.title}>GenPlus Aircond</Text>
            <Text style={[styles.companyAddr, { marginTop: 4 }]}>Blok J-03-02, Dataran Glomac,</Text>
            <Text style={styles.companyAddr}>Jalan SS6/18, Ss 6,</Text>
            <Text style={styles.companyAddr}>47301 Petaling Jaya, Selangor</Text>
            <Text style={styles.companyPhone}>012-2579290</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>SERVICE REPORT</Text>
            <Text style={styles.sub}>Date: {reportDate}</Text>
          </View>
        </View>

        {/* Service details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service Details</Text>
          {[
            ["Job Category",  jobCategory],
            ["Date",          `${appointmentDate} at ${appointmentTime}`],
            ["Location",      locationAddress],
            ["Technician",    technicianName],
          ].map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Assets — each unit followed by the technician's evidence photos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assets Serviced ({assets.length})</Text>
          {assets.map((a, i) => {
            const assetType = `${a.acType ? `${a.acType}: ` : ""}${a.label}`.trim() || "-";
            const address = a.workLocationAddress || a.additionalAddress || "";
            const propertyType = `${a.propertyType || "-"}${address ? `, ${address}` : ""}`;
            return (
              <View key={i} style={styles.assetBlock} minPresenceAhead={120}>
                <Text style={styles.assetNo}>{i + 1}.</Text>

                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Asset Type</Text>
                  <Text style={styles.fieldValue}>{assetType}</Text>
                </View>
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Job Category</Text>
                  <Text style={styles.fieldValue}>{a.jobCategoryName || jobCategory || "-"}</Text>
                </View>
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Billing</Text>
                  <Text style={styles.fieldValue}>{assetBillingLabel(a)}</Text>
                </View>
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Remark</Text>
                  <Text style={styles.fieldValue}>{a.remarks || "-"}</Text>
                </View>
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Property Type</Text>
                  <Text style={styles.fieldValue}>{propertyType}</Text>
                </View>

                <View style={[styles.fieldRow, { marginTop: 16, marginBottom: 16 }]}>
                  <Text style={styles.fieldLabel}>Work Progress Photos</Text>
                  <View style={styles.fieldValue}>
                    {a.photos && a.photos.length > 0 ? (
                      <View style={styles.photoRow}>
                        {a.photos.map((photo, j) => (
                          <View key={j} style={styles.photoCell}>
                            <Image src={photo.src} style={styles.photo} />
                            <Text style={styles.photoCaption}>{photo.label || `Photo ${j + 1}`}</Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text>-</Text>
                    )}
                  </View>
                </View>

                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Technician Remark</Text>
                  <Text style={styles.fieldValue}>{a.technicianRemark || "-"}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Total */}
        <View style={{ ...styles.section, flexDirection: "row", justifyContent: "flex-end" }}>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: "#1e3a8a" }}>
              {isFullyFoc ? "Total: FOC" : `Total Chargeable: RM ${totalPrice.toFixed(2)}`}
            </Text>
            {isFullyFoc && (
              <Text style={{ marginTop: 4, fontSize: 9, color: "#047857" }}>
                {isWarranty ? "No payment required. This service is covered under warranty." : "No payment required for this service."}
              </Text>
            )}
            {isWarranty && warrantyNote && (
              <Text style={{ marginTop: 2, fontSize: 9, color: "#555" }}>{warrantyNote}</Text>
            )}
          </View>
        </View>

        {/* Signatures */}
        <View style={styles.signatureSection} wrap={false}>
          <Text style={styles.sectionTitle}>Signatures</Text>
          <View style={{ flexDirection: "row", gap: 40 }}>
            <View>
              <Text style={{ marginBottom: 6, color: "#666" }}>Technician</Text>
              <View style={styles.sigBox}>
                {technicianSignature && <Image src={technicianSignature} style={{ width: "100%", height: "100%" }} />}
              </View>
              <Text style={{ marginTop: 6, fontFamily: "Helvetica-Bold" }}>{technicianName}</Text>
            </View>
            <View>
              <Text style={{ marginBottom: 6, color: "#666" }}>Client</Text>
              <View style={styles.sigBox}>
                {clientSignature && <Image src={clientSignature} style={{ width: "100%", height: "100%" }} />}
              </View>
              <Text style={{ marginTop: 6, fontFamily: "Helvetica-Bold" }}>{clientName}</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>GenPlus Aircond — Local Demo</Text>
          <Text>Generated: {reportDate}</Text>
        </View>
      </Page>
    </Document>
  );
}
