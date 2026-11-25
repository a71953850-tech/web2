(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const { createCatalog, readCsv, buildDataset, resultsFor, writeCsv, fuels } = FuelData;
  const files = {
    station: { csv: null, status: 'CSV 파일을 선택하세요.', error: false, token: 0 },
    price: { csv: null, status: 'CSV 파일을 선택하세요.', error: false, token: 0 },
  };
  const views = {
    extract: ['지역 자료 추출', '두 CSV를 업로드하고 원하는 지역의 자료를 저장하세요.'],
    map: ['주유소 지도·가격 조회', '지역의 주유소 위치와 날짜별 판매가격을 확인하세요.'],
  };
  const map = new RegionMap($('region-map'), id => {
    setStation(id);
    $('station-detail').scrollIntoView({ block: 'nearest' });
  });
  const empty = [];
  const number = new Intl.NumberFormat('ko-KR');
  let catalog = null;
  let geoError = false;
  let dataset = null;
  let view = '';
  let selected = null;
  let selectedStation = null;
  let visibleStations = new Map();
  let currentResults = null;

  function element(tag, label, className) {
    const node = document.createElement(tag);
    if (label != null) node.textContent = label;
    if (className) node.className = className;
    return node;
  }

  function options(select, placeholder, entries) {
    select.replaceChildren(new Option(placeholder, ''), ...entries.map(([id, name]) => new Option(name, id)));
  }

  function renderRegionOptions(level) {
    const provinceInput = $('province'), districtInput = $('district'), townInput = $('town');
    if (level === 'initialize') {
      options(provinceInput, '시·도 선택', (catalog?.provinces || []).map(region => [region.id, region.name]));
      provinceInput.disabled = !catalog;
    }
    const province = catalog?.regions.get(provinceInput.value);
    if (level !== 'district') {
      const districts = province?.children.flatMap(region => region.id.startsWith('c:')
        ? [[region.id, `${region.name} 전체`], ...region.children.map(child => [child.id, child.name])]
        : [[region.id, region.name]]) || [];
      options(districtInput, '시·군·구 전체', districts);
      districtInput.disabled = !province;
    }
    const district = catalog?.regions.get(districtInput.value);
    options(townInput, '읍·면·동 전체', (district?.towns || []).map(town => [town.id, town.name + (district.id.startsWith('c:') ? ` (${town.parent.name})` : '')]));
    townInput.disabled = !district;
  }

  function renderFileStatus(type) {
    const status = $(`${type}-status`);
    status.textContent = files[type].status;
    status.classList.toggle('error', files[type].error);
    $(`${type}-file`).setAttribute('aria-invalid', String(files[type].error));
  }

  function rebuild() {
    dataset = catalog && files.station.csv && files.price.csv ? buildDataset(catalog, files.station.csv, files.price.csv) : null;
    refreshResults();
  }

  async function upload(type, file) {
    if (!file) return;
    const state = files[type];
    const token = ++state.token;
    state.csv = null;
    state.error = false;
    state.status = `${file.name} 읽는 중…`;
    renderFileStatus(type);
    rebuild();
    try {
      const bytes = await file.arrayBuffer();
      if (token !== state.token) return;
      state.csv = readCsv(bytes, type);
      state.status = `${file.name} · ${number.format(state.csv.rows.length)}행`;
    } catch (error) {
      if (token !== state.token) return;
      state.error = true;
      state.status = `${file.name} · ${error.message}`;
    }
    renderFileStatus(type);
    rebuild();
  }

  function regionLabel(region) {
    const labels = [];
    for (let item = region; item; item = item.parent) {
      if (item.id.startsWith('c:') && labels.length) continue;
      labels.unshift(item.name);
    }
    return labels.join(' ');
  }

  function refreshResults() {
    selected = catalog?.regions.get($('town').value || $('district').value || $('province').value) || null;
    selectedStation = null;
    currentResults = selected && dataset ? {
      station: resultsFor(dataset.stations, selected),
      price: resultsFor(dataset.prices, selected),
    } : null;
    if (view === 'extract') renderExtract();
    if (view === 'map') renderMap();
  }

  function renderExtract() {
    let status = '두 CSV 파일을 업로드해 주세요.';
    if (geoError) status = '행정구역 데이터를 읽을 수 없습니다.';
    else if (dataset && !selected) status = '추출할 지역을 선택하세요.';
    else if (currentResults) {
      const count = currentResults.station.rows.length + currentResults.price.rows.length;
      status = count ? regionLabel(selected) : `${regionLabel(selected)}의 추출 결과가 없습니다.`;
    }
    $('extract-status').textContent = status;
    for (const [type, button] of [['station', 'save-stations'], ['price', 'save-prices']]) {
      const result = currentResults?.[type];
      $(`${type}-count`).textContent = result ? `${number.format(result.rows.length)}행` : '—';
      $(`${type}-unknown`).textContent = result?.unknown ? `지역 판정 제외 ${number.format(result.unknown)}행` : '';
      $(button).disabled = !result;
    }
  }

  function renderMap() {
    const stations = currentResults?.station.rows || empty;
    const located = stations.filter(station => station.position);
    visibleStations = new Map(located.map(station => [station.id, station]));
    map.setView(selected?.towns || empty, located);
    $('map-empty').hidden = Boolean(selected);
    for (const button of ['zoom-in', 'zoom-out', 'zoom-reset']) $(button).disabled = !selected;
    const label = selected ? regionLabel(selected) : '시·도를 선택하세요.';
    const messages = [label];
    if (!currentResults && selected) messages.push('두 CSV를 올리면 주유소가 표시됩니다.');
    if (currentResults) {
      messages.push(`주유소 ${number.format(located.length)}곳`);
      if (stations.length > located.length) messages.push(`좌표 미표시 ${number.format(stations.length - located.length)}곳`);
      if (currentResults.station.unknown) messages.push(`지역 판정 제외 ${number.format(currentResults.station.unknown)}행`);
    }
    $('map-status').textContent = messages.join(' · ');
    $('map-empty').textContent = geoError ? '행정구역 데이터를 읽을 수 없습니다.' : '지역을 선택하면 경계가 표시됩니다.';
    const entries = located.slice().sort((first, second) => first.name.localeCompare(second.name, 'ko'))
      .map(station => [station.id, [station.name || '이름 없음', station.addresses.find(Boolean)].filter(Boolean).join(' · ')]);
    options($('station-choice'), '주유소 선택', entries);
    $('station-choice').disabled = !entries.length;
    renderPrice(null);
  }

  function setStation(id) {
    selectedStation = id;
    $('station-choice').value = id == null ? '' : String(id);
    map.select(id);
    renderPrice(visibleStations.get(selectedStation));
  }

  function displayDate(value) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  function displayPrice(value) {
    const amount = Number(value.trim().replaceAll(',', ''));
    return Number.isFinite(amount) && amount > 0 ? `${number.format(amount)}원/L` : '가격 정보 없음';
  }

  function renderPrice(station) {
    const detail = $('station-detail');
    detail.replaceChildren();
    if (!station) return;
    const summary = element('div', null, 'station-summary');
    const brand = element('p');
    summary.append(element('h3', station.name || '이름 없음'));
    const address = station.addresses.find(value => value.trim());
    if (address) summary.append(element('p', address));
    summary.append(brand);
    brand.textContent = station.brand;
    brand.hidden = !station.brand.trim();
    detail.append(summary);
    if (station.ambiguous) detail.append(element('p', '여러 주유소와 일치하는 가격 기록은 연결에서 제외했습니다.', 'price-warning'));
    const dates = [...station.prices.keys()].sort().reverse();
    if (!dates.length) {
      detail.append(element('p', station.ambiguous ? '확정된 판매가격 기록이 없습니다.' : '이 주유소의 판매가격 기록이 없습니다.', 'field-status'));
      return;
    }
    const dateField = element('div', null, 'date-field');
    const dateLabel = element('label', '기록 날짜');
    const date = element('select');
    date.id = 'price-date';
    dateLabel.htmlFor = date.id;
    date.replaceChildren(...dates.map(value => new Option(displayDate(value), value)));
    dateField.append(dateLabel, date);
    const priceRows = element('div');
    detail.append(dateField, priceRows);

    function showDate() {
      const records = station.prices.get(date.value);
      const brandName = station.brand.trim() || [...new Set(records.map(record => record.brand.trim()).filter(Boolean))].join(' / ');
      brand.textContent = brandName;
      brand.hidden = !brandName;
      priceRows.replaceChildren();
      if (records.length > 1) priceRows.append(element('p', '같은 날짜에 서로 다른 가격이 기록되어 있습니다.', 'price-warning'));
      const scroll = element('div', null, 'table-scroll');
      const table = element('table');
      table.setAttribute('aria-label', `${displayDate(date.value)} 유종별 판매가격`);
      const head = table.createTHead().insertRow();
      const columns = ['유종', ...records.map((_, index) => records.length > 1 ? `기록 ${index + 1}` : '판매가격')];
      head.append(...columns.map(name => {
        const label = element('th', name);
        label.scope = 'col';
        return label;
      }));
      const body = table.createTBody();
      fuels.forEach((fuel, index) => {
        const row = body.insertRow();
        const label = element('th', fuel);
        label.scope = 'row';
        row.append(label, ...records.map(record => element('td', displayPrice(record.values[index]))));
      });
      scroll.append(table);
      priceRows.append(scroll);
    }
    date.addEventListener('change', showDate);
    showDate();
  }

  function save(type) {
    if (!currentResults || !selected) return;
    const { header } = files[type].csv;
    const csv = writeCsv(header, currentResults[type].rows.map(item => item.row));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = element('a');
    link.href = url;
    const safeName = regionLabel(selected).replace(/[\s<>:"/\\|?*]+/g, '_');
    link.download = `${type === 'station' ? '주유소' : '판매가격'}_${safeName}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function navigate(initial = false) {
    const route = location.hash.slice(1);
    view = Object.hasOwn(views, route) ? route : '';
    $('home').hidden = Boolean(view);
    $('workspace').hidden = !view;
    $('extract-view').hidden = view !== 'extract';
    $('map-view').hidden = view !== 'map';
    if (view) {
      $('view-title').textContent = views[view][0];
      $('view-description').textContent = views[view][1];
      if (!initial) $('view-title').focus();
    }
    if (!initial) window.scrollTo(0, 0);
    refreshResults();
  }

  async function loadBoundaries() {
    const bundle = element('script');
    bundle.src = '전국주유소표준데이터/행정구역경계.offline.js';
    const loaded = new Promise((resolve, reject) => {
      bundle.onload = resolve;
      bundle.onerror = reject;
    });
    document.head.append(bundle);
    await loaded;
    const binary = atob(globalThis.OfflineBoundaryGzip);
    delete globalThis.OfflineBoundaryGzip;
    bundle.remove();
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).json();
  }

  for (const type of ['station', 'price']) {
    $(`${type}-file`).addEventListener('change', event => upload(type, event.target.files[0]));
  }
  $('province').addEventListener('change', () => { renderRegionOptions('province'); refreshResults(); });
  $('district').addEventListener('change', () => { renderRegionOptions('district'); refreshResults(); });
  $('town').addEventListener('change', refreshResults);
  $('save-stations').addEventListener('click', () => save('station'));
  $('save-prices').addEventListener('click', () => save('price'));
  $('station-choice').addEventListener('change', event => setStation(event.target.value === '' ? null : Number(event.target.value)));
  $('zoom-in').addEventListener('click', () => map.changeZoom(1.4));
  $('zoom-out').addEventListener('click', () => map.changeZoom(1 / 1.4));
  $('zoom-reset').addEventListener('click', () => map.fit());
  window.addEventListener('hashchange', () => navigate());

  renderRegionOptions('initialize');
  navigate(true);
  $('geo-status').textContent = '행정구역 경계를 불러오는 중…';
  loadBoundaries().then(geo => {
    catalog = createCatalog(geo);
    renderRegionOptions('initialize');
    $('geo-status').textContent = '';
    rebuild();
  }).catch(error => {
    console.error(error);
    geoError = true;
    $('geo-status').classList.add('error');
    $('geo-status').textContent = '행정구역 파일을 불러오지 못했습니다. 데이터 폴더와 브라우저 버전을 확인하세요.';
    refreshResults();
  });
})();
