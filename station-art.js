(() => {
  'use strict';

  const canvas = document.getElementById('station-art');
  const ctx = canvas.getContext('2d');
  const colors = {
    navy: '#395189', blue: '#48669b', orange: '#f5aa26', orangeShade: '#d88919',
    sky: '#409ec8', skyShade: '#3388af', steel: '#93b1c7', ink: '#233343',
    surface: '#f7f7f7', white: '#fff',
  };

  function shape(color, path) {
    ctx.fillStyle = color;
    ctx.fill(new Path2D(path));
  }

  function ellipse(color, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function rect(color, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function wheel(x, y) {
    ellipse(colors.ink, x, y, 18, 23);
    ellipse('#b7cbd8', x, y, 9, 13);
    ellipse('#71879c', x, y, 3, 5);
  }

  function draw() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const scale = Math.min(width / 560, height / 340);
    ctx.setTransform(scale * ratio, 0, 0, scale * ratio, (width - 560 * scale) * ratio / 2, (height - 340 * scale) * ratio / 2);

    // Forecourt and the two faces of the canopy.
    shape('#e4eaf0', 'M39 270 L344 247 L535 303 L236 328 Z');
    shape('#d5dfe8', 'M39 270 L236 328 L535 303 L535 311 L236 337 L39 278 Z');
    ellipse('#c8d6e1', 374, 293, 137, 21);
    for (const [x, y, height] of [[103, 124, 151], [281, 110, 163], [458, 109, 158]]) {
      shape(colors.steel, `M${x} ${y} h16 v${height} l-16 2 Z`);
      shape('#b3cbd9', `M${x} ${y} l-8 -3 v${height} l8 5 Z`);
    }
    shape(colors.steel, 'M54 116 L293 82 L511 111 L465 146 L218 133 Z');
    shape('#afc4d3', 'M54 116 L218 133 L465 146 L465 151 L220 138 Z');
    shape(colors.blue, 'M54 80 L293 38 L293 70 L54 105 Z');
    shape(colors.navy, 'M293 38 L511 72 L511 99 L293 70 Z');
    shape(colors.orange, 'M54 105 L293 70 V82 L54 116 Z');
    shape(colors.orangeShade, 'M293 70 L511 99 V111 L293 82 Z');
    ellipse('#e8eef2', 181, 122, 12, 4);
    ellipse('#e8eef2', 408, 129, 12, 4);

    // Pumps and their shared island.
    shape('#afc4d3', 'M88 275 L244 260 L292 272 L133 289 Z');
    shape('#8aa8bd', 'M88 275 L133 289 L292 272 V279 L133 297 L88 283 Z');
    rect(colors.blue, 124, 189, 42, 84, 5);
    shape(colors.navy, 'M161 190 L170 196 V271 L161 273 Z');
    rect('#d4e3ed', 132, 199, 20, 13, 2);
    rect(colors.ink, 135, 202, 14, 6, 1);
    shape(colors.orange, 'M142 225 Q136 234 136 238 A6 6 0 1 0 148 238 Q148 234 142 225 Z');
    ctx.beginPath();
    ctx.moveTo(190, 199);
    ctx.bezierCurveTo(176, 200, 179, 220, 178, 240);
    ctx.bezierCurveTo(177, 248, 171, 248, 169, 244);
    ctx.lineWidth = 3;
    ctx.strokeStyle = colors.ink;
    ctx.stroke();
    rect(colors.orange, 188, 151, 56, 121, 5);
    shape(colors.orangeShade, 'M240 153 L252 158 V268 L240 271 Z');
    rect('#fff2d7', 196, 165, 35, 26, 2);
    rect(colors.ink, 201, 170, 25, 11, 1);
    rect(colors.steel, 204, 174, 16, 2, 1);
    ellipse('#fff2d7', 215, 222, 11, 11);
    shape(colors.blue, 'M215 213 Q209 222 209 225 A6 6 0 1 0 221 225 Q221 222 215 213 Z');

    // The front of the car overlaps the island.
    wheel(331, 291);
    wheel(484, 289);
    shape(colors.skyShade, 'M251 265 Q255 251 276 242 L307 235 Q332 199 364 187 Q382 181 427 184 Q453 186 471 200 L502 226 Q517 235 522 253 L528 274 Q526 283 507 285 A24 24 0 0 0 460 290 L355 298 A24 24 0 0 0 307 299 L270 295 Q246 292 249 280 Z');
    shape(colors.sky, 'M251 265 Q255 249 276 242 L307 235 Q332 199 364 187 Q382 181 427 184 Q452 186 464 199 L490 227 Q438 237 399 241 L362 246 Q353 263 341 267 L298 277 L250 278 Z');
    shape(colors.ink, 'M320 234 Q338 209 360 198 Q377 189 404 191 L382 226 Q354 232 320 234 Z');
    shape(colors.ink, 'M412 192 L427 193 Q444 194 454 201 L470 223 L390 226 Z');
    shape(colors.skyShade, 'M432 194 L440 194 L449 224 L441 224 Z');
    shape('#c5e7f1', 'M323 234 Q349 207 366 200 L374 197 Q356 210 344 232 Z');
    shape('#eaf4f9', 'M250 264 L271 260 L274 269 L250 272 Z M312 256 L342 248 L337 259 L312 265 Z');
    shape(colors.ink, 'M275 265 L310 262 L304 276 L279 279 Z');
    shape('#3e5e73', 'M278 268 L307 266 L306 268 L279 270 Z M280 273 L305 270 L304 272 L281 275 Z');
    shape('#255779', 'M251 281 L307 282 L309 288 L252 288 Z M357 288 L460 280 L460 286 L357 294 Z');
    rect(colors.surface, 280, 282, 21, 5, 1);
  }

  new ResizeObserver(draw).observe(canvas);
})();
