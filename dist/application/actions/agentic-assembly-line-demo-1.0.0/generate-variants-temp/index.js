/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 2613
(module) {

module.exports = require("assert");

/***/ },

/***/ 181
(module) {

module.exports = require("buffer");

/***/ },

/***/ 5317
(module) {

module.exports = require("child_process");

/***/ },

/***/ 6982
(module) {

module.exports = require("crypto");

/***/ },

/***/ 4434
(module) {

module.exports = require("events");

/***/ },

/***/ 9896
(module) {

module.exports = require("fs");

/***/ },

/***/ 8611
(module) {

module.exports = require("http");

/***/ },

/***/ 5675
(module) {

module.exports = require("http2");

/***/ },

/***/ 5692
(module) {

module.exports = require("https");

/***/ },

/***/ 9278
(module) {

module.exports = require("net");

/***/ },

/***/ 4573
(module) {

module.exports = require("node:buffer");

/***/ },

/***/ 1421
(module) {

module.exports = require("node:child_process");

/***/ },

/***/ 5217
(module) {

module.exports = require("node:crypto");

/***/ },

/***/ 8474
(module) {

module.exports = require("node:events");

/***/ },

/***/ 3024
(module) {

module.exports = require("node:fs");

/***/ },

/***/ 7067
(module) {

module.exports = require("node:http");

/***/ },

/***/ 4708
(module) {

module.exports = require("node:https");

/***/ },

/***/ 8161
(module) {

module.exports = require("node:os");

/***/ },

/***/ 6760
(module) {

module.exports = require("node:path");

/***/ },

/***/ 1708
(module) {

module.exports = require("node:process");

/***/ },

/***/ 7075
(module) {

module.exports = require("node:stream");

/***/ },

/***/ 7975
(module) {

module.exports = require("node:util");

/***/ },

/***/ 8522
(module) {

module.exports = require("node:zlib");

/***/ },

/***/ 857
(module) {

module.exports = require("os");

/***/ },

/***/ 6928
(module) {

module.exports = require("path");

/***/ },

/***/ 2203
(module) {

module.exports = require("stream");

/***/ },

/***/ 4756
(module) {

module.exports = require("tls");

/***/ },

/***/ 2018
(module) {

module.exports = require("tty");

/***/ },

/***/ 7016
(module) {

module.exports = require("url");

/***/ },

/***/ 9023
(module) {

module.exports = require("util");

/***/ },

/***/ 3106
(module) {

module.exports = require("zlib");

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = __webpack_modules__;
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/create fake namespace object */
/******/ 	(() => {
/******/ 		var getProto = Object.getPrototypeOf ? (obj) => (Object.getPrototypeOf(obj)) : (obj) => (obj.__proto__);
/******/ 		var leafPrototypes;
/******/ 		// create a fake namespace object
/******/ 		// mode & 1: value is a module id, require it
/******/ 		// mode & 2: merge all properties of value into the ns
/******/ 		// mode & 4: return value when already ns object
/******/ 		// mode & 16: return value when it's Promise-like
/******/ 		// mode & 8|1: behave like require
/******/ 		__webpack_require__.t = function(value, mode) {
/******/ 			if(mode & 1) value = this(value);
/******/ 			if(mode & 8) return value;
/******/ 			if(typeof value === 'object' && value) {
/******/ 				if((mode & 4) && value.__esModule) return value;
/******/ 				if((mode & 16) && typeof value.then === 'function') return value;
/******/ 			}
/******/ 			var ns = Object.create(null);
/******/ 			__webpack_require__.r(ns);
/******/ 			var def = {};
/******/ 			leafPrototypes = leafPrototypes || [null, getProto({}), getProto([]), getProto(getProto)];
/******/ 			for(var current = mode & 2 && value; (typeof current == 'object' || typeof current == 'function') && !~leafPrototypes.indexOf(current); current = getProto(current)) {
/******/ 				Object.getOwnPropertyNames(current).forEach((key) => (def[key] = () => (value[key])));
/******/ 			}
/******/ 			def['default'] = () => (value);
/******/ 			__webpack_require__.d(ns, def);
/******/ 			return ns;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/ensure chunk */
/******/ 	(() => {
/******/ 		__webpack_require__.f = {};
/******/ 		// This file contains only the entry chunk.
/******/ 		// The chunk loading function for additional chunks
/******/ 		__webpack_require__.e = (chunkId) => {
/******/ 			return Promise.all(Object.keys(__webpack_require__.f).reduce((promises, key) => {
/******/ 				__webpack_require__.f[key](chunkId, promises);
/******/ 				return promises;
/******/ 			}, []));
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/get javascript chunk filename */
/******/ 	(() => {
/******/ 		// This function allow to reference async chunks
/******/ 		__webpack_require__.u = (chunkId) => {
/******/ 			// return url for filenames based on template
/******/ 			return "" + chunkId + ".index.js";
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/require chunk loading */
/******/ 	(() => {
/******/ 		// no baseURI
/******/ 		
/******/ 		// object to store loaded chunks
/******/ 		// "1" means "loaded", otherwise not loaded yet
/******/ 		var installedChunks = {
/******/ 			792: 1
/******/ 		};
/******/ 		
/******/ 		// no on chunks loaded
/******/ 		
/******/ 		var installChunk = (chunk) => {
/******/ 			var moreModules = chunk.modules, chunkIds = chunk.ids, runtime = chunk.runtime;
/******/ 			for(var moduleId in moreModules) {
/******/ 				if(__webpack_require__.o(moreModules, moduleId)) {
/******/ 					__webpack_require__.m[moduleId] = moreModules[moduleId];
/******/ 				}
/******/ 			}
/******/ 			if(runtime) runtime(__webpack_require__);
/******/ 			for(var i = 0; i < chunkIds.length; i++)
/******/ 				installedChunks[chunkIds[i]] = 1;
/******/ 		
/******/ 		};
/******/ 		
/******/ 		// require() chunk loading for javascript
/******/ 		__webpack_require__.f.require = (chunkId, promises) => {
/******/ 			// "1" is the signal for "already loaded"
/******/ 			if(!installedChunks[chunkId]) {
/******/ 				if(true) { // all chunks have JS
/******/ 					var installedChunk = require("./" + __webpack_require__.u(chunkId));
/******/ 					if (!installedChunks[chunkId]) {
/******/ 						installChunk(installedChunk);
/******/ 					}
/******/ 				} else installedChunks[chunkId] = 1;
/******/ 			}
/******/ 		};
/******/ 		
/******/ 		// no external install chunk
/******/ 		
/******/ 		// no HMR
/******/ 		
/******/ 		// no HMR manifest
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   main: () => (/* binding */ main)
/* harmony export */ });
/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(6928);
/* harmony import */ var url__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(7016);
/**
 * Adobe I/O Runtime action: run Long Tail Assets (generate variants with Firefly Fill).
 * Writes to /tmp, uploads to Azure Blob, returns { generated: [{ channelId, url }] }.
 * Invoke with POST body = { campaign, heroUrl, channels }.
 */




const generate_variants_dirname = path__WEBPACK_IMPORTED_MODULE_0__.dirname((0,url__WEBPACK_IMPORTED_MODULE_1__.fileURLToPath)("file:///C:/Users/bourque/source/cursor/Demo/actions/generate-variants/index.js"));

async function main(params) {
  try {
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'string' && (k.startsWith('FIREFLY_') || k.startsWith('AZURE_'))) process.env[k] = v;
    }
    const { campaign, heroUrl, channels } = params;
    if (!campaign || !heroUrl || !channels?.length) {
      return { error: 'Missing campaign, heroUrl, or channels' };
    }
    process.env.OUTPUT_PATH = '/tmp/outputs';
  const { runResizeWithFill } = await Promise.all(/* import() */[__webpack_require__.e(298), __webpack_require__.e(406)]).then(__webpack_require__.bind(__webpack_require__, 6406));
  const { uploadDirToAzure, isAzureConfigured } = await Promise.all(/* import() */[__webpack_require__.e(179), __webpack_require__.e(189)]).then(__webpack_require__.bind(__webpack_require__, 6189));
  const result = await runResizeWithFill({ campaign, heroUrl, channels });
  if (!isAzureConfigured()) {
    return { error: 'Azure storage required for Runtime. Set AZURE_STORAGE_* in action params.' };
  }
  const blobPrefix = `outputs/variants/${campaign}`;
  const variantsDir = path__WEBPACK_IMPORTED_MODULE_0__.join('/tmp/outputs', 'variants');
  const generated = [];
  for (const ch of result.generated || []) {
    const channelId = ch.channelId || ch.channel;
    const dir = path__WEBPACK_IMPORTED_MODULE_0__.join(variantsDir, channelId);
    try {
      const { files } = await uploadDirToAzure(dir, `${blobPrefix}/${channelId}`);
      const png = files.find((f) => f.path.endsWith('.png'));
      if (png) generated.push({ channelId, channel: channelId, url: png.url });
    } catch (_) {
      if (ch.url) generated.push({ channelId, channel: channelId, url: ch.url });
    }
  }
  return {
    campaign: String(result.campaign || campaign),
    generated: (generated.length ? generated : result.generated || []).map((g) => ({
      channelId: String(g.channelId || g.channel || ''),
      channel: String(g.channel || g.channelId || ''),
      url: String(g.url || ''),
    })),
  };
  } catch (e) {
    return { error: String(e && (e.message || e)) };
  }
}

module.exports = __webpack_exports__;
/******/ })()
;