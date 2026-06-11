import { describe, it, expect } from "vitest";
import { generateMagneticMapKML } from "../src/utils/kmlExport";

describe("KML Export Validation and Inconsistency Tests", () => {
  const sampleLat = 35.6586;
  const sampleLon = 139.7454;
  const sampleDeclination = -7.5;
  const sampleVectors = {
    N: "NOISE_GOU",
    NE: "OPTIMAL",
    E: "SAFE",
    SE: "NOISE_HONMEI",
    S: "NOISE_ANKEN",
    SW: "NOISE_VOID",
    W: "NOISE_NODE",
    NW: "OPTIMAL_REGULAR",
  };

  it("should generate valid KML metadata and Document structure", () => {
    const kml = generateMagneticMapKML(
      sampleLat,
      sampleLon,
      sampleDeclination,
      false,
      sampleVectors,
    );

    expect(kml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain("<Document>");
    expect(kml).toContain("<name>Bio-Magnetic Spatial System</name>");
    expect(kml).toContain("<name>Origin</name>");
  });

  it("should adjust sector labels and folder structure based on nodeMapping mode", () => {
    // 1. Traditional Mode (30/60 Degree split)
    const kmlTraditional = generateMagneticMapKML(
      sampleLat,
      sampleLon,
      sampleDeclination,
      false,
      sampleVectors,
      "traditional",
    );
    expect(kmlTraditional).toContain("Evaluated Sectors (30/60 Degree)");

    // 2. Physical Mode (Equal 45 Degree split)
    const kmlPhysical = generateMagneticMapKML(
      sampleLat,
      sampleLon,
      sampleDeclination,
      false,
      sampleVectors,
      "physical",
    );
    expect(kmlPhysical).toContain("Evaluated Sectors (45 Degree)");
  });

  it("should filter noise sectors to SAFE if the corresponding HUD layer is disabled", () => {
    // When bio HUD is disabled, NOISE_HONMEI (SE sector) should be filtered to SAFE
    const hudLayers = {
      terrain: true,
      weather: true,
      bio: false, // Bio (Honmei/Teki) disabled
      hazard: false,
    };

    const kml = generateMagneticMapKML(
      sampleLat,
      sampleLon,
      sampleDeclination,
      false,
      sampleVectors,
      "traditional",
      hudLayers,
    );

    // SE has NOISE_HONMEI. Since bio is false, it should become Sector SE (SAFE)
    expect(kml).toContain("Sector SE (SAFE)");
    // N has NOISE_GOU. Since terrain/weather are true, it should remain NOISE_GOU
    expect(kml).toContain("Sector N (NOISE_GOU)");
  });

  it("should generate Japanese text labels in KML for active noise and optimal directions", () => {
    const kml = generateMagneticMapKML(
      sampleLat,
      sampleLon,
      sampleDeclination,
      false,
      sampleVectors,
    );

    // Check for specific labels in Sector Status Labels folder
    expect(kml).toContain("<name>五黄</name>");
    expect(kml).toContain("<name>大吉</name>");
    expect(kml).toContain("<name>本命</name>");
    expect(kml).toContain("<name>暗剣</name>");
    expect(kml).toContain("<name>ボイド</name>");
    expect(kml).toContain("<name>交点</name>");
    expect(kml).toContain("<name>吉</name>");

    // SAFE directions shouldn't have status labels to avoid clutter
    expect(kml).not.toContain("<name>平穏</name>");
  });

  it("should export the correct attenuation rings to match Leaflet map", () => {
    const kml = generateMagneticMapKML(
      sampleLat,
      sampleLon,
      sampleDeclination,
      false,
      sampleVectors,
    );

    // Should contain rings at 250km, 500km, and 1000km (and not the old 100km, 2500km, or 5000km)
    expect(kml).toContain("<name>Attenuation Ring (250km)</name>");
    expect(kml).toContain("<name>Attenuation Ring (500km)</name>");
    expect(kml).toContain("<name>Attenuation Ring (1000km)</name>");
    expect(kml).not.toContain("<name>Attenuation Ring (100km)</name>");
    expect(kml).not.toContain("<name>Attenuation Ring (2500km)</name>");
    expect(kml).not.toContain("<name>Attenuation Ring (5000km)</name>");
  });

  it("should contain boundary danger zones (wedges)", () => {
    const kml = generateMagneticMapKML(
      sampleLat,
      sampleLon,
      sampleDeclination,
      false,
      sampleVectors,
    );

    expect(kml).toContain("<name>Boundary Danger Zones (Red Wedges)</name>");
    expect(kml).toContain("<name>Boundary Danger Zone 1</name>");
    expect(kml).toContain("<name>Boundary Danger Zone 8</name>");
  });

  it("should correctly output WARNING status with orange style and 注意 label", () => {
    const warningVectors = {
      N: "WARNING",
      NE: "SAFE",
      E: "SAFE",
      SE: "SAFE",
      S: "SAFE",
      SW: "SAFE",
      W: "SAFE",
      NW: "SAFE",
    };
    const kml = generateMagneticMapKML(
      sampleLat,
      sampleLon,
      sampleDeclination,
      false,
      warningVectors,
    );
    expect(kml).toContain("<styleUrl>#style_WARNING</styleUrl>");
    expect(kml).toContain("<name>注意</name>");
    expect(kml).toContain("<styleUrl>#label_WARNING</styleUrl>");
  });
});
