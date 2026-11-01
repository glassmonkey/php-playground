const fs = require('fs');
const wasmBinary = fs.readFileSync('/tmp/gla96-smoke.wasm');
fs.unlinkSync('/tmp/gla96-smoke.wasm');
require('/tmp/gla96-smoke.js')({ wasmBinary }).then((module) => {
  const status = module._main();
  const value = module._smoke_result();
  console.log(`wasmBinary-provided; longjmp=${value}; main=${status}`);
  process.exit(status === 0 && value === 42 ? 0 : 1);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
