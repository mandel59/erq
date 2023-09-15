/**
 * @param {number} wkbGeometryType 
 */
export function getGeometryType(wkbGeometryType) {
  switch (wkbGeometryType % 1000) {
    case 1: return "Point";
    case 2: return "LineString";
    case 3: return "Polygon";
    case 4: return "MultiPoint";
    case 5: return "MultiLineString";
    case 6: return "MultiPolygon";
    default: throw new Error("Invalid geometry type");
  }
}

/**
 * @param {number} wkbGeometryType 
 */
export function getPointType(wkbGeometryType) {
  switch (wkbGeometryType - wkbGeometryType % 1000) {
    case 0: return "XY";
    case 1000: return "XYZ";
    case 2000: return "XYM";
    case 3000: return "XYZM";
    default: throw new Error("Invalid geometry type");
  }
}

/**
 * @param {"XY" | "XYZ" | "XYM" | "XYZM"} pointType 
 */
export function getSizeOfPointType(pointType) {
  switch (pointType) {
    case "XY": return 16;
    case "XYZ": return 24;
    case "XYM": return 24;
    case "XYZM": return 32;
    default: throw new Error("Invalid point type");
  }
}

/**
 * @param {"XY" | "XYZ" | "XYM" | "XYZM"} pointType 
 * @returns {(view: DataView, offset: number, littleEndian: boolean) => { x: number, y: number, z?: number, m?: number }}
 */
export function getParserOfPointType(pointType) {
  switch (pointType) {
    case "XY": return parsePoint;
    case "XYZ": return parsePointZ;
    case "XYM": return parsePointM;
    case "XYZM": return parsePointZM;
    default: throw new Error("Invalid point type");
  }
}

/**
 * @param {DataView} view 
 * @param {number} offset
 * @param {boolean} littleEndian 
 */
function parsePoint(view, offset, littleEndian) {
  const x = view.getFloat64(offset + 0, littleEndian);
  const y = view.getFloat64(offset + 8, littleEndian);
  return { x, y };
}

/**
 * @param {DataView} view 
 * @param {number} offset
 * @param {boolean} littleEndian 
 */
function parsePointZ(view, offset, littleEndian) {
  const x = view.getFloat64(offset + 0, littleEndian);
  const y = view.getFloat64(offset + 8, littleEndian);
  const z = view.getFloat64(offset + 16, littleEndian);
  return { x, y, z };
}

/**
 * @param {DataView} view 
 * @param {number} offset
 * @param {boolean} littleEndian 
 */
function parsePointM(view, offset, littleEndian) {
  const x = view.getFloat64(offset + 0, littleEndian);
  const y = view.getFloat64(offset + 8, littleEndian);
  const m = view.getFloat64(offset + 16, littleEndian);
  return { x, y, m };
}

/**
 * @param {DataView} view 
 * @param {number} offset
 * @param {boolean} littleEndian 
 */
function parsePointZM(view, offset, littleEndian) {
  const x = view.getFloat64(offset + 0, littleEndian);
  const y = view.getFloat64(offset + 8, littleEndian);
  const z = view.getFloat64(offset + 16, littleEndian);
  const m = view.getFloat64(offset + 24, littleEndian);
  return { x, y, z, m };
}

/**
 * @param {DataView} view 
 */
export function parseGeoPackageBinaryHeader(view) {
  const magic = view.getUint16(0, false);
  if (magic !== 0x4750) {
    throw new Error("Invalid magic number");
  }
  const version = view.getUint8(2);
  const flags = view.getUint8(3);
  const reserved1 = flags & 0b11000000;
  if (reserved1 !== 0) {
    throw new Error("Invalid reserved1");
  }
  const isExtended = Boolean(flags & 0b00100000);
  const isEmpty = Boolean(flags & 0b00010000);
  const envelopeIndicator = (flags & 0b00001110) >> 1;
  const endianness = flags & 0b00000001;
  const littleEndian = endianness === 1;
  const srsId = view.getUint32(4, littleEndian);
  let envelopeLength
  switch (envelopeIndicator) {
    case 0: envelopeLength = 0; break;
    case 1: envelopeLength = 4; break;
    case 2: envelopeLength = 6; break;
    case 3: envelopeLength = 6; break;
    case 4: envelopeLength = 8; break;
    default: throw new Error("Invalid envelope indicator");
  }
  const envelope = [];
  for (let i = 0; i < envelopeLength; i++) {
    envelope.push(view.getFloat64(8 + i * 8, littleEndian));
  }
  const headerLength = 8 + envelopeLength * 8;
  return {
    version,
    isExtended,
    isEmpty,
    envelopeIndicator,
    endianness,
    srsId,
    envelope,
    headerLength,
  }
}

/**
 * @param {DataView} view 
 * @returns 
 */
export function parseWKBGeometry(view) {
  const byteOrder = view.getUint8(0);
  const littleEndian = byteOrder === 1;
  const wkbType = view.getUint32(1, littleEndian);
  const geometryType = getGeometryType(wkbType);
  const pointType = getPointType(wkbType);
  const parsePoint = getParserOfPointType(pointType);
  const pointSize = getSizeOfPointType(pointType);
  switch (geometryType) {
    case "Point": {
      const point = parsePoint(view, 5, littleEndian);
      return {
        geometryType: /** @type {const} */ ("Point"),
        pointType: /** @type {typeof pointType} */ (pointType),
        wkbType,
        point,
      }
    }
    case "LineString": {
      const numPoints = view.getUint32(5, littleEndian);
      const points = [];
      for (let i = 0; i < numPoints; i++) {
        points.push(parsePoint(view, 9 + i * pointSize, littleEndian));
      }
      return {
        geometryType: /** @type {const} */ ("LineString"),
        pointType: /** @type {typeof pointType} */ (pointType),
        wkbType,
        points,
      }
    }
    case "Polygon": {
      const numRings = view.getUint32(5, littleEndian);
      const rings = [];
      let offset = 9;
      for (let i = 0; i < numRings; i++) {
        const numPoints = view.getUint32(offset, littleEndian);
        const points = [];
        for (let j = 0; j < numPoints; j++) {
          points.push(parsePoint(view, offset + 4 + j * pointSize, littleEndian));
        }
        rings.push(points);
        offset += 4 + numPoints * pointSize;
      }
      return {
        geometryType: /** @type {const} */ ("Polygon"),
        pointType: /** @type {typeof pointType} */ (pointType),
        wkbType,
        rings,
      }
    }
    case "MultiPoint": {
      const parsePoint = getParserOfPointType(pointType);
      const pointSize = getSizeOfPointType(pointType);
      const numPoints = view.getUint32(5, littleEndian);
      const points = [];
      let offset = 9;
      const expectedPointType = wkbType - 3;
      for (let i = 0; i < numPoints; i++) {
        const byteOrder = view.getUint8(offset);
        const littleEndian = byteOrder === 1;
        const wkbPointType = view.getUint32(offset + 1, littleEndian);
        if (wkbPointType !== expectedPointType) {
          throw new Error("Invalid geometry type");
        }
        points.push(parsePoint(view, offset + 5, littleEndian));
        offset += pointSize;
      }
      return {
        geometryType: /** @type {const} */ ("MultiPoint"),
        pointType: /** @type {typeof pointType} */ (pointType),
        wkbType,
        points,
      }
    }
    case "MultiLineString": {
      const numLineStrings = view.getUint32(5, littleEndian);
      const lineStrings = [];
      let offset = 9;
      const expectedLineStringType = wkbType - 3;
      for (let i = 0; i < numLineStrings; i++) {
        const byteOrder = view.getUint8(offset);
        const littleEndian = byteOrder === 1;
        const wkbLineStringType = view.getUint32(offset + 1, littleEndian);
        if (wkbLineStringType !== expectedLineStringType) {
          throw new Error("Invalid geometry type");
        }
        const numPoints = view.getUint32(offset + 5, littleEndian);
        const points = [];
        for (let j = 0; j < numPoints; j++) {
          points.push(parsePoint(view, offset + 9 + j * pointSize, littleEndian));
        }
        lineStrings.push(points);
        offset += 9 + numPoints * pointSize;
      }
      return {
        geometryType: /** @type {const} */ ("MultiLineString"),
        pointType: /** @type {typeof pointType} */ (pointType),
        wkbType,
        lineStrings,
      }
    }
    case "MultiPolygon": {
      const numPolygons = view.getUint32(5, littleEndian);
      const polygons = [];
      let offset = 9;
      const expectedPolygonType = wkbType - 3;
      for (let i = 0; i < numPolygons; i++) {
        const byteOrder = view.getUint8(offset);
        const littleEndian = byteOrder === 1;
        const wkbPolygonType = view.getUint32(offset + 1, littleEndian);
        if (wkbPolygonType !== expectedPolygonType) {
          throw new Error("Invalid geometry type");
        }
        const numRings = view.getUint32(offset + 5, littleEndian);
        const rings = [];
        let ringOffset = offset + 9;
        for (let j = 0; j < numRings; j++) {
          const numPoints = view.getUint32(ringOffset, littleEndian);
          const points = [];
          for (let k = 0; k < numPoints; k++) {
            points.push(parsePoint(view, ringOffset + 4 + k * pointSize, littleEndian));
          }
          rings.push(points);
          ringOffset += 4 + numPoints * pointSize;
        }
        polygons.push(rings);
        offset = ringOffset;
      }
      return {
        geometryType: /** @type {const} */ ("MultiPolygon"),
        pointType: /** @type {typeof pointType} */ (pointType),
        wkbType,
        polygons,
      }
    }
  }
}

/**
 * @param {DataView} view 
 */
export function parseStandardGeoPackageBinary(view) {
  const header = parseGeoPackageBinaryHeader(view);
  if (header.isExtended) {
    throw new Error("Extended GeoPackage Binary is not supported");
  }
  if (header.isEmpty) {
    return {
      header,
      geometry: null,
    }
  }
  const bodyView = new DataView(
    view.buffer,
    view.byteOffset + header.headerLength,
    view.byteLength - header.headerLength,
  );
  const geometry = parseWKBGeometry(bodyView);
  return {
    header,
    geometry,
  }
}
