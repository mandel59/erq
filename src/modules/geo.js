import { createErqNodeJsModule } from "../create-erq-nodejs-module.js";

export default createErqNodeJsModule('dom', async ({ defineTable }) => {

  const { feature } = await import("topojson-client");
  const { geomToGeoJSON } = await import("../geo/geom-to-geojson.js");

  defineTable("topojson_feature", {
    parameters: ["_topology", "_object"],
    columns: ["id", "type", "properties", "geometry", "bbox"],
    rows: function* (topology, object) {
      if (topology == null || object == null) {
        return;
      }
      if (typeof object !== "string") {
        throw new TypeError("topojson_feature(topology,object) object must be a string");
      }
      if (Buffer.isBuffer(topology)) {
        topology = topology.toString("utf-8");
      }
      const t = JSON.parse(topology);
      const o = t.objects[object];
      if (o == null) {
        throw new Error(`topojson_feature(topology,object) object ${object} not found`);
      }
      /** @type {*} */
      const f = feature(t, o);
      /** @type {Array<import("geojson").Feature>} */
      let fs;
      /**
       * @param {*} obj
       * @returns {obj is import("geojson").FeatureCollection}
       */
      function isFeatureCollection(obj) {
        return obj.type === "FeatureCollection";
      }
      if (isFeatureCollection(f)) {
        fs = f.features;
      } else {
        fs = [f];
      }
      for (const f of fs) {
        if (!(typeof f.id === "number" || typeof f.id === "string" || f.id == null)) {
          throw new Error("topojson_feature(topology,object) feature.id must be a number or a string");
        }
        yield [
          f.id,
          f.type,
          JSON.stringify(f.properties),
          JSON.stringify(f.geometry),
          f.bbox != null ? JSON.stringify(f.bbox) : null,
        ];
      }
    }
  })

  defineTable("gpkg_wkb_feature", {
    parameters: ["_geom"],
    columns: ["type", "geometry", "bbox"],
    rows: function* (geom) {
      if (!Buffer.isBuffer(geom)) throw new TypeError("gpkg_wkb_feature(geom) geom must be a blob");
      yield {
        type: "Feature",
        geometry: JSON.stringify(geomToGeoJSON(geom)),
        bbox: null,
      }
    }
  })

});