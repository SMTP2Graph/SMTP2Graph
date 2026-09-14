import { expect } from 'chai';
import { getRetryDelay } from '../../src/classes/Retry';

describe('Mailer: Retry-After', ()=>{
    const now = Date.UTC(2026, 6, 25, 12, 0, 0);

    it('prioritizes delta-seconds over local backoff', ()=>{
        expect(getRetryDelay('2', 3, now, ()=>0)).to.equal(2000);
    });

    it('supports HTTP-date', ()=>{
        expect(getRetryDelay(new Date(now + 3000).toUTCString(), 3, now, ()=>0)).to.equal(3000);
    });

    it('uses bounded jittered exponential backoff for invalid headers', ()=>{
        expect(getRetryDelay('invalid', 1, now, ()=>0)).to.equal(200);
        expect(getRetryDelay('invalid', 1, now, ()=>1)).to.equal(600);
    });

    it('ignores an unbounded Retry-After value', ()=>{
        expect(getRetryDelay('999999', 1, now, ()=>0)).to.equal(200);
    });
});
