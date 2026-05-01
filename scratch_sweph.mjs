import SwissEPH from 'sweph-wasm';

async function test() {
  try {
    const swe = await SwissEPH.init();
    console.log("Initialized.");
    
    const jd = swe.swe_julday(2026, 5, 1, 12.0, 1);
    console.log("Julian Day:", jd);
    
    // Sun position
    const pos = swe.swe_calc_ut(jd, 0, 0); 
    console.log("Sun position:", pos);
  } catch (err) {
    console.error(err);
  }
}

test();
