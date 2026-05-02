import codecs

file_path = "src/components/MagneticMapInner.tsx"
with codecs.open(file_path, "r", "utf-8") as f:
    content = f.read()

# Update MapInnerProps
content = content.replace(
    "hudLayers?: { terrain: boolean; weather: boolean; bio: boolean };",
    "hudLayers?: { terrain: boolean; weather: boolean; bio: boolean; hazard?: boolean };"
)

# Update function signature
content = content.replace(
    "hudLayers = { terrain: true, weather: true, bio: true },",
    "hudLayers = { terrain: true, weather: true, bio: true, hazard: false },"
)

# Add mock hazard layer logic
# We'll inject it before attenuationRings

hazard_logic = """
  // 4. Mock Hazard Layer (Phase 2 GIS Integration)
  const hazardLayer = React.useMemo(() => {
    if (!hudLayers.hazard) return null;
    
    // Create some mock hazard zones (e.g., fault lines, flood zones) around the center
    return (
      <React.Fragment>
        {/* Mock Fault Line */}
        <Polyline 
           positions={[
             getDestination(lat, lon, 45, 100),
             getDestination(lat, lon, 225, 100)
           ]} 
           color="#ef4444" 
           weight={4} 
           dashArray="10,10" 
           opacity={0.8}
        />
        <Marker 
          position={getDestination(lat, lon, 45, 100)} 
          icon={L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="color: #ef4444; background: rgba(0,0,0,0.5); padding: 2px; text-shadow: 0 0 4px black; font-weight: bold; font-family: monospace; font-size: 10px;">[HZD] Fault Line (GIS)</div>`,
            iconSize: [120, 20],
            iconAnchor: [0, 10]
          })}
          interactive={false}
        />
        
        {/* Mock Flood / Sinkhole Zone */}
        <Circle 
          center={getDestination(lat, lon, 135, 50)}
          radius={20000} // 20km
          pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.2, weight: 2, dashArray: '5,5' }}
        >
            <Tooltip className="custom-map-tooltip">
               <div className="bg-zinc-950 text-red-400 p-2 font-mono text-[10px] border border-red-900 shadow-xl max-w-[200px]">
                  [HAZARD ALERT]<br />
                  Seismic Activity / Landslide Risk Area<br />
                  (Mock GIS Data)
               </div>
            </Tooltip>
        </Circle>
      </React.Fragment>
    );
  }, [hudLayers.hazard, lat, lon]);

  // Concentric Rings for Shield Attenuation Theory (in meters)
"""

content = content.replace(
    "// Concentric Rings for Shield Attenuation Theory (in meters)",
    hazard_logic.strip()
)

# Now inject {hazardLayer} into MapContainer
# After dangerLayer

render_logic = """
        {/* Draw Danger Zones (Red) at Boundaries */}
        {dangerLayer}

        {/* Draw Hazard / GIS Overlay if enabled */}
        {hazardLayer}

        {/* Concentric Distance Rings for Attenuation */}
"""

content = content.replace(
    """        {/* Draw Danger Zones (Red) at Boundaries */}
        {dangerLayer}

        {/* Concentric Distance Rings for Attenuation */}""",
    render_logic.strip()
)

# Replace the specific lines inside MapContainer if the above fail due to spacing
# Let's do it with split and join to be safe

lines = content.split('\n')
for i, line in enumerate(lines):
    if "{dangerLayer}" in line:
        # Check if next lines contain Concentric
        for j in range(i+1, min(i+5, len(lines))):
            if "{/* Concentric Distance Rings for Attenuation */}" in lines[j]:
                # Inject here
                if "{hazardLayer}" not in "".join(lines[i:j+1]):
                    lines.insert(j, "        {/* Draw Hazard / GIS Overlay if enabled */}")
                    lines.insert(j+1, "        {hazardLayer}")
                    lines.insert(j+2, "")
                break
        break

content = '\n'.join(lines)

with codecs.open(file_path, "w", "utf-8") as f:
    f.write(content)
