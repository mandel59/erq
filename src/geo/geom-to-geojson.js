import { parseStandardGeoPackageBinary } from "./geopackage.js";

/**
 * @param {number[]} position 
 */
function roundPositionCoordinates(position) {
  return position.map(c => Math.round(c * 1000000) / 1000000);
}

/**
 * @param {Buffer} gp 
 */
export function geomToGeoJSON(gp) {
  const { header, geometry } = parseStandardGeoPackageBinary(new DataView(gp.buffer));
  const isEmpty = header.isEmpty;
  const srsId = header.srsId;
  if (srsId !== 4326) {
    // TODO: Support other SRS
    throw new Error("Only EPSG:4326 is supported");
  }
  const { geometryType, pointType } = geometry;
  switch (geometryType) {
    case "Point": {
      const { x, y, z } = geometry.point;
      const coordinates = isEmpty ? []
        : pointType === "XYZ" || pointType === "XYZM"
          ? roundPositionCoordinates([x, y, z])
          : roundPositionCoordinates([x, y]);
      return {
        type: "Point",
        coordinates,
      }
    }
    case "LineString": {
      const { points } = geometry;
      const coordinates = isEmpty ? []
        : pointType === "XYZ" || pointType === "XYZM"
          ? points.map(({ x, y, z }) => roundPositionCoordinates([x, y, z]))
          : points.map(({ x, y }) => roundPositionCoordinates([x, y]));
      return {
        type: "LineString",
        coordinates,
      }
    }
    case "Polygon": {
      const { rings } = geometry;
      const coordinates = isEmpty ? [] :
        pointType === "XYZ" || pointType === "XYZM"
          ? rings.map(ring => ring.map(({ x, y, z }) => roundPositionCoordinates([x, y, z])))
          : rings.map(ring => ring.map(({ x, y }) => roundPositionCoordinates([x, y])));
      return {
        type: "Polygon",
        coordinates,
      }
    }
    case "MultiPoint": {
      const { points } = geometry;
      const coordinates = isEmpty ? []
        : pointType === "XYZ" || pointType === "XYZM"
          ? points.map(({ x, y, z }) => [x, y, z])
          : points.map(({ x, y }) => [x, y]);
      return {
        type: "MultiPoint",
        coordinates,
      }
    }
    case "MultiLineString": {
      const { lineStrings } = geometry;
      const coordinates = isEmpty ? []
        : pointType === "XYZ" || pointType === "XYZM"
          ? lineStrings.map(line => line.map(({ x, y, z }) => roundPositionCoordinates([x, y, z])))
          : lineStrings.map(line => line.map(({ x, y }) => roundPositionCoordinates([x, y])));
      return {
        type: "MultiLineString",
        coordinates,
      }
    }
    case "MultiPolygon": {
      const { polygons } = geometry;
      const coordinates = isEmpty ? []
        : pointType === "XYZ" || pointType === "XYZM"
          ? polygons.map(polygon => polygon.map(ring => ring.map(({ x, y, z }) => roundPositionCoordinates([x, y, z]))))
          : polygons.map(polygon => polygon.map(ring => ring.map(({ x, y }) => roundPositionCoordinates([x, y]))));
      return {
        type: "MultiPolygon",
        coordinates,
      }
    }
    default: {
      throw new Error("Invalid geometry type");
    }
  }
}
