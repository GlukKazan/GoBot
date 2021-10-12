"use strict";

const tf = require('@tensorflow/tfjs'); 
const wasm = require('@tensorflow/tfjs-backend-wasm');
const {nodeFileSystemRouter} = require('@tensorflow/tfjs-node/dist/io/file_system');

const _ = require('underscore');

const URL = 'http://127.0.0.1:3000/model/model.json';
const SIZE = 19;
const BATCH = 1;

let model = null;
let board = null;
let stat  = null;

function RedoMove(fen, move) {
    _.each([1, -1, SIZE, -SIZE], function(dir) {
        let p = navigate(move, dir);
        if (p < 0) return;
        let ix = stat.map[p];
        if (_.isUndefined(ix)) return;
        if (!isEnemy(stat.res[ix].type)) return;
        if (stat.res[ix].dame.length > 1) return;
        _.each(stat.res[ix].group, function (q) {
            board[q] = 0;
        });
    });
    board[move] = 1;
    return board;
}

function GetFen(board) {
    let r = "";

    for (let row = 0; row < SIZE; row++) {
        if (row != 0) r += '/';
        let empty = 0;
        for (let col = 0; col < SIZE; col++) {
            let piece = board[row * SIZE + col];
            if (isEmpty(piece)) {
                if (empty > 8) {
                    r += empty;
                    empty = 0;
                }
                empty++;
            }
            else {
                if (empty != 0) 
                    r += empty;
                empty = 0;
                if (isFriend(piece)) {
                    r += 'b';
                } else {
                    r += 'w';
                }
            }
        }
        if (empty != 0) {
            r += empty;
        }
    }
    
    return r;
}

function ApplyMove(fen, move) {
    let b = RedoMove(fen, move);
    return GetFen(b);
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
            m[ g[i] ] = r.length;
            done.push(g[i]);
            _.each([1, -1, SIZE, -SIZE], function(dir) {
                let q = navigate(g[i], dir);
                if (q < 0) return;
                if (_.indexOf(g, q) >= 0) return;
                if (isEnemy(board[q])) {
                    if (c === null) c = -1;
                    if (isFriend(c)) c = 0;
                    if (_.indexOf(e, q) < 0) e.push(q);
                    return;
                }
                if (isFriend(board[q])) {
                    if (c === null) c = 1;
                    if (isEnemy(c)) c = 0;
                    if (_.indexOf(e, q) < 0) e.push(q);
                    return;
                }
                g.push(q);
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
            m[ g[i] ] = r.length;
            done.push(g[i]);
            _.each([1, -1, SIZE, -SIZE], function(dir) {
                let q = navigate(g[i], dir);
                if (q < 0) return;
                if (_.indexOf(g, q) >= 0) return;
                if (isFriend(board[q])) {
                    if (!f) {
                        if (_.indexOf(e, q) < 0) e.push(q);
                        return;
                    } else {
                        if (_.indexOf(g, q) < 0) g.push(q);
                    }
                } else if (isEnemy(board[q])) {
                    if (f) {
                        if (_.indexOf(e, q) < 0) e.push(q);
                        return;
                    } else {
                        if (_.indexOf(g, q) < 0) g.push(q);
                    }
                } else {
                    if (_.indexOf(d, q) < 0) d.push(q);
                    let ix = m[q];
                    if (_.isUndefined(ix)) return;
                    if (!isEmpty(r[ix].type)) return;
                    if (f) {
                        if (isFriend(r[ix].color)) {
                            if (_.indexOf(y, q) < 0) y.push(q);
                            r[ix].isEye = true;
                        }
                    } else {
                        if (isEnemy(r[ix].color)) {
                            if (_.indexOf(y, q) < 0) y.push(q);
                            r[ix].isEye = true;
                        }
                    }
                }
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
    _.each([1, -1, SIZE, -SIZE], function(dir) {
        let p = navigate(pos, dir);
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

function isSecondLine(board, pos) {
    let r = false;
    _.each([1, -1, SIZE, -SIZE], function(dir) {
        const p = navigate(pos, dir);
        if (p < 0) return;
        if (!isFriend(board[p])) return;
        const q = navigate(pos, -dir);
        if (q < 0) return;
        if (navigate(q, -dir) < 0) r = true;
    });
    return r;
}

function isDoubleAtari(a, pos) {
    let r = [];
    _.each([1, -1, SIZE, -SIZE], function(dir) {
        const p = navigate(pos, dir);
        if (p < 0) return;
        const ix = a.map[p];
        if (_.isUndefined(ix)) return;
        if (_.indexOf(r, ix) >= 0) return;
        if (!isEnemy(a.res[ix].type)) return;
        if (a.res[ix].dame.length > 2) return;
        r.push(ix);
    });
    return r.length > 1;
}

function isSecondLineAtariThreat(a, pos) {
    let e = 0; let d = 0; let b = 0;
    _.each([1, -1, SIZE, -SIZE], function(dir) {
        const p = navigate(pos, dir);
        if (p < 0) return;
        const ix = a.map[p];
        if (_.isUndefined(ix)) return;
        if (isEnemy(a.res[ix].type) || (isFriend(a.res[ix].type) && (a.res[ix].dame.length == 1))) {
            e++;
            return;
        }
        if (isEmpty(a.res[ix].type)) {
            const q = navigate(p, dir);
            if (q < 0) {
                b++;
            } else {
                d++;
            }
        }
    });
    return (e == 2) && (d == 1) && (b == 1);
}

function isFirstLine(pos) {
    let r = false;
    _.each([1, -1, SIZE, -SIZE], function(dir) {
        const p = navigate(pos, dir);
        if (p < 0) r = true;
    });
    return r;
}

function checkForbidden(board, forbidden, hints) {
    const a = analyze(board); 
    let m = null; let f = false;
    // Capturing
    for (let i = 0; i < a.res.length; i++) {
        if (!isEnemy(a.res[i].type)) continue;
        if (a.res[i].dame.length != 1) continue;
        if ((m !== null) && (m > a.res[i].group.length)) continue;
        m = a.res[i].group.length;
        hints.length = 0;
        hints.push(a.res[i].dame[0]);
        f = true;
    }
    // Defence
    if (!f) {
        for (let i = 0; i < a.res.length; i++) {
            if (!isFriend(a.res[i].type)) continue;
            if (a.res[i].dame.length != 1) continue;
            if (isSecondLine(board, a.res[i].dame[0])) {
                forbidden.push(a.res[i].dame[0]);
                continue;
            }
            if (isDead(board, a, a.res[i].dame[0])) continue;
            if ((m !== null) && (m > a.res[i].group.length)) continue;
            m = a.res[i].group.length;
            hints.length = 0;
            hints.push(a.res[i].dame[0]);
        }
        // Second line Atari
        for (let i = 0; i < a.res.length; i++) {
            if (!isEnemy(a.res[i].type)) continue;
            if (a.res[i].dame.length != 2) continue;
            let p = null;
            for (let j = 0; j < a.res[i].dame.length; j++) {
                if (isFirstLine(a.res[i].dame[j])) p = a.res[i].dame[j];
            }
            if (p === null) continue;
            _.each(_.without(a.res[i].dame, p), function(q) {
                hints.push(q);
            });
        }
    }
    for (let p = 0; p < SIZE * SIZE; p++) {
        const ix = a.map[p];
        if (_.isUndefined(ix)) continue;
        if (!isEmpty(a.res[ix].type)) continue;
        // Eyes filling
        if (a.res[ix].isEye && (a.res[ix].group.length < 5)) {
            forbidden.push(p);
            continue;
        }
        // Atari threat
        if (isDead(board, a, p)) {
            forbidden.push(p);
            continue;
        }
        // Second line Atari threat
        if (isSecondLineAtariThreat(a, p)) {
            forbidden.push(p);
            continue;
        }
        if (f) continue;
        // Double Atari
        if (isDoubleAtari(a, p)) {
            hints.push(p);
            continue;
        }
    }
    return a;
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

function InitializeFromFen(fen, forbidden, redo, inverse, batch) {
    const offset = batch * SIZE * SIZE;

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
        const pos = transform(row * SIZE + col, redo) + offset;
        board[pos] = piece;
        forbidden.push(pos);
        col++;
    }
}

function FormatMove(move) {
    const col = move % SIZE;
    const row = (move / SIZE) | 0;

    const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's'];
    return letters[col] + (SIZE - row);
}

function ExtractData(data, res, forbidden, undo, inverse, batch) {
    const offset = batch * SIZE * SIZE;
    for (let i = 0; i < SIZE * SIZE; i++) {
        const w = data[i + offset] * data[i + offset] * data[i + offset];
        const p = transform(i, undo);
        if (_.indexOf(forbidden, p) >= 0) continue;
        res.push({
            pos: p,
            weight: inverse ? -w : w
        });
    }
}

function freeze() {
    for (let i = 0; i < 12; i++) {
        let l = model.getLayer(null, i);
        l.trainable = false;
    }
}

async function InitModel() {
    if (model === null) {
        await tf.enableProdMode();
        await tf.setBackend('wasm');

        tf.io.registerLoadRouter(nodeFileSystemRouter);
        tf.io.registerSaveRouter(nodeFileSystemRouter);

        model = await tf.loadLayersModel(URL);
        console.log(tf.getBackend());
        freeze();
    }
}

async function SaveModel(savePath) {
    await model.save(`file:///tmp/${savePath}`);
}

async function FindMove(fen, callback, logger) {
    board = new Float32Array(16 * SIZE * SIZE);

    const t0 = Date.now();
    await InitModel();
    const t1 = Date.now();
    console.log('Load time: ' + (t1 - t0));

    let forbidden = []; let hints = []; let batch = 0;
    InitializeFromFen(fen, forbidden, 0, false, batch); batch++;
    stat = checkForbidden(board, forbidden, hints);

    if (forbidden.length < 10) {
        forbidden.push(180);
    }

    let r = []; 
    if (hints.length == 0) {
        let dummy = [];
        InitializeFromFen(fen, dummy, 1, false, batch); batch++;
        InitializeFromFen(fen, dummy, 2, false, batch); batch++;
        InitializeFromFen(fen, dummy, 3, false, batch); batch++;
        InitializeFromFen(fen, dummy, 4, false, batch); batch++;
        InitializeFromFen(fen, dummy, 5, false, batch); batch++;
        InitializeFromFen(fen, dummy, 6, false, batch); batch++;
        InitializeFromFen(fen, dummy, 7, false, batch); batch++;
    
        InitializeFromFen(fen, dummy, 0, true, batch); batch++;
        InitializeFromFen(fen, dummy, 1, true, batch); batch++;
        InitializeFromFen(fen, dummy, 2, true, batch); batch++;
        InitializeFromFen(fen, dummy, 3, true, batch); batch++;
        InitializeFromFen(fen, dummy, 4, true, batch); batch++;
        InitializeFromFen(fen, dummy, 5, true, batch); batch++;
        InitializeFromFen(fen, dummy, 6, true, batch); batch++;
        InitializeFromFen(fen, dummy, 7, true, batch); batch++;
    
        const shape = [16, 1, SIZE, SIZE];
        const d = tf.tensor4d(board, shape, 'float32');
        const p = await model.predict(d);
        const x = await p.data();
    
        d.dispose();
        p.dispose();

        batch = 0;
        ExtractData(x, r, forbidden, 0, false, batch); batch++;
        ExtractData(x, r, forbidden, 1, false, batch); batch++;
        ExtractData(x, r, forbidden, 2, false, batch); batch++;
        ExtractData(x, r, forbidden, 3, false, batch); batch++;
        ExtractData(x, r, forbidden, 5, false, batch); batch++;
        ExtractData(x, r, forbidden, 4, false, batch); batch++;
        ExtractData(x, r, forbidden, 8, false, batch); batch++;
        ExtractData(x, r, forbidden, 9, false, batch); batch++;

        ExtractData(x, r, forbidden, 0, true, batch); batch++;
        ExtractData(x, r, forbidden, 1, true, batch); batch++;
        ExtractData(x, r, forbidden, 2, true, batch); batch++;
        ExtractData(x, r, forbidden, 3, true, batch); batch++;
        ExtractData(x, r, forbidden, 5, true, batch); batch++;
        ExtractData(x, r, forbidden, 4, true, batch); batch++;
        ExtractData(x, r, forbidden, 8, true, batch); batch++;
        ExtractData(x, r, forbidden, 9, true, batch); batch++;

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

async function Advisor(sid, fen, coeff, callback) {
    board = new Float32Array(16 * SIZE * SIZE);

    const t0 = Date.now();
    await InitModel();
    const t1 = Date.now();
    console.log('Load time: ' + (t1 - t0));

    let forbidden = []; let hints = []; let batch = 0;
    InitializeFromFen(fen, forbidden, 0, false, batch); batch++;
    stat = checkForbidden(board, forbidden, hints);

    if (forbidden.length < 10) {
        forbidden.push(180);
    }

    let r = []; 
    let dummy = [];
    InitializeFromFen(fen, dummy, 1, false, batch); batch++;
    InitializeFromFen(fen, dummy, 2, false, batch); batch++;
    InitializeFromFen(fen, dummy, 3, false, batch); batch++;
    InitializeFromFen(fen, dummy, 4, false, batch); batch++;
    InitializeFromFen(fen, dummy, 5, false, batch); batch++;
    InitializeFromFen(fen, dummy, 6, false, batch); batch++;
    InitializeFromFen(fen, dummy, 7, false, batch); batch++;

    InitializeFromFen(fen, dummy, 0, true, batch); batch++;
    InitializeFromFen(fen, dummy, 1, true, batch); batch++;
    InitializeFromFen(fen, dummy, 2, true, batch); batch++;
    InitializeFromFen(fen, dummy, 3, true, batch); batch++;
    InitializeFromFen(fen, dummy, 4, true, batch); batch++;
    InitializeFromFen(fen, dummy, 5, true, batch); batch++;
    InitializeFromFen(fen, dummy, 6, true, batch); batch++;
    InitializeFromFen(fen, dummy, 7, true, batch); batch++;

    const shape = [16, 1, SIZE, SIZE];
    const d = tf.tensor4d(board, shape, 'float32');
    const p = await model.predict(d);
    const x = await p.data();

    d.dispose();
    p.dispose();

    batch = 0;
    ExtractData(x, r, forbidden, 0, false, batch); batch++;
    ExtractData(x, r, forbidden, 1, false, batch); batch++;
    ExtractData(x, r, forbidden, 2, false, batch); batch++;
    ExtractData(x, r, forbidden, 3, false, batch); batch++;
    ExtractData(x, r, forbidden, 5, false, batch); batch++;
    ExtractData(x, r, forbidden, 4, false, batch); batch++;
    ExtractData(x, r, forbidden, 8, false, batch); batch++;
    ExtractData(x, r, forbidden, 9, false, batch); batch++;

    ExtractData(x, r, forbidden, 0, true, batch); batch++;
    ExtractData(x, r, forbidden, 1, true, batch); batch++;
    ExtractData(x, r, forbidden, 2, true, batch); batch++;
    ExtractData(x, r, forbidden, 3, true, batch); batch++;
    ExtractData(x, r, forbidden, 5, true, batch); batch++;
    ExtractData(x, r, forbidden, 4, true, batch); batch++;
    ExtractData(x, r, forbidden, 8, true, batch); batch++;
    ExtractData(x, r, forbidden, 9, true, batch); batch++;

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
