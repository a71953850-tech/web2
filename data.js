/* Shared data model. All reads and transforms run on the user's device. */
(function (root) {
  'use strict';

  const fuels = ['고급휘발유', '휘발유', '경유', '실내등유'];
  const fields = {
    station: ['주유소명', '시도명', '시군구명', '소재지도로명주소', '소재지지번주소', '위도', '경도'],
    price: ['지역', '상호', '주소', '기간', ...fuels],
  };
  const provinceAliases = {
    '11': ['서울', '서울시'], '26': ['부산', '부산시'], '27': ['대구', '대구시'],
    '28': ['인천', '인천시'],
    '12': ['전남광주', '광주전남', '광주전남통합특별시', '전라남도', '전남', '광주광역시', '광주', '광주시'],
    '30': ['대전', '대전시'], '31': ['울산', '울산시'], '36': ['세종', '세종시'],
    '41': ['경기'], '51': ['강원', '강원도'], '43': ['충북'], '44': ['충남'],
    '47': ['경북'], '48': ['경남'], '50': ['제주', '제주도'], '52': ['전북', '전라북도'],
  };

  function decodeCsv(bytes) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder('euc-kr', { fatal: true }).decode(bytes);
    }
  }

  function readCsv(bytes, type) {
    let csv;
    try { csv = decodeCsv(bytes); }
    catch { throw new Error('문자 인코딩을 읽을 수 없습니다. CP949 또는 UTF-8 CSV를 선택하세요.'); }

    const records = [];
    let record = [];
    let value = '';
    let state = 'start';
    function endValue() {
      record.push(value);
      value = '';
      state = 'start';
    }
    function endRecord() {
      endValue();
      if (record.length > 1 || record[0].trim()) records.push(record);
      record = [];
    }
    for (let index = 0; index < csv.length; index++) {
      const character = csv[index];
      if (state === 'quoted') {
        if (character !== '"') value += character;
        else if (csv[index + 1] === '"') { value += '"'; index++; }
        else state = 'closed';
        continue;
      }
      if (character === ',') endValue();
      else if (character === '\r' || character === '\n') {
        endRecord();
        if (character === '\r' && csv[index + 1] === '\n') index++;
      } else if (character === '"' && state === 'start') state = 'quoted';
      else if (state === 'closed') throw new Error(`${records.length + 1}번째 레코드의 따옴표 형식을 확인하세요.`);
      else { value += character; state = 'plain'; }
    }
    if (state === 'quoted') throw new Error(`${records.length + 1}번째 레코드의 닫는 따옴표가 없습니다.`);
    if (record.length || value || state !== 'start') endRecord();

    const header = records.shift();
    if (!header) throw new Error('CSV 헤더가 없습니다.');
    const columns = new Map();
    header.forEach((column, index) => {
      const key = column.trim();
      if (columns.has(key)) throw new Error(`중복된 열 이름이 있습니다. (${key})`);
      columns.set(key, index);
    });
    const missing = fields[type].filter(column => !columns.has(column));
    if (missing.length) throw new Error(`필수 열이 없습니다. (${missing.join(', ')})`);
    if (type === 'price' && records[0]?.[0].trim().match(/^기준\s*:\s*일간\s*\(/) && records[0].slice(1).every(cell => !cell.trim())) {
      records.shift();
    }
    const malformed = records.findIndex(row => row.length !== header.length);
    if (malformed !== -1) throw new Error(`${malformed + 1}번째 데이터 행의 열 개수가 헤더와 다릅니다.`);
    return { header, rows: records, get: (row, column) => row[columns.get(column)] ?? '' };
  }

  function writeCsv(header, rows) {
    const line = row => row.map(cell => /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell).join(',');
    return '\uFEFF' + [line(header), ...rows.map(line)].join('\r\n') + '\r\n';
  }

  function normalize(value) {
    return value.normalize('NFKC').toLowerCase().replace(/[‐‑–−]/g, '-');
  }

  function compact(value) {
    return normalize(value).replace(/[^\p{L}\p{N}-]/gu, '');
  }

  function stationName(value) {
    return compact(normalize(value).replace(/\(\s*주\s*\)|주식회사|유한회사|\(\s*유\s*\)/g, ''));
  }

  function addressKeys(value, remainder) {
    const withoutNote = normalize(value).replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim();
    const primary = remainder(withoutNote);
    const keys = new Set();
    if (/\d/.test(primary)) keys.add(primary);
    // Road addresses may include an 읍 or 면 before the road name in one source.
    const road = /^(?:\S+?읍|\S+?면)\s+(.+(?:로|길|거리)\s*\d+(?:-\d+)?)$/.exec(primary);
    if (road) keys.add(road[1]);
    return [...new Set([...keys].map(compact))];
  }

  function boundsOf(rings) {
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ring of rings) {
      for (const [x, y] of ring) {
        if (x < bounds[0]) bounds[0] = x;
        if (y < bounds[1]) bounds[1] = y;
        if (x > bounds[2]) bounds[2] = x;
        if (y > bounds[3]) bounds[3] = y;
      }
    }
    return bounds;
  }

  function containsBounds(bounds, [x, y]) {
    return x >= bounds[0] && x <= bounds[2] && y >= bounds[1] && y <= bounds[3];
  }

  function inRing([x, y], ring) {
    let inside = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const [ax, ay] = ring[previous];
      const [bx, by] = ring[index];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
    return inside;
  }

  function insideTown(point, town) {
    return town.polygons.some(({ rings, bounds }) => containsBounds(bounds, point) && inRing(point, rings[0]) && !rings.slice(1).some(ring => inRing(point, ring)));
  }

  function addTo(index, key, value) {
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(value);
  }

  function isWithin(region, ancestor) {
    for (let current = region; current; current = current.parent) {
      if (current === ancestor) return true;
    }
    return false;
  }

  function intersectRegions(first, second) {
    if (!first || !second) return first || second;
    if (isWithin(first, second)) return first;
    if (isWithin(second, first)) return second;
    return null;
  }

  function aliasPattern(value) {
    return [...compact(value)].map(character => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
  }

  function makeAliases(entries) {
    return entries.sort((first, second) => compact(second[0]).length - compact(first[0]).length)
      .map(([alias, region]) => [new RegExp(`^${aliasPattern(alias)}`), region]);
  }

  function stripAlias(text, aliases, { wholeWord = false } = {}) {
    for (const [pattern, region] of aliases) {
      const match = pattern.exec(text);
      if (!match) continue;
      const rest = text.slice(match[0].length);
      if (wholeWord && rest && !/^[\s,]/.test(rest)) continue;
      return { region, rest: rest.replace(/^[\s,]+/, '') };
    }
    return { region: null, rest: text };
  }

  function createCatalog(geo) {
    const regions = new Map();
    const provinces = [];
    const towns = [];
    const byName = (first, second) => first.name.localeCompare(second.name, 'ko', { numeric: true });
    function area(id, name, parent) {
      if (!regions.has(id)) {
        const region = { id, name, parent, children: [], towns: [] };
        regions.set(id, region);
        if (parent) parent.children.push(region);
        else provinces.push(region);
      }
      return regions.get(id);
    }
    for (const { properties, geometry } of geo.features) {
      const { sido, sidonm, sgg, sggnm, adm_cd, adm_nm } = properties;
      const province = area(`s:${sido}`, sidonm, null);
      const cityWard = /^(.*?시)\s*(.+구)$/.exec(sggnm);
      const city = cityWard ? area(`c:${sido}:${cityWard[1]}`, cityWard[1], province) : null;
      const district = area(`d:${sgg}`, cityWard ? `${cityWard[1]} ${cityWard[2]}` : sggnm, city || province);
      const town = area(`t:${adm_cd}`, adm_nm.trim().split(/\s+/).at(-1), district);
      const coordinates = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      town.polygons = (town.polygons || []).concat(coordinates.map(rings => ({ rings, bounds: boundsOf(rings.slice(0, 1)) })));
      if (town.towns.length) continue;
      towns.push(town);
      for (let current = town; current; current = current.parent) current.towns.push(town);
    }
    const aliases = makeAliases(provinces.flatMap(province => [province.name, ...(provinceAliases[province.id.slice(2)] || [])].map(alias => [alias, province])));
    for (const province of provinces) {
      const districts = [...new Set(province.towns.map(town => town.parent))];
      const entries = [];
      for (const district of districts) {
        entries.push([district.name, district]);
        if (district.parent !== province) entries.push([district.parent.name, district.parent]);
      }
      province.districtAliases = makeAliases(entries);
      for (const city of province.children.filter(region => region.id.startsWith('c:'))) {
        city.wardAliases = makeAliases(city.children.map(ward => [ward.name.slice(city.name.length).trim(), ward]));
      }
    }
    for (const region of regions.values()) {
      region.children.sort(byName);
      region.towns.sort(byName);
    }
    function provinceOf(region) {
      while (region?.parent) region = region.parent;
      return region;
    }
    function location(value, hint, address = false) {
      const text = normalize(value).trim();
      // Prefer the explicit province, while avoiding short prefixes in bare road names.
      const detectedProvince = stripAlias(text, aliases, { wholeWord: address });
      const joinedProvince = detectedProvince.region || !address ? detectedProvince : stripAlias(text, aliases);
      const joinedDistrict = joinedProvince.region && joinedProvince.region !== detectedProvince.region
        ? stripAlias(joinedProvince.rest, joinedProvince.region.districtAliases) : null;
      const acceptJoined = joinedDistrict?.region && joinedDistrict.rest !== joinedProvince.rest;
      let provinceMatch = acceptJoined ? joinedProvince : detectedProvince;
      const hintedProvince = provinceOf(hint);
      if (address && hintedProvince && provinceMatch.region && provinceMatch.region !== hintedProvince) {
        const localDistrict = stripAlias(text, hintedProvince.districtAliases, { wholeWord: true });
        // A district such as 경기도 광주시 can share a spelling with a province alias.
        if (localDistrict.region && localDistrict.rest === provinceMatch.rest) provinceMatch = { region: null, rest: text };
      }
      const province = provinceMatch.region || hintedProvince;
      if (!province) return { region: null, rest: text };
      if (provinceMatch.region && !provinceMatch.rest && province.id === 's:36') {
        return { region: province.children[0] || province, rest: '' };
      }
      const districtMatch = stripAlias(provinceMatch.rest, province.districtAliases);
      const city = districtMatch.region?.id.startsWith('c:') ? districtMatch.region : hint?.id.startsWith('c:') ? hint : hint?.parent?.id.startsWith('c:') ? hint.parent : null;
      if (city && (!districtMatch.region || districtMatch.region === city)) {
        const wardMatch = stripAlias(districtMatch.rest, city.wardAliases);
        if (wardMatch.region) return wardMatch;
      }
      return { region: districtMatch.region || (provinceMatch.region ? province : hint), rest: districtMatch.rest };
    }
    function townByAddress(area, addresses) {
      if (!area?.parent) return null;
      const matched = new Set();
      for (const address of addresses) {
        const { rest } = location(address, area, true);
        const tokens = new Set((rest.match(/[\p{L}\p{N}]+/gu) || []).map(compact));
        for (const town of area.towns) {
          if (tokens.has(compact(town.name))) matched.add(town);
        }
      }
      return matched.size === 1 ? [...matched][0] : null;
    }
    return { regions, provinces, towns, location, provinceOf, townByAddress };
  }

  function coordinates(latitude, longitude) {
    if (!latitude.trim() || !longitude.trim()) return null;
    const x = Number(longitude), y = Number(latitude);
    return x >= 123 && x <= 133 && y >= 32 && y <= 40 ? [x, y] : null;
  }

  function calendarDate(value) {
    if (!/^\d{8}$/.test(value)) return false;
    const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    const date = new Date(`${iso}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().startsWith(iso);
  }

  function buildDataset(catalog, stationCsv, priceCsv) {
    const lookup = new Map();
    const stations = stationCsv.rows.map((row, id) => {
      const get = column => stationCsv.get(row, column);
      const name = get('주유소명');
      const addresses = [get('소재지도로명주소'), get('소재지지번주소')];
      const location = catalog.location(`${get('시도명')} ${get('시군구명')}`).region;
      const position = coordinates(get('위도'), get('경도'));
      const coordinateTown = position && location?.towns.find(town => insideTown(position, town));
      const region = coordinateTown || catalog.townByAddress(location, addresses) || location;
      const station = { id, row, name, region, position, addresses, brand: get('상표구분명'), prices: new Map(), ambiguous: false };
      const province = catalog.provinceOf(region);
      const keyName = stationName(name);
      if (province && keyName) {
        const keys = new Set(addresses.flatMap(address => addressKeys(address, value => catalog.location(value, coordinateTown?.parent || location, true).rest)));
        for (const key of keys) addTo(lookup, `${province.id}|${keyName}|${key}`, station);
      }
      return station;
    });

    const locations = new Map();
    const prices = priceCsv.rows.map(row => {
      const get = column => priceCsv.get(row, column);
      const address = get('주소');
      const name = stationName(get('상호'));
      const locationKey = JSON.stringify([get('지역'), address, name]);
      if (!locations.has(locationKey)) {
        const given = catalog.location(get('지역')).region;
        const fromAddress = catalog.location(address, given, true).region;
        const region = intersectRegions(given, fromAddress);
        const province = catalog.provinceOf(region);
        const keys = addressKeys(address, value => catalog.location(value, region, true).rest);
        const matches = new Set(province && name ? keys.flatMap(key => lookup.get(`${province.id}|${name}|${key}`) || []) : []);
        for (const station of matches) {
          if (!intersectRegions(station.region, region)) matches.delete(station);
        }
        const station = matches.size === 1 ? [...matches][0] : null;
        if (matches.size > 1) for (const candidate of matches) candidate.ambiguous = true;
        const addressTown = catalog.townByAddress(region, [address]);
        // A legal-dong address may use the same name as a different administrative-dong area.
        const resolved = intersectRegions(region, station?.region) || region;
        const priceRegion = addressTown && station?.region?.id.startsWith('t:') && addressTown !== station.region
          ? addressTown.parent : addressTown || resolved;
        locations.set(locationKey, { region: priceRegion, station });
      }
      const { region, station } = locations.get(locationKey);
      const date = get('기간').trim();
      if (station && calendarDate(date)) {
        const values = fuels.map(fuel => get(fuel));
        if (!station.prices.has(date)) station.prices.set(date, []);
        const forDate = station.prices.get(date);
        if (!forDate.some(record => record.values.every((value, index) => value.trim() === values[index].trim()))) {
          forDate.push({ values, brand: get('상표') });
        }
      }
      return { row, region };
    });
    return { stations, prices };
  }

  function resultsFor(items, selected) {
    const rows = [];
    let unknown = 0;
    for (const item of items) {
      if (isWithin(item.region, selected)) rows.push(item);
      else if (!item.region || isWithin(selected, item.region)) unknown++;
    }
    return { rows, unknown };
  }

  const api = { fuels, readCsv, writeCsv, createCatalog, buildDataset, resultsFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FuelData = api;
})(globalThis);
