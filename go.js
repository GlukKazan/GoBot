"use strict";

const tf = require('@tensorflow/tfjs'); 
const wasm = require('@tensorflow/tfjs-backend-wasm');

const _ = require('underscore');

const URL = 'https://games.dtco.ru/model/model.json';
const SIZE = 19;

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

function navigate(pos, dir) {
    let r = pos + dir;
    if (r >= SIZE * SIZE) return -1;
    if ((dir > -2) && (dir < 2)) {
        if (((pos / SIZE) | 0) != ((r / SIZE) | 0)) return -1;
    }
    return r;
}

function checkForbidden(board, forbidden) {
    let done = []; let atari = [];
    for (let p = 0; p < SIZE * SIZE; p++) {
         if (_.indexOf(done, p) >= 0) continue;
         if (isFriend(board[p])) {
             let group = [p]; let dame = 0;
             for (let i = 0; i < group.length; i++) {
                 _.each([1, -1, SIZE, -SIZE], function(d) {
                     let q = navigate(group[i], d);
                     if (q < 0) return;
                     if (_.indexOf(group, q) >= 0) return;
                     if (isEnemy(board[q])) return;
                     if (!isFriend(board[q])) {
                         dame++;
                         return;
                     }
                     group.push(q);
                     done.push(q);
                 });
             }
             if (dame < 2) atari = _.union(atari, group);
             continue;
         }
         if (isEnemy(board[p])) continue;
         let group = [p]; 
         let enemy = 0; let friend = 0;
         for (let i = 0; i < group.length; i++) {
             _.each([1, -1, SIZE, -SIZE], function(d) {
                let q = navigate(group[i], d);
                if (q < 0) return;
                if (_.indexOf(group, q) >= 0) return;
                if (isFriend(board[q])) {
                    friend++;
                    return;
                }
                if (isEnemy(board[q])) {
                    enemy++;
                    return;
                }
                group.push(q);
                done.push(q);
             });
         }
         if ((enemy < 1) && (group.length < 4)) {
            _.each(group, function(p) {
                forbidden.push(p);
            });
         }
         if ((friend < 1) && (group.length < 4)) {
            _.each(group, function(p) {
                forbidden.push(p);
            });
         }
    }
    for (let p = 0; p < SIZE * SIZE; p++) {
        if (isEnemy(board[p]) || isFriend(board[p])) continue;
         let dame = 0; let f = false; let e = 0;
         _.each([1, -1, SIZE, -SIZE], function(d) {
            let q = navigate(p, d);
            if (q < 0) return;
            if (isEnemy(board[q])) {
                e++;
                return;
            }
            if (_.indexOf(atari, q) >= 0) {
                f = true;
                return;
            }
            if (isFriend(board[q])) return;
            dame++;
         });
         if ((f && (dame < 1)) || (e == 4)) {
             forbidden.push(p);
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

function InitializeFromFen(fen, forbidden, redo) {
    let board = new Float32Array(SIZE * SIZE);

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
               piece = 1;
               break;
            case 'b': 
               piece = -1;
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

    checkForbidden(board, forbidden);

    const shape = [1, 1, 19, 19];
    return tf.tensor4d(board, shape, 'float32');
}

function FormatMove(move) {
    const col = move % SIZE;
    const row = (move / SIZE) | 0;

    const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's'];
    return letters[col] + (SIZE - row);
}

async function predict(fen, redo, undo, result) {
    let forbidden = [];
    const d = InitializeFromFen(fen, forbidden, redo);

    const p = await model.predict(d);
    const r = await p.data();

    d.dispose();
    p.dispose();

    if (forbidden.length < 10) {
        forbidden.push(180);
    }

    for (let i = 0; i < r.length; i++) {
        if (_.indexOf(forbidden, i) >= 0) continue;
        const p = r[i] * r[i] * r[i];
        result.push({
            pos: transform(i, undo),
            weight: p
        });
   }
}

async function FindMove(fen, callback, logger) {
    const t0 = Date.now();
    if (model === null) {
        await tf.enableProdMode();
        await tf.setBackend('wasm');
        model = await tf.loadLayersModel(URL);
        console.log(tf.getBackend());
    }

    const t1 = Date.now();
    console.log('Load time: ' + (t1 - t0));
    let r = []; 
    await predict(fen, 0, 0, r);
    await predict(fen, 1, 1, r);
    await predict(fen, 2, 2, r);
    await predict(fen, 3, 3, r);
    await predict(fen, 4, 5, r);
    await predict(fen, 5, 4, r);
    await predict(fen, 6, 8, r);
    await predict(fen, 7, 9, r);
    const t2 = Date.now();
    console.log('Predict time: ' + (t2 - t1));

    r = _.sortBy(r, function(x) {
        return -x.weight;
    });

    let sz = r.length; let ix = 0;
    if (sz < 1) return; sz = 1;
    while (sz < Math.min(r.length - 1, 5)) {
        if (r[sz].weight * 2 < r[sz - 1].weight) break;
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
    callback(r[ix].pos, fen, r[ix].weight * 1000, t2 - t0);
}

async function Advisor(sid, fen, coeff, callback) {
    const t0 = Date.now();
    if (model === null) {
        model = await tf.loadLayersModel(URL);
        console.log(tf.getBackend());
    }

    const t1 = Date.now();
    console.log('Load time: ' + (t1 - t0));

    let r = []; 
    await predict(fen, 0, 0, r);
    await predict(fen, 1, 1, r);
    await predict(fen, 2, 2, r);
    await predict(fen, 3, 3, r);
    await predict(fen, 4, 5, r);
    await predict(fen, 5, 4, r);
    await predict(fen, 6, 8, r);
    await predict(fen, 7, 9, r);
    const t2 = Date.now();
    console.log('Predict time: ' + (t2 - t1));

    r = _.sortBy(r, function(x) {
        return -x.weight;
    });

    let result = [];
    let sz = 0;
    while (sz < r.length - 1) {
        if ((sz > 0) && (r[sz].weight * coeff < r[sz - 1].weight)) break;
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
