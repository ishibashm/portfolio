const SwissEPH = require("sweph-wasm").default || require("sweph-wasm");

async function test() {
  try {
    const swe = await SwissEPH.init();
    console.log("Initialized.");

    const jd = swe.swe_julday(2026, 5, 1, 12.0, 1);
    console.log("Julian Day:", jd);
  } catch (err) {
    console.error(err);
  }
}

test();
