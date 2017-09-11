/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env mozilla/frame-script */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.importGlobalProperties(["URLSearchParams"]);
XPCOMUtils.defineLazyModuleGetter(this, "SerpProcess",
  "chrome://searchvolmodel/content/SerpProcess.jsm");

const kExtensionID = "searchvolmodel@mozilla.com";
const kRegisterSerpMsg = `${kExtensionID}:register-serp`;
const kDeregisterSerpMsg = `${kExtensionID}:deregister-serp`;
const kShutdownMsg = `${kExtensionID}:shutdown`;

/**
 * Used for debugging to log messages.
 *
 * @param {String} message The message to log.
 */
function log(message) {
  console.log(message);
}

// Hack to handle the most common reload case.
// If gLastSearch is the same as the current URL, ignore the search.
// This also prevents us from handling reloads with hashes twice
let gLastSearch = null;

// Keep track of the original window we were loaded in
// so we don't handle requests for other windows.
let gOriginalWindow = null;

/**
 * Since most codes are in the URL, we can handle them via
 * a progress listener.
 */
var serpProgressListener = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIWebProgressListener, Ci.nsISupportsWeakReference]),
  onLocationChange(aWebProgress, aRequest, aLocation, aFlags)
  {
    log(`>>>>0\n`);
    if (aWebProgress.DOMWindow && (aWebProgress.DOMWindow != gOriginalWindow)) {
      return;
    }
    try {
      log(`>> aLocation.spec: ${aLocation.spec}`)
      // Ignore reloads and iframe navigation.
      if (!aWebProgress.isTopLevel ||
          aLocation.spec == gLastSearch) {
        log(`>>>>1\n`);
        return;
      }
      log(`>>>>2\n`);
      let loadInfo;
      try {
        let channel = aRequest.QueryInterface(Ci.nsIHttpChannel);
        loadInfo = channel.loadInfo;
      } catch (e) {
        // Non-HTTP channels or channels without a loadInfo are not pertinent.
        log(`>>>> non-HTTP channel or channel without loadInfo.\n`);
        return;
      }
      let triggerURI = loadInfo.triggeringPrincipal.URI;

      // Not a URL or doesn't have a query string or a ref.
      if ((!aLocation.schemeIs("http") && !aLocation.schemeIs("https")) ||
          (!aLocation.query && !aLocation.ref)) {
        log(`>>>> not search-related page.\n`);
        // not search-related page.
        sendDeregisterSerpMsg(triggerURI.spec);
        return;
      }
      log(`>>>>3\n`);

      let domainInfo = SerpProcess.getSearchDomainCodes(aLocation.host);
      if (!domainInfo) {
        sendDeregisterSerpMsg(triggerURI.spec);
        return;
      }
      log(`>>>>4\n`);

      let queries = new URLSearchParams(aLocation.query);
      let code = queries.get(domainInfo.prefix);
      if (queries.get(domainInfo.search)) {
        if (domainInfo.codes.includes(code)) {
          if (domainInfo.reportPrefix &&
              queries.get(domainInfo.reportPrefix)) {
            code = queries.get(domainInfo.reportPrefix);
          }
          sendRegisterSerpMsg(code, domainInfo.sap, aLocation.spec);
          gLastSearch = aLocation.spec;
        } else {
          log(`>>>> SERP without our codes.\n`);
          // SERP without our codes.
          sendDeregisterSerpMsg(triggerURI.spec);
        }
      } else {
        log(`>>>> SERP without our codes.\n`);
        // SERP with non-search queries.
        sendDeregisterSerpMsg(triggerURI.spec);
      }
    } catch (e) {
      console.error(e);
    }
  },
};

/**
 * Parses a cookie string into separate parts.
 *
 * @param {String} cookieString The string to parse.
 * @param {Object} [params] An optional object to append the parameters to.
 * @return {Object} An object containing the query keys and values.
 */
function parseCookies(cookieString, params = {}) {
  var cookies = cookieString.split(/;\s*/);

  for (var i in cookies) {
    var kvp = cookies[i].split(/=(.+)/);
    params[kvp[0]] = kvp[1];
  }

  return params;
}

/**
 * Page load listener to handle loads www.bing.com only.
 * We have to use a page load listener because we need
 * to check cookies.
 * @param {Object} event The page load event.
 */
function onPageLoad(event) {
  log(`>>>> onPageLoad\n`);
  var doc = event.target;
  var win = doc.defaultView;
  if (win != win.top) {
    return;
  }
  var uri = doc.documentURIObject;
  if (!(uri instanceof Ci.nsIStandardURL) ||
      (!uri.schemeIs("http") && !uri.schemeIs("https")) ||
       uri.host != "www.bing.com" ||
      !doc.location.search ||
      uri.spec == gLastSearch) {
    return;
  }
  var queries = new URLSearchParams(doc.location.search.toLowerCase());
  // XXX: we care about all tagged searches.
  // For Bing, QBRE form code is used for all follow-on search
  if (queries.get("form") != "qbre") {
    return;
  }
  if (parseCookies(doc.cookie).SRCHS == "PC=MOZI") {
    sendRegisterSerpMsg("MOZI", "bing", uri.spec);
    gLastSearch = uri.spec;
  }
}

/**
 * Sends a message to the process that added this script to tell it to register
 * a SERP.
 *
 * @param {String} code The codes used for the search engine.
 * @param {String} sap The SAP code.
 * @param {String} url The URL of the tab to monitor.
 */
function sendRegisterSerpMsg(code, sap, url) {
  sendAsyncMessage(kRegisterSerpMsg, {
    code,
    sap,
    url,
  });
}

/**
 * Sends a message to the process that added this script to tell it to disable
 * the HTTP activity observer.
 *
 * @param {String} url The URL of the tab to stop monitoring.
 */
function sendDeregisterSerpMsg(url) {
  sendAsyncMessage(kDeregisterSerpMsg, { url });
}

gOriginalWindow = content;

addEventListener("DOMContentLoaded", onPageLoad, false);
docShell.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIWebProgress)
        .addProgressListener(serpProgressListener, Ci.nsIWebProgress.NOTIFY_LOCATION);

let gDisabled = false;

addMessageListener(kShutdownMsg, () => {
  dump(">>>>>>>>> kShutdownMsg received!!!!\n");
  if (!gDisabled) {
    removeEventListener("DOMContentLoaded", onPageLoad, false);
    docShell.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIWebProgress)
            .removeProgressListener(serpProgressListener);
    gDisabled = true;
  }
});
