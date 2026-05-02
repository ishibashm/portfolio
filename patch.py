import codecs

file_path = "src/components/TacticalMagneticMap.tsx"
with codecs.open(file_path, "r", "utf-8") as f:
    content = f.read()

target = "                    </button>\r\n                  </div>"
replacement = """                    </button>
                    <button 
                      onClick={() => toggleLayer?.('hazard')}
                      className={`px-1.5 py-0.5 text-[9px] font-mono transition-colors border-l border-zinc-800 ${hudLayers.hazard ? 'text-red-500 bg-red-500/10 font-bold' : 'text-zinc-600'}`}
                      title="HZD (ハザードマップ・外部GIS連携)"
                    >
                      HZD [災害域]
                    </button>
                  </div>""".replace("\n", "\r\n")

content = content.replace(target, replacement)

with codecs.open(file_path, "w", "utf-8") as f:
    f.write(content)
