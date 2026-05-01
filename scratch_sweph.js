const sweph = require('sweph-wasm');

async function test() {
  // sweph-wasm might need to be initialized if it's wasm
  console.log(Object.keys(sweph));
}

test();
