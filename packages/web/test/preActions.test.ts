import { describe, expect, it } from 'vitest';
import type { LegalActions } from '@calliope/engine';
import { arm, resolve, stillArmed, type Ahead } from '../src/preActions.js';

const ahead = (toCall: number, key = '4:1'): Ahead => ({ key, toCall, raiseKind: toCall ? 'raise' : 'bet', canRaise: true });
const legal = (toCall: number, raise: LegalActions['raise'] = { kind: toCall ? 'raise' : 'bet', min: toCall ? toCall * 2 : 10, max: 1000, fixed: false }): LegalActions => ({
  seat: 0, canFold: true, canCheck: toCall === 0, callAmount: toCall, toCall, raise, step: 5, potTotal: 100,
});

describe('acting before your turn', () => {
  it('check / fold checks when it can and folds when it cannot, whatever happened meanwhile', () => {
    const a = arm('check-fold', ahead(0));
    expect(stillArmed(a, ahead(40))).toBe(true);
    expect(resolve(a, '4:1', legal(0))).toEqual({ type: 'check' });
    expect(resolve(a, '4:1', legal(40))).toEqual({ type: 'fold' });
  });

  it('a call stands only at the price it was made at', () => {
    const a = arm('call', ahead(20));
    expect(stillArmed(a, ahead(20))).toBe(true);
    expect(stillArmed(a, ahead(60))).toBe(false);
    expect(resolve(a, '4:1', legal(20))).toEqual({ type: 'call' });
    expect(resolve(a, '4:1', legal(60))).toBeNull();
    // A check chosen with nothing to call is a check.
    expect(resolve(arm('call', ahead(0)), '4:1', legal(0))).toEqual({ type: 'check' });
  });

  it('a raise is the smallest one, and only if nobody has raised meanwhile', () => {
    const a = arm('raise', ahead(20));
    expect(resolve(a, '4:1', legal(20))).toEqual({ type: 'raise', to: 40 });
    expect(resolve(a, '4:1', legal(50))).toBeNull();
    expect(resolve(a, '4:1', legal(20, null))).toBeNull();
    expect(resolve(arm('raise', ahead(0)), '4:1', legal(0))).toEqual({ type: 'bet', to: 10 });
  });

  it('lasts one street of one hand', () => {
    const a = arm('check-fold', ahead(0, '4:1'));
    expect(stillArmed(a, ahead(0, '4:2'))).toBe(false);
    expect(stillArmed(a, null)).toBe(false);
    expect(resolve(a, '5:0', legal(0))).toBeNull();
  });
});
