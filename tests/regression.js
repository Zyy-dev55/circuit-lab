'use strict';
/* 分层回归测试套件
   L0 冒烟与静态结构 → L1 电源层 → L2 保护配电层 → L3 控制层
   → L4 负载执行层 → L5 布线规范 → L6 项目管理 → L7 分层排障场景
   运行：node test.js  （或 node tests/regression.js） */

const { Assertions } = require('./assert');
const { createHarness } = require('./harness');

const a = new Assertions();
const H = createHarness();

/* ================= L0 冒烟与静态结构 ================= */
a.section('L0 冒烟与静态结构', () => {
  a.ok('引擎加载: state 可用', !!H.state);
  a.ok('引擎加载: DEFS 元件库非空', Object.keys(H.DEFS).length > 20);
  a.count('内置示例项目数量', Object.keys(H.PROJECTS), 6);
  a.ok('分层排障引擎已导出', typeof H.layeredDiagnosis === 'function');
  a.ok('断言库已导出', a instanceof Assertions);

  for (const key of Object.keys(H.PROJECTS)) {
    H.load(key);
    a.ok('L0 ' + key + ' 可加载且含元件/导线', H.state.comps.length > 0 && H.state.wires.length > 0);
    a.equal('L0 ' + key + ' 无短路', H.shorts(), 0);
    let bad = 0;
    for (const w of H.state.wires) {
      const ca = H.compById(w.a.c), cb = H.compById(w.b.c);
      if (!ca || !cb) { bad++; continue; }
      if (!H.DEFS[ca.type].pins.some(p => p.id === w.a.p)) bad++;
      if (!H.DEFS[cb.type].pins.some(p => p.id === w.b.p)) bad++;
    }
    a.equal('L0 ' + key + ' 所有导线端子均存在', bad, 0);
  }

  a.equal('L0 4P 断路器 = 8 个独立端子', H.DEFS.qf3.pins.length, 8);
  a.equal('L0 交流接触器 = 8 个独立端子', H.DEFS.km.pins.length, 8);
  a.equal('L0 热继电器 = 8 个独立端子', H.DEFS.fr.pins.length, 8);
  a.ok('L0 4 段端子排 >= 8 个独立端子', H.DEFS.tb4.pins.length >= 8);
  a.equal('L0 1P 空气开关 = 2 端子', H.DEFS.mcb1p.pins.length, 2);
  a.equal('L0 2P 空气开关 = 4 端子', H.DEFS.mcb2p.pins.length, 4);

  H.load('p1');
  a.deepEqual('L0 分层引擎固定返回 L1-L4 四层', H.layerIds(), ['L1', 'L2', 'L3', 'L4']);
  a.count('L0 每层均带测点', H.layers().layers.filter(l => l.points.length > 0), 4);
});

/* ================= L1 电源与进线层 ================= */
a.section('L1 电源与进线层', () => {
  H.load('p1');
  a.deepEqual('L1 三相电源 L1 相电位', H.phase('src', 'L1'), ['L1']);
  a.deepEqual('L1 三相电源 L2 相电位', H.phase('src', 'L2'), ['L2']);
  a.deepEqual('L1 三相电源 L3 相电位', H.phase('src', 'L3'), ['L3']);
  a.equal('L1 启动时四层正常', H.firstFault(), null);
  H.start('sb1');
  a.equal('L1 启动后电机正转', H.motor(), 'fwd');
  a.equal('L1 运行态仍无故障层', H.firstFault(), null);

  H.load('p3');
  a.deepEqual('L1 单相电源 L 相电位', H.phase('s', 'L'), ['L1']);
  a.deepEqual('L1 单相电源 N 电位', H.phase('s', 'N'), ['N']);
  a.true('L1 单相回路插座通电', H.socket('xs'));
  a.true('L1 电能表计量中', H.state.res.kwhLive);

  H.load('p6');
  a.deepEqual('L1 p6 三相进线 L1', H.phase('s', 'L1'), ['L1']);
  a.deepEqual('L1 p6 三相进线 L2', H.phase('s', 'L2'), ['L2']);
  a.deepEqual('L1 p6 三相进线 L3', H.phase('s', 'L3'), ['L3']);

  // L1 故障：进线全部断开
  H.load('p1');
  const srcWires = H.removeWires(w => w.a.c === 'src' || w.b.c === 'src');
  a.ok('L1 已移除全部进线导线', srcWires.length >= 3);
  a.equal('L1 进线断开 → 定位 L1', H.firstFault(), 'L1');
  a.equal('L1 进线断开 → L1 fault', H.layerStatus('L1'), 'fault');
  a.equal('L1 进线断开 → L2 blocked', H.layerStatus('L2'), 'blocked');
  a.equal('L1 进线断开 → L4 blocked', H.layerStatus('L4'), 'blocked');
  H.state.wires = H.state.wires.concat(srcWires);
  H.runSim();
  a.equal('L1 恢复进线 → 故障清除', H.firstFault(), null);

  // L1 故障：无电源元件
  H.load('p1');
  H.state.comps = H.state.comps.filter(c => c.type !== 'src3');
  H.runSim();
  a.equal('L1 无电源元件 → 定位 L1', H.firstFault(), 'L1');
  a.ok('L1 无电源元件 → 结论文字提示', H.diagText().indexOf('电源') >= 0 || H.layerPoints('L1').some(p => p.value.indexOf('未放置') >= 0));
});

/* ================= L2 保护与配电层 ================= */
a.section('L2 保护与配电层', () => {
  H.load('p1');
  H.set('qf', 'closed', false);
  H.press('sb1');
  a.false('L2 QF 分闸: KM 无法吸合', H.coil('km'));
  a.equal('L2 QF 分闸 → 定位 L2', H.firstFault(), 'L2');
  a.equal('L2 QF 分闸 → L3 blocked', H.layerStatus('L3'), 'blocked');
  a.equal('L2 QF 分闸 → L4 blocked', H.layerStatus('L4'), 'blocked');
  a.ok('L2 QF 分闸: L2 测点含分闸', H.layerPoints('L2').some(p => p.value.indexOf('分闸') >= 0));
  a.true('L2 QF 分闸: 诊断提示断路器未合闸', H.diagHas('QF 断路器未合闸', 'warn'));

  H.load('p1');
  H.set('fu1', 'blownPhase', 1);
  H.press('sb1');
  a.true('L2 FU1 缺相: 控制回路独立, KM 仍吸合', H.coil('km'));
  a.equal('L2 FU1 缺相: 电机报缺相', H.motor(), 'loss');
  a.equal('L2 FU1 缺相 → 定位 L2', H.firstFault(), 'L2');
  a.true('L2 FU1 缺相: 诊断提示缺相', H.diagHas('缺相', 'warn'));

  H.load('p1');
  H.set('fu1', 'blown', true);
  H.press('sb1');
  a.true('L2 FU1 全熔断: 线圈仍得电', H.coil('km'));
  a.equal('L2 FU1 全熔断: 电机停转', H.motor(), 'stop');
  a.true('L2 FU1 全熔断: 诊断指向主回路', H.diagHas('故障在主回路'));

  H.load('p1');
  H.set('fr', 'tripped', true);
  H.press('sb1');
  a.false('L2 FR 动作: KM 不吸合', H.coil('km'));
  a.equal('L2 FR 动作 → 定位 L2', H.firstFault(), 'L2');
  a.true('L2 FR 动作: 诊断提示热继电器', H.diagHas('FR 热继电器动作'));

  H.load('p2');
  H.start('sb2');
  a.equal('L2 短路前置: KM2 反转运行', H.motor(), 'rev');
  H.set('km1', 'welded', true);
  a.ok('L2 主触点粘连: 相间短路报警', H.shorts() > 0);
  a.false('L2 主触点粘连: KM1 失电', H.coil('km1'));
  a.false('L2 主触点粘连: KM2 失电', H.coil('km2'));
  a.equal('L2 主触点粘连 → 定位 L2', H.firstFault(), 'L2');
  a.true('L2 主触点粘连: 诊断指出粘连源头', H.diagHas('主触点粘连', 'danger'));
  H.set('km1', 'welded', false);
  a.equal('L2 更换接触器: 短路消除', H.shorts(), 0);
  H.start('sb2');
  a.equal('L2 排除故障后需重新启动', H.motor(), 'rev');

  H.load('p4');
  a.ok('L2 考场板含闸刀/浪涌/漏电/零排/地排/端子排',
    ['qs', 'spd', 'rcd', 'nb', 'pb', 'tb'].every(id => !!H.compById(id)));
  a.ok('L2 考场板含 1P/2P 空气开关',
    H.compById('qf2').type === 'mcb2p' && H.compById('qf3').type === 'mcb2p' && H.compById('qf4').type === 'mcb1p');
  a.true('L2 考场板初始插座通电', H.socket('xs'));
  H.set('rcd', 'leak', true);
  a.false('L2 RCD 漏电: 灯灭', H.lamp('el2'));
  a.false('L2 RCD 漏电: 插座失电', H.socket('xs'));
  a.equal('L2 RCD 漏电 → 定位 L2', H.firstFault(), 'L2');
  a.true('L2 RCD 漏电: 诊断说明跳闸', H.diagHas('漏电', 'danger'));
  H.set('rcd', 'leak', false);
  a.true('L2 排除漏电: 恢复供电', H.socket('xs') && H.lamp('el2'));

  H.load('p4');
  H.set('spd', 'failed', true);
  a.ok('L2 SPD 失效: L-N 短路报警', H.shorts() > 0);
  a.equal('L2 SPD 失效 → 定位 L2', H.firstFault(), 'L2');
  H.set('spd', 'failed', false);
  a.equal('L2 更换 SPD: 短路消除', H.shorts(), 0);

  H.load('p4');
  H.set('qf4', 'closed', false);
  a.false('L2 QF4 1P 空开分闸: 备用灯灭', H.lamp('el2'));
  a.true('L2 QF4 分闸: 插座支路不受影响', H.socket('xs'));
  a.equal('L2 QF4 分闸 → 定位 L2', H.firstFault(), 'L2');

  H.load('p3');
  H.set('qf3', 'closed', false);
  a.false('L2 QF3 分闸: 照明失电', H.lamp('el'));
  a.false('L2 QF3 分闸: 日光灯失电', H.lamp('tu'));
  a.true('L2 QF3 分闸: 插座不受影响', H.socket('xs'));
});

/* ================= L3 控制回路层 ================= */
a.section('L3 控制回路层', () => {
  H.load('p1');
  H.press('sb1');
  a.true('L3 按 SB1: KM 吸合', H.coil('km'));
  H.release('sb1');
  a.true('L3 松开 SB1: 自锁保持', H.coil('km'));
  a.equal('L3 自锁: 电机持续正转', H.motor(), 'fwd');
  H.press('sb3');
  a.false('L3 按 SB3: KM 释放', H.coil('km'));
  a.equal('L3 按 SB3: 电机停止', H.motor(), 'stop');
  a.equal('L3 正常停机不误报故障', H.firstFault(), null);
  H.release('sb3');

  H.load('p1');
  H.set('km', 'coilOpen', true);
  H.press('sb1');
  a.false('L3 线圈断路: 无法启动', H.coil('km'));
  a.equal('L3 线圈断路 → 定位 L3', H.firstFault(), 'L3');
  a.equal('L3 线圈断路 → L4 blocked', H.layerStatus('L4'), 'blocked');
  a.ok('L3 线圈断路: L3 测点标红', H.layerPoints('L3').some(p => p.ok === false && p.value.indexOf('线圈断路') >= 0));

  H.load('p2');
  H.start('sb1');
  a.equal('L3 按 SB1: 正转', H.motor(), 'fwd');
  H.press('sb2');
  a.true('L3 互锁: 运行中按 SB2, KM1 保持', H.coil('km1'));
  a.false('L3 互锁: KM2 不会吸合', H.coil('km2'));
  H.release('sb2');
  H.press('sb3');
  a.false('L3 按 SB3: KM1 释放', H.coil('km1'));
  H.release('sb3');
  H.start('sb2');
  a.equal('L3 按 SB2: 反转', H.motor(), 'rev');
  a.true('L3 反转自锁保持', H.coil('km2'));

  H.load('p5');
  a.true('L5 两地控制: 初始灯亮', H.lamp('el'));
  H.set('sa', 'up', false);
  a.false('L3 拨 S1: 灯灭', H.lamp('el'));
  H.set('sb', 'up', false);
  a.true('L3 再拨 S2: 异地翻转灯亮', H.lamp('el'));
  H.set('sa', 'up', true);
  a.false('L3 再拨 S1: 灯灭', H.lamp('el'));
  a.equal('L3 开关正常操作不误判为故障', H.firstFault(), null);

  H.load('p6');
  a.false('L3 初始 KM1 释放', H.coil('km1'));
  a.false('L3 初始 KM2 释放', H.coil('km2'));
  H.press('sb2');
  a.false('L3 顺序联锁: 先按 SB2 无效', H.coil('km2'));
  H.release('sb2');
  H.start('sb1');
  a.true('L3 按 SB1: KM1 吸合并自锁', H.coil('km1'));
  H.start('sb2');
  a.true('L3 KM1 门控通过: KM2 吸合', H.coil('km2'));
  H.press('sb3');
  a.false('L3 按 SB3: KM1 停止', H.coil('km1'));
  a.false('L3 按 SB3: KM2 停止', H.coil('km2'));
  H.release('sb3');

  H.load('p6');
  H.set('km1', 'coilOpen', true);
  H.press('sb1');
  a.false('L3 KM1 线圈断路: 无法启动', H.coil('km1'));
  a.equal('L3 KM1 线圈断路 → 定位 L3', H.firstFault(), 'L3');

  H.load('p6');
  H.set('fr1', 'tripped', true);
  H.press('sb1');
  a.false('L3 FR1 动作: KM1 不吸合', H.coil('km1'));
  a.false('L3 FR1 动作: KM2 门控亦无效', H.coil('km2'));
  a.equal('L3 FR1 动作 → 定位 L2(保护层)', H.firstFault(), 'L2');
});

/* ================= L4 负载执行层 ================= */
a.section('L4 负载执行层', () => {
  H.load('p1');
  H.start('sb1');
  a.equal('L4 电机正转', H.motor(), 'fwd');
  a.match('L4 正转相序 U-V-W = L1-L2-L3', H.motorSeq(), /^L1-L2-L3$/);

  H.load('p2');
  H.start('sb2');
  a.equal('L4 电机反转', H.motor(), 'rev');
  a.ok('L4 反转相序与正转不同', H.motorSeq() !== 'L1-L2-L3');

  H.load('p1');
  H.start('sb1');
  H.removeWire(w => (w.a.c === 'fr' && w.a.p === '2' && w.b.c === 'm') || (w.b.c === 'fr' && w.b.p === '2' && w.a.c === 'm'));
  a.equal('L4 断 U 相: 电机缺相', H.motor(), 'loss');
  a.equal('L4 断 U 相 → 定位 L4', H.firstFault(), 'L4');
  a.ok('L4 断 U 相: L4 测点含缺相', H.layerPoints('L4').some(p => p.value.indexOf('缺相') >= 0));

  H.load('p3');
  a.false('L4 初始 EL 灭', H.lamp('el'));
  H.setQuiet('s1', 'closed', true);
  H.setQuiet('s2', 'closed', true);
  H.set('s3', 'closed', true);
  a.true('L4 S1+S2 串联闭合: EL 点亮', H.lamp('el'));
  a.true('L4 S3 闭合: 日光灯点亮', H.lamp('tu'));
  H.set('s2', 'closed', false);
  a.false('L4 S2 断开: EL 熄灭', H.lamp('el'));

  H.load('p4');
  a.true('L4 插座回路通电(经端子排 X1)', H.socket('xs'));
  a.false('L4 初始照明灯灭', H.lamp('el'));
  a.true('L4 QF4 1P 支路备用灯亮', H.lamp('el2'));
  H.set('sw', 'closed', true);
  a.true('L4 合 S1: 照明灯亮', H.lamp('el'));
  a.equal('L4 全部正常时无故障层', H.firstFault(), null);
  H.removeWire(w => (w.a.c === 'tb' && w.a.p === 'b1' && w.b.c === 'sw') || (w.b.c === 'tb' && w.b.p === 'b1' && w.a.c === 'sw'));
  a.false('L4 断 X1 第 1 段: 灯灭', H.lamp('el'));
  a.true('L4 断 X1 第 1 段: 插座正常(分段隔离)', H.socket('xs'));
  a.equal('L4 断 X1 第 1 段 → 定位 L4', H.firstFault(), 'L4');
  a.ok('L4 断线: 结论指向端子排跳线', H.layerPoints('L4').some(p => p.value.indexOf('熄灭') >= 0));

  H.load('p5');
  H.set('sa', 'up', false);
  a.false('L4 两地控制拨 S1: 灯灭', H.lamp('el'));
  a.equal('L4 灯灭属正常操作, 四层无故障', H.firstFault(), null);
  a.equal('L4 无接触器电路: L3 标为不适用', H.layerStatus('L3'), 'skip');
});

/* ================= L5 布线规范 ================= */
a.section('L5 导线分类与规格规范', () => {
  H.load('p4');
  a.ok('L5 每根导线都有类别标注', H.state.wires.every(w => !!w.cat));
  a.ok('L5 存在 4mm² 进线', H.state.wires.some(w => w.spec === '4'));
  a.ok('L5 存在 2.5mm² 插座支路', H.state.wires.some(w => w.spec === '2.5'));
  a.ok('L5 存在 1.5mm² 照明支路', H.state.wires.some(w => w.spec === '1.5'));
  a.ok('L5 存在 PE 地线', H.state.wires.some(w => w.cat === 'PE'));
  a.ok('L5 存在 N 零线', H.state.wires.some(w => w.cat === 'N'));

  const wL = H.state.wires.find(w => (w.cat === 'L' || w.cat === 'L1') && H.phase(w.a.c, w.a.p).some(p => p !== 'N'));
  a.ok('L5 找到一根带电火线用于错标测试', !!wL);
  if (wL) {
    const orig = wL.cat;
    wL.cat = 'N';
    a.true('L5 火线错标 N: 触发 danger 布线错误', H.diagHas('布线错误', 'danger'));
    wL.cat = orig;
  }
  const wN = H.state.wires.find(w => w.cat === 'N' && H.phase(w.a.c, w.a.p).length === 1 && H.phase(w.a.c, w.a.p)[0] === 'N');
  a.ok('L5 找到一根 N 线用于错标测试', !!wN);
  if (wN) {
    const orig = wN.cat;
    wN.cat = 'L';
    a.true('L5 N 线错标火线: 触发 warn 疑似接错', H.diagHas('疑似接错', 'warn'));
    wN.cat = orig;
  }
  a.ok('L5 零排/地排独立元件存在', !!H.compById('nb') && !!H.compById('pb'));
});

/* ================= L6 项目管理 ================= */
a.section('L6 自定义项目保存 / 载入 / 删除', () => {
  H.load('p6');
  const before = { nc: H.state.comps.length, nw: H.state.wires.length };
  const snap = H.snapshot();
  const list = H.PROJ_STORE.all();
  const origCount = list.length;
  const saved = list.slice();
  saved.push({ name: '回归测试项目', comps: snap.comps, wires: snap.wires });
  H.PROJ_STORE.save(saved);
  a.equal('L6 保存后项目数 +1', H.PROJ_STORE.all().length, origCount + 1);

  H.load('p1');
  a.ok('L6 可切换到其他内置项目', H.state.project === 'p1');
  H.loadCustom(origCount);
  a.equal('L6 载入后元件数一致', H.state.comps.length, before.nc);
  a.equal('L6 载入后导线数一致', H.state.wires.length, before.nw);
  a.ok('L6 元件属性保留', !!H.compById('fr1') && H.props('fr1').tripped === false);
  a.ok('L6 导线类别/规格保留', H.state.wires.every(w => !!w.cat) && H.state.wires.some(w => w.cat === 'L1' && w.spec === '4'));
  H.start('sb1');
  a.true('L6 载入后仍可正常仿真', H.coil('km1'));

  const cleaned = H.PROJ_STORE.all().slice();
  cleaned.splice(origCount, 1);
  H.PROJ_STORE.save(cleaned);
  a.equal('L6 删除后列表还原', H.PROJ_STORE.all().length, origCount);
});

/* ================= L7 分层排障场景（可执行示例） ================= */
a.section('L7 分层排障 · 从现象到故障层的逐级定位', () => {
  // 场景矩阵：注入位置 → 期望的首个故障层 → 下游层应为 blocked
  const matrix = [
    {
      tag: '① L1 进线断线', setup: h => h.removeWires(w => w.a.c === 'src' || w.b.c === 'src'),
      expect: 'L1', downstream: ['L2', 'L3', 'L4'], keyword: '进线'
    },
    {
      tag: '② L2 QF 分闸', setup: h => h.set('qf', 'closed', false),
      expect: 'L2', downstream: ['L3', 'L4'], keyword: '分闸'
    },
    {
      tag: '③ L2 FU1 缺相', setup: h => h.set('fu1', 'blownPhase', 1),
      expect: 'L2', downstream: ['L3', 'L4'], keyword: '熔断'
    },
    {
      tag: '④ L2 FR 动作', setup: h => h.set('fr', 'tripped', true),
      expect: 'L2', downstream: ['L3', 'L4'], keyword: '热保护'
    },
    {
      tag: '⑤ L3 线圈断路', setup: h => h.set('km', 'coilOpen', true),
      expect: 'L3', downstream: ['L4'], keyword: '线圈断路'
    },
    {
      tag: '⑥ L4 负载缺相', setup: h => h.removeWire(w =>
        (w.a.c === 'fr' && w.a.p === '2' && w.b.c === 'm') || (w.b.c === 'fr' && w.b.p === '2' && w.a.c === 'm')),
      expect: 'L4', downstream: [], keyword: '缺相'
    }
  ];
  for (const s of matrix) {
    H.load('p1');
    H.start('sb1');
    s.setup(H);
    a.equal(s.tag + ' → firstFault=' + s.expect, H.firstFault(), s.expect);
    a.equal(s.tag + ' → 该层标记 fault', H.layerStatus(s.expect), 'fault');
    for (const d of s.downstream) {
      a.equal(s.tag + ' → ' + d + ' 标为受上游影响', H.layerStatus(d), 'blocked');
    }
    const pts = H.layerPoints(s.expect).map(p => p.name + ' ' + p.value).join(' ');
    a.ok(s.tag + ' → 该层测点含「' + s.keyword + '」', pts.indexOf(s.keyword) >= 0);
    a.equal(s.tag + ' → 上游层保持正常', H.layerStatus('L1'), s.expect === 'L1' ? 'fault' : 'ok');
  }

  // 逐级排除：恢复每个故障后应回到四层正常
  H.load('p1');
  const gone = H.removeWires(w => w.a.c === 'src' || w.b.c === 'src');
  a.equal('L7 注入 L1 故障', H.firstFault(), 'L1');
  H.state.wires = H.state.wires.concat(gone);
  H.runSim();
  a.equal('L7 排除 L1 故障 → 四层恢复', H.firstFault(), null);
  a.deepEqual('L7 恢复后四层状态', H.layers().layers.map(l => l.status), ['ok', 'ok', 'ok', 'ok']);

  // 短路故障归 L2 保护动作，且诊断指出 L3 器件源头
  H.load('p2');
  H.start('sb2');
  H.set('km1', 'welded', true);
  a.equal('L7 相间短路 → 定位 L2 保护动作', H.firstFault(), 'L2');
  a.ok('L7 L2 结论注明粘连源头属 L3', H.layers().layers.find(l => l.id === 'L2').summary.indexOf('L3') >= 0);
  a.true('L7 诊断面板给出粘连原因分析', H.diagHas('主触点粘连', 'danger'));

  // 正常操作不能被误判成故障（避免"灯不亮=故障"这类误报）
  H.load('p5');
  H.set('sa', 'up', false);
  a.false('L7 拨开关导致灯灭', H.lamp('el'));
  a.equal('L7 正常操作不产生故障层', H.firstFault(), null);

  // 面板渲染不抛异常
  let rendered = true;
  try { H.renderLayers(); } catch (e) { rendered = false; }
  a.true('L7 分层排障面板可正常渲染', rendered);
});

/* ================= L8 便携版作品保存链路（网吧/公共电脑场景） ================= */
a.section('L8 便携版作品保存 / 还原', () => {
  H.load('p1');
  H.start('sb1');
  const raw = H.circuitJSON();
  let d = null, jsonOK = true;
  try { d = JSON.parse(raw); } catch (e) { jsonOK = false; }

  a.true('L8 文本备份产出合法 JSON', jsonOK);
  a.ok('L8 JSON 含 comps / wires 数组', !!d && Array.isArray(d.comps) && Array.isArray(d.wires));
  a.equal('L8 导出元件数与画布一致', d.comps.length, H.state.comps.length);
  a.equal('L8 导出导线数与画布一致', d.wires.length, H.state.wires.length);
  a.ok('L8 导线类别 / 规格随作品一起保存', d.wires.every(w => 'cat' in w && 'spec' in w));
  a.match('L8 导出文件名带时间戳', 'circuit-' + H.fileStamp() + '.json', /^circuit-\d{8}-\d{6}\.json$/);
  a.notEqual('L8 导出文件名不再是固定 circuit.json（不会互相覆盖）', 'circuit-' + H.fileStamp() + '.json', 'circuit.json');

  const nComp = H.state.comps.length, nWire = H.state.wires.length, firstLabel = H.state.comps[0].label;
  // 模拟"换机 / 还原卡清空"：当前画布全部丢失，只有一份文本
  H.state.comps = []; H.state.wires = []; H.runSim();
  a.equal('L8 模拟清空后无元件', H.state.comps.length, 0);
  a.throws('L8 拒绝缺少 comps/wires 的无效文件', () => H.applyCircuit({ foo: 1 }));
  a.throws('L8 拒绝空文件', () => H.applyCircuit(null));
  let err = null;
  try { H.applyCircuit(d); } catch (e) { err = e; }
  a.equal('L8 从文本还原不抛异常', err, null);
  a.equal('L8 还原后元件数', H.state.comps.length, nComp);
  a.equal('L8 还原后导线数', H.state.wires.length, nWire);
  a.equal('L8 还原后元件标识保持', H.state.comps[0].label, firstLabel);
  a.equal('L8 还原后电路仍无短路', H.shorts(), 0);
  a.true('L8 还原后仿真引擎可继续运行', (() => { try { H.runSim(); return !!H.state.res; } catch (e) { return false; } })());
});

a.report();
