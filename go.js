"use strict";

const tf = require('@tensorflow/tfjs');
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

function InitializeFromFen(fen, forbidden) {
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
        board[row * SIZE + col] = piece;
        forbidden.push(row * SIZE + col);
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

async function FindMove(fen, callback) {
    const t0 = Date.now();
    if (model === null) {
        model = await tf.loadLayersModel(URL);
        console.log(tf.getBackend());
    }
    let forbidden = [];
    const data = InitializeFromFen(fen, forbidden);
    const t1 = Date.now();
    console.log('Load time: ' + (t1 - t0));

    const prediction = await model.predict(data);
    const result = await prediction.data();
    const t2 = Date.now();
    console.log('Predict time: ' + (t2 - t1));

    data.dispose();
    prediction.dispose();
    if (forbidden.length < 10) {
        forbidden.push(180);
    }
//  console.log(forbidden);

    let r = []; const eps = 1e-6; let s = 0;
    for (let i = 0; i < result.length; i++) {
         if (_.indexOf(forbidden, i) >= 0) continue;
         let p = result[i] * result[i] * result[i];
/*       if (p < eps) p = eps;
         if (p > 1 - eps) p = 1 - eps;*/
         s += p;
         r.push({
             pos: i,
             weight: p
         });
    }
/*  _.each(r, function(x) {
        x.weight = x.weight / s;
    });*/
    r = _.sortBy(r, function(x) {
        return -x.weight;
    });

    let sz = r.length; let ix = 0;
    if (sz < 1) return; sz = 1;
    while (sz < Math.min(r.length - 1, 5)) {
        if (r[sz].weight * 10 < r[sz - 1].weight) break;
        sz++;
    }
    for (let i = 0; i < sz; i++) {
        console.log(FormatMove(r[i].pos) + ': ' + r[i].weight);
    }
    if (sz > 1) {
        if (sz > 5) sz = 5;
        ix = _.random(0, sz - 1);
    }

    fen = ApplyMove(fen, r[ix].pos);
    callback(r[ix].pos, fen, r[ix].weight * 1000, t2 - t0);
}

module.exports.FindMove = FindMove;
module.exports.FormatMove = FormatMove;
