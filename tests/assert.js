'use strict';
/* 轻量断言库：分组统计、期望/实际明细、失败清单、进程退出码。
   不依赖任何第三方包，保证仓库 clone 下来就能跑。 */

const fmt = v => {
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return JSON.stringify(v);
  try { const s = JSON.stringify(v); return s === undefined ? String(v) : s; }
  catch (e) { return String(v); }
};

class Assertions {
  constructor() {
    this.pass = 0;
    this.fail = 0;
    this.failures = [];
    this.groups = [];
    this.current = null;
  }

  section(name, fn) {
    const rec = { name, pass: 0, fail: 0 };
    this.groups.push(rec);
    const prev = this.current;
    this.current = rec;
    console.log('\n── ' + name + ' ──');
    try { fn(); }
    catch (e) { this._fail('[分组未捕获异常] ' + name, e && e.stack ? e.stack.split('\n')[0] : String(e)); }
    this.current = prev;
  }

  _ok(name, ok, detail) {
    if (ok) {
      this.pass++;
      if (this.current) this.current.pass++;
      return true;
    }
    this._fail(name, detail);
    return false;
  }

  _fail(name, detail) {
    this.fail++;
    if (this.current) this.current.fail++;
    const line = 'FAIL | ' + name + (detail ? ' | ' + detail : '');
    this.failures.push(line);
    console.log(line);
  }

  ok(name, cond, detail) {
    return this._ok(name, !!cond, detail || 'expected truthy, got ' + fmt(cond));
  }
  true(name, v) {
    return this._ok(name, v === true, 'expected true, got ' + fmt(v));
  }
  false(name, v) {
    return this._ok(name, v === false, 'expected false, got ' + fmt(v));
  }
  equal(name, actual, expected) {
    return this._ok(name, Object.is(actual, expected), 'expected ' + fmt(expected) + ', got ' + fmt(actual));
  }
  notEqual(name, actual, unexpected) {
    return this._ok(name, !Object.is(actual, unexpected), 'expected != ' + fmt(unexpected) + ', got ' + fmt(actual));
  }
  includes(name, hay, needle) {
    const s = String(hay);
    return this._ok(name, s.indexOf(String(needle)) >= 0,
      'expected ' + fmt(s) + ' to contain ' + fmt(needle));
  }
  match(name, str, re) {
    return this._ok(name, re.test(String(str)), 'expected ' + fmt(str) + ' to match ' + String(re));
  }
  deepEqual(name, a, b) {
    return this._ok(name, JSON.stringify(a) === JSON.stringify(b),
      'expected ' + fmt(b) + ', got ' + fmt(a));
  }
  count(name, arr, n) {
    const len = Array.isArray(arr) ? arr.length : -1;
    return this._ok(name, len === n, 'expected length ' + n + ', got ' + (len < 0 ? fmt(arr) : len));
  }
  throws(name, fn) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    return this._ok(name, threw, 'expected function to throw');
  }

  report() {
    console.log('\n' + '='.repeat(60));
    for (const g of this.groups) {
      console.log('  ' + g.name.padEnd(38) + ' pass=' + g.pass + '  fail=' + g.fail);
    }
    console.log('='.repeat(60));
    console.log('PASS=' + this.pass + ' FAIL=' + this.fail + ' TOTAL=' + (this.pass + this.fail));
    if (this.fail) {
      console.log('\n失败明细：');
      this.failures.forEach(f => console.log('  ' + f));
      process.exitCode = 1;
    } else {
      console.log('全部通过 ✔');
    }
    return this.fail === 0;
  }
}

module.exports = { Assertions };
