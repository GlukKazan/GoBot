"use strict";

const tf = require('@tensorflow/tfjs');
const _ = require('underscore');

const URL = 'https://games.dtco.ru/model/model.json';
const SIZE = 19;

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
        }
        col++;
        ix++;
    }

    return r;
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
        }
        board[row * SIZE + col] = piece;
        forbidden.push(row * SIZE + col);
        col++;
    }

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
    const model = await tf.loadLayersModel(URL);
    let forbidden = [];
    const data = InitializeFromFen(fen, forbidden);

    const prediction = await model.predict(data);
    data.dispose();

    const result = await prediction.data();
    prediction.dispose();

    let ix = null; let mx = null;
    for (let i = 0; i < result.length; i++) {
         if (_.indexOf(forbidden, i) >= 0) continue;
         if ((mx === null) || (mx < result[i])) {
             mx = result[i];
             ix = i;
         }
    }

    fen = ApplyMove(fen, ix);
    callback(ix, fen, mx * 1000);
}

module.exports.FindMove = FindMove;
module.exports.FormatMove = FormatMove;
