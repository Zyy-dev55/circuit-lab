'use strict';
/* 测试夹具：用最小 DOM 桩直接加载单文件 index.html 里的 <script>，
   把仿真引擎的符号导出成 API，再包一层常用操作 helper。
   这样回归测试跑的是真实产品代码，不是复制出来的模型。 */

const fs = require('fs');
const path = require('path');

function createHarness() {
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error('index.html 中未找到 <script> 块');

  const elem = () => ({
    addEventListener() {}, style: {}, dataset: {},
    classList: { toggle() {}, add() {}, remove() {} },
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
    getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
    textContent: '', innerHTML: '', value: '', width: 0, height: 0,
    click() {}, files: []
  });

  global.window = { addEventListener() {} };
  global.performance = { now: () => 0 };
  global.requestAnimationFrame = () => {};
  global.setInterval = () => {};
  global.alert = () => {};
  global.document = {
    querySelector: elem,
    querySelectorAll: () => [],
    createElement: elem
  };

  const factory = new Function(m[1] + '\n;return {' +
    'state,DEFS,PROJECTS,PROJ_STORE,runSim,solve,diagnose,layeredDiagnosis,' +
    'loadProject,loadCustom,compById,wirePhases,snapshot,renderLayers,' +
    'circuitJSON,applyCircuit,fileStamp};');
  const api = factory();

  const need = (id) => {
    const c = api.compById(id);
    if (!c) throw new Error('元件不存在: ' + id);
    return c;
  };

  const H = Object.assign({}, api, {
    /* 项目 */
    load: k => api.loadProject(k),
    reset: () => api.loadProject(api.state.project),

    /* 元件操作 */
    press(id) { need(id).props._press = true; api.runSim(); },
    release(id) { need(id).props._press = false; api.runSim(); },
    start(id) { this.press(id); this.release(id); },
    set(id, prop, v) { need(id).props[prop] = v; api.runSim(); },
    setQuiet(id, prop, v) { need(id).props[prop] = v; },
    props(id) { return need(id).props; },

    /* 读数 */
    phase(cid, p) { return api.wirePhases({ a: { c: cid, p } }, api.state.res); },
    lamp(id) { return !!(api.state.res.loadOn[id + ':lamp'] || {}).on; },
    socket(id) { return !!(api.state.res.loadOn[id + ':load'] || {}).on; },
    coil(id) { return !!api.state.res.coilOn[id]; },
    motor() { return api.state.res.motor ? api.state.res.motor.state : null; },
    motorSeq() { return api.state.res.motor ? api.state.res.motor.seq : ''; },
    shorts() { return api.state.res.shorted.length; },
    diagText() { return api.diagnose().map(x => x.tx).join('\n'); },
    diagHas(needle, lv) {
      return api.diagnose().some(x => (!lv || x.lv === lv) && x.tx.indexOf(needle) >= 0);
    },

    /* 分层排障 */
    layers() { return api.layeredDiagnosis(); },
    firstFault() { return api.layeredDiagnosis().firstFault; },
    layerStatus(id) {
      const l = api.layeredDiagnosis().layers.find(x => x.id === id);
      return l ? l.status : null;
    },
    layerIds() { return api.layeredDiagnosis().layers.map(x => x.id); },
    layerPoints(id) {
      const l = api.layeredDiagnosis().layers.find(x => x.id === id);
      return l ? l.points : [];
    },

    /* 导线操作 */
    removeWire(pred) {
      const w = api.state.wires.find(pred);
      if (w) { api.state.wires = api.state.wires.filter(x => x !== w); api.runSim(); }
      return w;
    },
    removeWires(pred) {
      const gone = api.state.wires.filter(pred);
      api.state.wires = api.state.wires.filter(x => gone.indexOf(x) < 0);
      api.runSim();
      return gone;
    },
    wire(id) { return api.state.wires.find(w => w.id === id); }
  });

  return H;
}

module.exports = { createHarness };
