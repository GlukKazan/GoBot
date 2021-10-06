"use strict";

const tf = require('@tensorflow/tfjs'); 
const wasm = require('@tensorflow/tfjs-backend-wasm');

const _ = require('underscore');

const URL = 'http://127.0.0.1:3000/model/model.json';
const SIZE = 19;
const BATCH = 1;

let model = null;

function ApplyMove(fen, move) {
    let r = '';

    let ix = 0;
    let row = 0;
    let col = 0;

    for (let i = 0; i < fen.length; i++) {
         let c = fen.charAt(i);

         if (c == '/') {
             row++;
             col = 0;
             r += c;
             continue;
         }

         if (c >= '0' && c <= '9') {
             let n = 0;
             for (let j = 0; j < parseInt(c); j++) {
                 if (ix == move) {
                    if (n > 0) r += n;
                    n = 0;
                    r += 'b';
                 } else {
                    n++;
                 }
                 ix++;
                 col++;
             }
             if (n > 0) r += n;
             continue;
         }

         switch (c) {
            case 'w': 
               r += 'b';
               break;
            case 'b': 
               r += 'w';
               break;
            case 'X':
               r += '1';
               break;
        }
        col++;
        ix++;
    }

    return r;
}

function isFriend(x) {
    return x > 0.1;
}

function isEnemy(x) {
    return x < -0.1;
}

function isEmpty(x) {
    return !isFriend(x) && !isEnemy(x);
}

function navigate(pos, dir) {
    let r = pos + dir;
    if (r >= SIZE * SIZE) return -1;
    if ((dir > -2) && (dir < 2)) {
        if (((pos / SIZE) | 0) != ((r / SIZE) | 0)) return -1;
    }
    return r;
}

function analyze(board) {
    let m = []; let r = []; let done = [];
    for (let p = 0; p < SIZE * SIZE; p++) {
        if (!isEmpty(board[p])) continue;
        if (_.indexOf(done, p) >= 0) continue;
        let g = [p]; let c = null; let e = [];
        for (let i = 0; i < g.length; i++) {
            m[p] = r.length;
            _.each([1, -1, SIZE, -SIZE], function(dir) {
                let q = navigate(g[i], dir);
                if (q < 0) return;
                if (_.indexOf(g, q) >= 0) return;
                if (isEnemy(board[q])) {
                    if (c === null) c = -1;
                    if (isFriend(c)) c = 0;
                    e.push(q);
                    return;
                }
                if (isFriend(board[q])) {
                    if (c === null) c = 1;
                    if (isEnemy(c)) c = 0;
                    e.push(q);
                    return;
                }
                g.push(q);
                done.push(q);
            });
        }
        r.push({
            type:  0,
            group: g,
            color: c,
            edge:  e
        });
    }
    for (let p = 0; p < SIZE * SIZE; p++) {
        if (_.indexOf(done, p) >= 0) continue;
        let f = isFriend(board[p]);
        let g = [p]; let d = []; let y = []; let e = [];
        for (let i = 0; i < g.length; i++) {
            m[p] = r.length;
            _.each([1, -1, SIZE, -SIZE], function(dir) {
                let q = navigate(g[i], dir);
                if (q < 0) return;
                if (_.indexOf(g, q) >= 0) return;
                if (isFriend(board[q])) {
                    if (!f) {
                        e.push(q);
                        return;
                    }
                    g.push(q);
                    done.push(q);
                } else if (isEnemy(board[q])) {
                    if (f) {
                        e.push(q);
                        return;
                    }
                    g.push(q);
                    done.push(q);
                } else {
                    d.push(q);
                    let ix = m[q];
                    if (_.isUndefined(ix)) return;
                    if (!isEmpty(r[ix].type)) return;
                    if (f) {
                        if (isFriend(r[ix].color)) {
                            y.push(q);
                            r[ix].isEye = true;
                        }
                    } else {
                        if (isEnemy(r[ix].color)) {
                            y.push(q);
                            r[ix].isEye = true;
                        }
                    }
                }
                g.push(q);
                done.push(q);
            });
        }
        r.push({
            type:  f ? 1 : -1,
            group: g,
            dame:  d,
            eyes:  y,
            edge:  e
        });
    }
    return {
        map: m,
        res: r
    }
}

function isDead(board, a, pos) {
    let dame = 0;
    _.each([1, -1, SIZE, -SIZE], function(d) {
        let p = navigate(pos, d);
        if (p < 0) return;
        if (isFriend(board[p])) {
            const ix = a.map[p];
            if (_.isUndefined(ix)) return;
            const d = a.res[ix].dame;
            if (_.isUndefined(d)) return;
            dame += d.length - 1;
            return;
        }
        if (isEnemy(board[p])) return;
        dame++;
    });
    return dame < 2;
}

function checkForbidden(board, forbidden, hints) {
    const a = analyze(board); 
    let m = null;
    for (let i = 0; i < a.res.length; i++) {
        if (!isEnemy(a.res[i].type)) continue;
        if (a.res[i].dame.length != 1) continue;
        if ((m !== null) && (m > a.res[i].dame.length)) continue;
        hints.push(a.res[i].dame[0]);
        m = a.res[i].dame.length;
    }
    if (m !== null) return;
    m = null;
    for (let i = 0; i < a.res.length; i++) {
        if (!isFriend(a.res[i].type)) continue;
        if (a.res[i].dame.length != 1) continue;
        if ((m !== null) && (m > a.res[i].dame.length)) continue;
        if (isDead(board, a, a.res[i].dame[0])) continue;
        hints.push(a.res[i].dame[0]);
        m = a.res[i].dame.length;
    }
    if (m !== null) return;
    for (let p = 0; p < SIZE * SIZE; p++) {
        const ix = a.map[p];
        if (_.isUndefined(ix)) continue;
        if (!isEmpty(a.res[ix].type)) continue;
        if (a.res[ix].isEye) {
            forbidden.push(p);
            continue;
        }
        if (isDead(board, a, p)) {
            forbidden.push(p);
            continue;
        }
    }
}

function flipX(pos) {
    const x = pos % SIZE;
    pos -= x;
    return pos + (SIZE - x - 1);
}

function flipY(pos) {
    const y = (pos / SIZE) | 0;
    pos -= y * SIZE;
    return (SIZE - y - 1) * SIZE + pos;
}

function toRight(pos) {
    const x = pos % SIZE;
    const y = (pos / SIZE) | 0;
    return x * SIZE + (SIZE - y - 1);
}

function toLeft(pos) {
    const x = pos % SIZE;
    const y = (pos / SIZE) | 0;
    return (SIZE - x - 1) * SIZE + y;
}

function transform(pos, n) {    
    switch (n) {
        case 1:
            pos = flipX(pos);
            break;
        case 2:
            pos = flipY(pos);
            break;
        case 3:
            pos = flipX(pos);
            pos = flipY(pos);
            break;
        case 4:
            pos = toRight(pos);
            break;
        case 5:
            pos = toLeft(pos);
            break;
        case 6:
            pos = toRight(pos);
            pos = flipX(pos);
            break;
        case 7:
            pos = toLeft(pos);
            pos = flipX(pos);
            break;
        case 8:
            pos = flipX(pos);
            pos = toLeft(pos);
            break;
        case 9:
            pos = flipX(pos);
            pos = toRight(pos);
            break;
    }
    return pos;
}

function InitializeFromFen(fen, forbidden, hints, redo, inverse) {
    let board = new Float32Array(BATCH * SIZE * SIZE);

    let row = 0;
    let col = 0;

    for (let i = 0; i < fen.length; i++) {
         let c = fen.charAt(i);

         if (c == '/') {
             row++;
             col = 0;
             continue;
         }

         if (c >= '0' && c <= '9') {
             col += parseInt(c);
             continue;
         }

         let piece = 0;
         switch (c) {
            case 'w': 
               piece = inverse ? -1 : 1;
               break;
            case 'b': 
               piece = inverse ? 1 : -1;
               break;
            case 'X':
               piece = 0;
               break;
        }
        const pos = transform(row * SIZE + col, redo);
        board[pos] = piece;
        forbidden.push(pos);
        col++;
    }

    checkForbidden(board, forbidden, hints);

    const shape = [BATCH, 1, SIZE, SIZE];
    return tf.tensor4d(board, shape, 'float32');
}

function FormatMove(move) {
    const col = move % SIZE;
    const row = (move / SIZE) | 0;

    const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's'];
    return letters[col] + (SIZE - row);
}

async function predict(fen, redo, undo, result, inverse) {
    let forbidden = []; let hints = [];
    const d = InitializeFromFen(fen, forbidden, hints, redo, inverse);

    const p = await model.predict(d);
    const r = await p.data();

    d.dispose();
    p.dispose();

    if (forbidden.length < 10) {
        forbidden.push(180);
    }

    for (let i = 0; i < SIZE * SIZE; i++) {
        if (_.indexOf(forbidden, i) >= 0) continue;
        const p = r[i] * r[i] * r[i];
        result.push({
            pos: transform(i, undo),
            weight: inverse ? -p : p
        });
   }
}

async function InitModel() {
    if (model === null) {
        await tf.enableProdMode();
        await tf.setBackend('wasm');
        model = await tf.loadLayersModel(URL);
        console.log(tf.getBackend());
    }
}

async function FindMove(fen, callback, logger) {
    const t0 = Date.now();
    await InitModel();
    const t1 = Date.now();
    console.log('Load time: ' + (t1 - t0));

    let dummy = []; let hints = [];
    InitializeFromFen(fen, dummy, hints, 0, false);

    let r = []; 
    if (hints.length == 0) {
        await predict(fen, 0, 0, r, false);
        await predict(fen, 1, 1, r, false);
        await predict(fen, 2, 2, r, false);
        await predict(fen, 3, 3, r, false);
        await predict(fen, 4, 5, r, false);
        await predict(fen, 5, 4, r, false);
        await predict(fen, 6, 8, r, false);
        await predict(fen, 7, 9, r, false);
    
        await predict(fen, 0, 0, r, true);
        await predict(fen, 1, 1, r, true);
        await predict(fen, 2, 2, r, true);
        await predict(fen, 3, 3, r, true);
        await predict(fen, 4, 5, r, true);
        await predict(fen, 5, 4, r, true);
        await predict(fen, 6, 8, r, true);
        await predict(fen, 7, 9, r, true);

        r = _.sortBy(r, function(x) {
            return -Math.abs(x.weight);
        });
    } else {
        r = _.map(hints, function(p) {
            return {
                pos: p,
                weight: 1
            };
        });
    }
    const t2 = Date.now();
    console.log('Predict time: ' + (t2 - t1));

    let sz = r.length; let ix = 0;
    if (sz < 1) return; sz = 1;
    while (sz < Math.min(r.length - 1, 5)) {
        if (Math.abs(r[sz].weight) * 2 < Math.abs(r[sz - 1].weight)) break;
        sz++;
    }
    for (let i = 0; i < sz; i++) {
        console.log(FormatMove(r[i].pos) + ': ' + r[i].weight);
        logger(FormatMove(r[i].pos) + ': ' + r[i].weight);
    }
    if (sz > 1) {
        if (sz > 5) sz = 5;
        ix = _.random(0, sz - 1);
    }

    fen = ApplyMove(fen, r[ix].pos);
    callback(r[ix].pos, fen, Math.abs(r[ix].weight) * 1000, t2 - t0);
}

async function Advisor(sid, fen, coeff, flags, callback) {
    const t0 = Date.now();
    await InitModel();
    const t1 = Date.now();
    console.log('Load time: ' + (t1 - t0));

    let r = []; 
    if (flags & 0x01) await predict(fen, 0, 0, r, false);
    if (flags & 0x02) await predict(fen, 1, 1, r, false);
    if (flags & 0x04) await predict(fen, 2, 2, r, false);
    if (flags & 0x08) await predict(fen, 3, 3, r, false);
    if (flags & 0x10) await predict(fen, 4, 5, r, false);
    if (flags & 0x20) await predict(fen, 5, 4, r, false);
    if (flags & 0x40) await predict(fen, 6, 8, r, false);
    if (flags & 0x80) await predict(fen, 7, 9, r, false);

    if (flags & 0x01) await predict(fen, 0, 0, r, true);
    if (flags & 0x02) await predict(fen, 1, 1, r, true);
    if (flags & 0x04) await predict(fen, 2, 2, r, true);
    if (flags & 0x08) await predict(fen, 3, 3, r, true);
    if (flags & 0x10) await predict(fen, 4, 5, r, true);
    if (flags & 0x20) await predict(fen, 5, 4, r, true);
    if (flags & 0x40) await predict(fen, 6, 8, r, true);
    if (flags & 0x80) await predict(fen, 7, 9, r, true);
    const t2 = Date.now();
    console.log('Predict time: ' + (t2 - t1));

    r = _.sortBy(r, function(x) {
        return -Math.abs(x.weight);
    });

    let result = [];
    let sz = 0;
    while (sz < r.length - 1) {
        if ((sz > 0) && (Math.abs(r[sz].weight) * coeff < Math.abs(r[sz - 1].weight))) break;
        if (sz > 10) break;
        result.push({
            sid: sid,
            move: FormatMove(r[sz].pos),
            weight: r[sz].weight * 1000
        });
        sz++;
    }

    callback(result, t2 - t0);
}

module.exports.FindMove = FindMove;
module.exports.FormatMove = FormatMove;
module.exports.Advisor = Advisor;
