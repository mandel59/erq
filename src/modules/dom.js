import { createErqNodeJsModule } from "../create-erq-nodejs-module.js";

export default createErqNodeJsModule('dom', async ({ defineTable }) => {

  const { default: jsdom } = await import("jsdom");

  defineTable("xml_tree", {
    parameters: ["_xml", "content_type", "url", "referrer"],
    columns: ["id", "parent", "type", "name", "value", "attributes"],
    rows: function* (
      /** @type {string | null} */ xml,
      /** @type {string | null} */ contentType,
      /** @type {string | null} */ url,
      /** @type {string | null} */ referrer,
    ) {
      /**
       * @param {string} contentType 
       * @returns {contentType is 'text/html' | 'application/xhtml+xml' | 'application/xml' | 'text/xml' | 'image/svg+xml'}
       */
      function isSupportedContentType(contentType) {
        return contentType === "text/html"
          || contentType === "application/xhtml+xml"
          || contentType === "application/xml"
          || contentType === "text/xml"
          || contentType === "image/svg+xml";
      }
      if (xml == null) {
        return;
      }
      if (contentType == null) {
        contentType = "application/xml";
      }
      if (!isSupportedContentType(contentType)) {
        throw new Error(`xml_tree(xml,contentType,url,referrer) unsupported content type ${contentType}`);
      }
      const { window } = new jsdom.JSDOM(xml, {
        contentType,
        url,
        referrer,
      });
      const result = window.document.evaluate("//node()", window.document, null, window.XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
      /** @type {Map<Node, number>} */
      const idmap = new Map();
      let id = 0;
      /** @type {Node} */
      let n;
      while (n = result.iterateNext()) {
        id += 1;
        const attrs = /** @type {Element} */ (n).attributes;
        yield [
          id,
          idmap.get(n.parentNode) ?? 0,
          n.nodeType,
          n.nodeName,
          n.nodeValue,
          attrs ? JSON.stringify(Object.fromEntries(Array.from(attrs, (attr) => [attr.name, attr.value]))) : null,
        ];
        idmap.set(n, id);
      }
    }
  })

});
