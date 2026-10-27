const fs = await import("node:fs");
const endpoint = process.argv[2];
const logPath = "/private/tmp/phpantom-worker-wasm-cdp-watch.log";
fs.writeFileSync(logPath, "");
const log = (...args) => fs.appendFileSync(logPath, args.join(" ") + "\n");
const ws = new WebSocket(endpoint);
let id = 0;
const pending = new Map();
const sessions = new Map();
const seen = new Set();
function send(method, params = {}, sessionId) {
  const commandId = ++id;
  ws.send(JSON.stringify({ id: commandId, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => {
    pending.set(commandId, { resolve, reject, method });
    setTimeout(() => { if (pending.has(commandId)) { pending.delete(commandId); reject(new Error(`timeout ${method}`)); } }, 8000);
  });
}
const instrumentFetch = `(()=>{const original=globalThis.fetch.bind(globalThis);globalThis.fetch=async(...args)=>{const response=await original(...args);const url=String(args[0]?.url||args[0]);if(url.includes("phpantom_lsp.wasm")){const clone=response.clone();void clone.arrayBuffer().then(async buffer=>{const digest=await crypto.subtle.digest("SHA-256",buffer);globalThis.__phpantomWasmLoaded={url,status:response.status,bytes:buffer.byteLength,sha256:Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("")};}).catch(error=>{globalThis.__phpantomWasmLoaded={url,error:String(error)}})}return response};return typeof globalThis.fetch})()`;
async function setupTarget(targetInfo, sessionId, parentSession) {
  if (!targetInfo || !["page", "worker", "shared_worker", "service_worker"].includes(targetInfo.type)) return;
  const key = `${targetInfo.type}:${targetInfo.targetId}`;
  if (seen.has(key)) return;
  seen.add(key);
  if (!sessionId) {
    try { sessionId = (await send("Target.attachToTarget", { targetId: targetInfo.targetId, flatten: true })).sessionId; }
    catch (e) { log("attachfail", key, e.message); return; }
  }
  sessions.set(sessionId, targetInfo);
  log("attached", targetInfo.type, targetInfo.url, sessionId);
  try { await send("Network.enable", {}, sessionId); log("network-enabled", targetInfo.type); } catch (e) { log("netfail", e.message); }
  try { await send("Runtime.enable", {}, sessionId); } catch (e) { log("runtimefail", e.message); }
  if (targetInfo.type === "page") {
    try { await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId); log("recursive-autoattach"); } catch (e) { log("autofail", e.message); }
  } else if (targetInfo.type === "worker" && parentSession) {
    try { const r = await send("Runtime.evaluate", { expression: instrumentFetch, returnByValue: true, awaitPromise: true }, sessionId); log("fetch-instrumented", targetInfo.url, JSON.stringify(r.result)); } catch (e) { log("instrument-fail", targetInfo.url, e.message); }
    try { await send("Runtime.runIfWaitingForDebugger", {}, sessionId); log("resumed", targetInfo.url); } catch (e) { log("resumefail", e.message); }
  }
}
async function getObservedHash(sessionId, targetInfo, response) {
  for (let i=0;i<30;i++) {
    try {
      const r=await send("Runtime.evaluate", { expression:"globalThis.__phpantomWasmLoaded ? JSON.stringify(globalThis.__phpantomWasmLoaded) : null", returnByValue:true }, sessionId);
      if (r.result?.value) {
        const hash=JSON.parse(r.result.value);
        const result={target:targetInfo?.url,responseUrl:response.url,status:response.status,encodedDataLength:response.encodedDataLength,workerFetch:hash};
        fs.writeFileSync("/private/tmp/phpantom-worker-wasm-result.json",JSON.stringify(result,null,2));
        log("result",JSON.stringify(result)); ws.close(); setTimeout(()=>process.exit(0),50); return;
      }
    } catch(e) { log("hash-poll",i,e.message); }
    await new Promise(r=>setTimeout(r,100));
  }
  log("hash-unavailable-after-response",response.url,targetInfo?.url);
}
ws.addEventListener("open", async () => {
  try {
    await send("Target.setDiscoverTargets", { discover: true });
    await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    const targets = await send("Target.getTargets");
    for (const t of targets.targetInfos) await setupTarget(t);
    log("ready", JSON.stringify([...sessions.values()].map(t => ({type:t.type,url:t.url}))));
  } catch (e) { log("setupfail", e.stack); }
  setTimeout(() => { log("timeout-no-wasm"); process.exit(2); }, 90000);
});
ws.addEventListener("message", async event => {
  let msg; try { msg = JSON.parse(event.data); } catch { return; }
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result || {}); return; }
  const sid = msg.sessionId;
  if (msg.method === "Target.attachedToTarget") { await setupTarget(msg.params.targetInfo, msg.params.sessionId, sid); return; }
  if (msg.method === "Network.requestWillBeSent" && /phpantom_lsp\.wasm/.test(msg.params.request.url)) log("request", sid, msg.params.request.url);
  if (msg.method === "Network.responseReceived" && /phpantom_lsp\.wasm/.test(msg.params.response.url)) {
    log("response", sid, JSON.stringify({url:msg.params.response.url,status:msg.params.response.status,mimeType:msg.params.response.mimeType,encodedDataLength:msg.params.response.encodedDataLength,target:sessions.get(sid)?.url}));
    getObservedHash(sid,sessions.get(sid),msg.params.response);
  }
});
ws.addEventListener("error", e => { log("wserror",e.message||e); process.exit(2); });
