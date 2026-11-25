(function (root) {
  'use strict';

  // Longitude is scaled for the latitude of the Korean peninsula.
  const longitudeScale = 0.81;
  const mapColors = ['#d5e4ee', '#dce7f1', '#c9dce9', '#e0e8f0'];

  class RegionMap {
    constructor(canvas, onSelect) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d');
      this.onSelect = onSelect;
      this.towns = [];
      this.stations = [];
      this.markerScreen = [];
      this.zoom = 1;
      this.selected = null;
      this.frame = 0;
      new ResizeObserver(() => this.schedule()).observe(canvas);
      this.bindControls();
    }

    setView(areas, stations = [], selected = null) {
      const changed = this.towns !== areas;
      this.towns = areas;
      this.stations = stations.filter(station => station.position);
      this.selected = selected;
      this.canvas.classList.toggle('active', areas.length > 0);
      if (changed) this.fit();
      else this.schedule();
    }

    fit() {
      const bounds = [Infinity, Infinity, -Infinity, -Infinity];
      for (const town of this.towns) {
        for (const polygon of town.polygons) {
          const box = polygon.bounds;
          bounds[0] = Math.min(bounds[0], box[0]);
          bounds[1] = Math.min(bounds[1], box[1]);
          bounds[2] = Math.max(bounds[2], box[2]);
          bounds[3] = Math.max(bounds[3], box[3]);
        }
      }
      for (const { position: [x, y] } of this.stations) {
        if (x < bounds[0]) bounds[0] = x;
        if (y < bounds[1]) bounds[1] = y;
        if (x > bounds[2]) bounds[2] = x;
        if (y > bounds[3]) bounds[3] = y;
      }
      this.bounds = bounds;
      this.center = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
      this.zoom = 1;
      this.schedule();
    }

    select(id) {
      this.selected = id;
      this.schedule();
    }

    project([longitude, latitude], width, height, scale) {
      return [width / 2 + (longitude - this.center[0]) * scale * longitudeScale, height / 2 - (latitude - this.center[1]) * scale];
    }

    changeZoom(factor, x = this.canvas.clientWidth / 2, y = this.canvas.clientHeight / 2) {
      if (!this.towns.length || !this.scale) return;
      const next = Math.max(0.55, Math.min(32, this.zoom * factor));
      const difference = (1 - this.zoom / next) / this.scale;
      this.center[0] += (x - this.canvas.clientWidth / 2) * difference / longitudeScale;
      this.center[1] -= (y - this.canvas.clientHeight / 2) * difference;
      this.zoom = next;
      this.schedule();
    }

    schedule() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.draw();
      });
    }

    draw() {
      const { canvas, context: ctx } = this;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      this.markerScreen = [];
      if (!this.towns.length) return;

      const padding = 42;
      const [west, south, east, north] = this.bounds;
      const baseScale = Math.min(Math.max(20, width - 2 * padding) / Math.max((east - west) * longitudeScale, 0.004), Math.max(20, height - 2 * padding) / Math.max(north - south, 0.004));
      const scale = this.scale = baseScale * this.zoom;
      const px = scale * longitudeScale;
      const offsetX = width / 2 - this.center[0] * px;
      const offsetY = height / 2 + this.center[1] * scale;
      const positions = new Map();
      for (const town of this.towns) {
        let province = town;
        while (province.parent) province = province.parent;
        ctx.fillStyle = mapColors[Number(province.id.slice(2)) % mapColors.length];
        ctx.strokeStyle = '#395189';
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        let visible = false;
        for (const { rings, bounds } of town.polygons) {
          const left = bounds[0] * px + offsetX, right = bounds[2] * px + offsetX;
          const top = offsetY - bounds[3] * scale, bottom = offsetY - bounds[1] * scale;
          if (right < -2 || left > width + 2 || bottom < -2 || top > height + 2 || Math.max(right - left, bottom - top) < 0.32) continue;
          visible = true;
          for (const ring of rings) {
            let lastX = ring[0][0] * px + offsetX, lastY = offsetY - ring[0][1] * scale;
            ctx.moveTo(lastX, lastY);
            for (let index = 1; index < ring.length; index++) {
              const x = ring[index][0] * px + offsetX, y = offsetY - ring[index][1] * scale;
              if (Math.abs(x - lastX) + Math.abs(y - lastY) < 0.62) continue;
              ctx.lineTo(x, y);
              lastX = x;
              lastY = y;
            }
            ctx.closePath();
          }
          const area = (right - left) * (bottom - top);
          if (area > 3600 && area > (positions.get(town)?.area || 0)) positions.set(town, { x: (left + right) / 2, y: (top + bottom) / 2, area });
        }
        if (visible) {
          ctx.fill('evenodd');
          ctx.stroke();
        }
      }

      this.drawLabels(positions, width, height);
      const active = this.stations.find(station => station.id === this.selected);
      for (const station of this.stations) {
        if (station !== active) this.drawMarker(station, width, height, scale, false);
      }
      if (active) this.drawMarker(active, width, height, scale, true);
    }

    drawLabels(positions, width, height) {
      const ctx = this.context;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '600 12px system-ui';
      ctx.fillStyle = '#233343';
      ctx.strokeStyle = '#f7f7f7';
      ctx.lineWidth = 3;
      const used = [];
      for (const [town, { x, y }] of [...positions].sort((a, b) => b[1].area - a[1].area)) {
        if (x < 29 || x > width - 29 || y < 14 || y > height - 14 || used.some(p => Math.abs(p.x - x) < 75 && Math.abs(p.y - y) < 22)) continue;
        used.push({ x, y });
        ctx.strokeText(town.name, x, y);
        ctx.fillText(town.name, x, y);
      }
    }

    drawMarker(station, width, height, scale, active) {
      const ctx = this.context;
      const [x, y] = this.project(station.position, width, height, scale);
      if (x < -10 || y < -10 || x > width + 10 || y > height + 10) return;
      this.markerScreen.push({ id: station.id, x, y });
      const radius = active ? 8 : this.stations.length > 250 ? 3.5 : 5.5;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#f5aa26';
      ctx.strokeStyle = '#395189';
      ctx.lineWidth = active ? 2.5 : 1.4;
      ctx.fill();
      ctx.stroke();
    }

    bindControls() {
      const canvas = this.canvas;
      let drag = null;
      canvas.addEventListener('pointerdown', event => {
        if (!this.towns.length || event.button !== 0) return;
        canvas.setPointerCapture(event.pointerId);
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, center: [...this.center], moved: false };
      });
      canvas.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.id || !this.scale) return;
        const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
        drag.moved ||= Math.abs(dx) + Math.abs(dy) > 4;
        if (!drag.moved) return;
        canvas.classList.add('dragging');
        this.center = [drag.center[0] - dx / (this.scale * longitudeScale), drag.center[1] + dy / this.scale];
        this.schedule();
      });
      canvas.addEventListener('pointerup', event => {
        if (!drag || event.pointerId !== drag.id) return;
        if (!drag.moved) {
          const box = canvas.getBoundingClientRect();
          const x = event.clientX - box.left, y = event.clientY - box.top;
          let nearest = null, nearestDistance = 11;
          for (const marker of this.markerScreen) {
            const distance = Math.hypot(marker.x - x, marker.y - y);
            if (distance <= nearestDistance) { nearest = marker; nearestDistance = distance; }
          }
          if (nearest) this.onSelect(nearest.id);
        }
        drag = null;
        canvas.classList.remove('dragging');
      });
      canvas.addEventListener('pointercancel', () => {
        drag = null;
        canvas.classList.remove('dragging');
      });
      canvas.addEventListener('wheel', event => {
        if (!event.ctrlKey || !this.towns.length) return;
        event.preventDefault();
        const box = canvas.getBoundingClientRect();
        this.changeZoom(event.deltaY < 0 ? 1.23 : 1 / 1.23, event.clientX - box.left, event.clientY - box.top);
      }, { passive: false });
    }
  }

  root.RegionMap = RegionMap;
})(globalThis);
