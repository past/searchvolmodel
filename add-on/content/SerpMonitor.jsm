/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Log.jsm");
Cu.importGlobalProperties(["URLSearchParams"]);
XPCOMUtils.defineLazyModuleGetter(this, "TelemetryController",
  "resource://gre/modules/TelemetryController.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "TelemetryEnvironment",
  "resource://gre/modules/TelemetryEnvironment.jsm");

// Logging
const log = Log.repository.getLogger("extensions.searchvolmodel.monitor");
log.addAppender(new Log.ConsoleAppender(new Log.BasicFormatter()));
log.level = Services.prefs.getIntPref("extensions.searchvolmodel.logging", Log.Level.Warn);

const PREF_DISTRIBUTION_ID = "distribution.id";

/**
 * A map of search engine result domains with their expected prefixes.
 */
let searchResultDomains = [{
  "domains": [ "r.search.yahoo.com" ],
  "prefix": "cbclk2",
  "sap": "yahoo",
}, {
  "domains": [ "0.r.bat.bing.com" ],
  "prefix": "",
  "sap": "bing",
}, {
  "domains": [ "www.googleadservices.com" ],
  "prefix": "pagead/aclk",
  "sap": "google",
}, {
  "domains": [
    "www.google.com", "www.google.ac", "www.google.ad", "www.google.ae",
    "www.google.com.af", "www.google.com.ag", "www.google.com.ai",
    "www.google.al", "www.google.am", "www.google.co.ao", "www.google.com.ar",
    "www.google.as", "www.google.at", "www.google.com.au", "www.google.az",
    "www.google.ba", "www.google.com.bd", "www.google.be", "www.google.bf",
    "www.google.bg", "www.google.com.bh", "www.google.bi", "www.google.bj",
    "www.google.com.bn", "www.google.com.bo", "www.google.com.br",
    "www.google.bs", "www.google.bt", "www.google.co.bw", "www.google.by",
    "www.google.com.bz", "www.google.ca", "www.google.com.kh", "www.google.cc",
    "www.google.cd", "www.google.cf", "www.google.cat", "www.google.cg",
    "www.google.ch", "www.google.ci", "www.google.co.ck", "www.google.cl",
    "www.google.cm", "www.google.cn", "www.google.com.co", "www.google.co.cr",
    "www.google.com.cu", "www.google.cv", "www.google.cx", "www.google.com.cy",
    "www.google.cz", "www.google.de", "www.google.dj", "www.google.dk",
    "www.google.dm", "www.google.com.do", "www.google.dz", "www.google.com.ec",
    "www.google.ee", "www.google.com.eg", "www.google.es", "www.google.com.et",
    "www.google.eu", "www.google.fi", "www.google.com.fj", "www.google.fm",
    "www.google.fr", "www.google.ga", "www.google.ge", "www.google.gf",
    "www.google.gg", "www.google.com.gh", "www.google.com.gi", "www.google.gl",
    "www.google.gm", "www.google.gp", "www.google.gr", "www.google.com.gt",
    "www.google.gy", "www.google.com.hk", "www.google.hn", "www.google.hr",
    "www.google.ht", "www.google.hu", "www.google.co.id", "www.google.iq",
    "www.google.ie", "www.google.co.il", "www.google.im", "www.google.co.in",
    "www.google.io", "www.google.is", "www.google.it", "www.google.je",
    "www.google.com.jm", "www.google.jo", "www.google.co.jp", "www.google.co.ke",
    "www.google.ki", "www.google.kg", "www.google.co.kr", "www.google.com.kw",
    "www.google.kz", "www.google.la", "www.google.com.lb", "www.google.com.lc",
    "www.google.li", "www.google.lk", "www.google.co.ls", "www.google.lt",
    "www.google.lu", "www.google.lv", "www.google.com.ly", "www.google.co.ma",
    "www.google.md", "www.google.me", "www.google.mg", "www.google.mk",
    "www.google.ml", "www.google.com.mm", "www.google.mn", "www.google.ms",
    "www.google.com.mt", "www.google.mu", "www.google.mv", "www.google.mw",
    "www.google.com.mx", "www.google.com.my", "www.google.co.mz",
    "www.google.com.na", "www.google.ne", "www.google.nf", "www.google.com.ng",
    "www.google.com.ni", "www.google.nl", "www.google.no", "www.google.com.np",
    "www.google.nr", "www.google.nu", "www.google.co.nz", "www.google.com.om",
    "www.google.com.pk", "www.google.com.pa", "www.google.com.pe",
    "www.google.com.ph", "www.google.pl", "www.google.com.pg", "www.google.pn",
    "www.google.com.pr", "www.google.ps", "www.google.pt", "www.google.com.py",
    "www.google.com.qa", "www.google.ro", "www.google.rs", "www.google.ru",
    "www.google.rw", "www.google.com.sa", "www.google.com.sb", "www.google.sc",
    "www.google.se", "www.google.com.sg", "www.google.sh", "www.google.si",
    "www.google.sk", "www.google.com.sl", "www.google.sn", "www.google.sm",
    "www.google.so", "www.google.st", "www.google.sr", "www.google.com.sv",
    "www.google.td", "www.google.tg", "www.google.co.th", "www.google.com.tj",
    "www.google.tk", "www.google.tl", "www.google.tm", "www.google.to",
    "www.google.tn", "www.google.com.tr", "www.google.tt", "www.google.com.tw",
    "www.google.co.tz", "www.google.com.ua", "www.google.co.ug",
    "www.google.co.uk", "www.google.us", "www.google.com.uy", "www.google.co.uz",
    "www.google.com.vc", "www.google.co.ve", "www.google.vg", "www.google.co.vi",
    "www.google.com.vn", "www.google.vu", "www.google.ws", "www.google.co.za",
    "www.google.co.zm", "www.google.co.zw",
  ],
  "prefix": "aclk",
  "sap": "google",
}];

/**
 * nsIHttpActivityObserver that counts ad clicks.
 */
this.SerpMonitor = {
  // A map of tab URLs being monitored to search domain information. These are
  // tabs where the last visited page was a SERP.
  _serpTabs: new Map(),
  _guid: null,
  _distributionId: null,

  get distributionId() {
    if (!this._distributionId) {
      this._distributionId = Services.prefs.getStringPref(PREF_DISTRIBUTION_ID, "");
    }
    return this._distributionId;
  },

  init(guid) {
    this._guid = guid;
  },

  addSerpTab(url, browser, info) {
    let item = this._serpTabs.get(url);
    if (item) {
      item.browsers.push(browser);
    } else {
      this._serpTabs.set(url, {info, browsers: [browser]});
    }
  },

  removeSerpTab(url, browser) {
    let item = this._serpTabs.get(url);
    if (item) {
      let index = item.browsers.indexOf(browser);
      if (index != -1) {
        item.browsers.splice(index, 1);
      }

      if (!item.browsers.length) {
        this._serpTabs.delete(url);
      }
    }
  },

  searchResultDomains,

  getSearchResultDomainCodes(host) {
    for (let domainInfo of this.searchResultDomains) {
      if (domainInfo.domains.includes(host)) {
        return domainInfo;
      }
    }
    return null;
  },

  reportAdClick(uri) {
    let item = this._serpTabs.get(uri);
    if (!item) {
      log.error("Expected to report URI but couldn't find the information.");
      return;
    }

    let type = `searchvol`;
    let additionalInfo = {
      code: item.info.code,
      distributionId: this.distributionId,
      guid: this._guid,
      engine: item.info.sap,
    };

    log.info(`Reporting to Telemetry: ${type} with additional info`, additionalInfo);
    let fullEnvironment = TelemetryEnvironment.currentEnvironment;
    let defaultSearchEngine =
      fullEnvironment.settings ? fullEnvironment.settings.defaultSearchEngine : "";
    let defaultSearchEngineData =
      fullEnvironment.settings ? fullEnvironment.settings.defaultSearchEngineData : {};
    let activeExperiment =
      fullEnvironment.addons ? fullEnvironment.addons.activeExperiment : "";
    let experiments =
      fullEnvironment.experiments ? fullEnvironment.experiments : {};

    TelemetryController.submitExternalPing(type, additionalInfo, {
      addClientId: false,
      addEnvironment: true,
      overrideEnvironment: {
        settings: {
          defaultSearchEngine,
          defaultSearchEngineData
        },
        addons: {
          activeExperiment
        },
        experiments
      }
    });
  },

  observeActivity(aHttpChannel, aActivityType, aActivitySubtype, aTimestamp, aExtraSizeData, aExtraStringData) {
    if (!this._serpTabs.size ||
        aActivityType != Ci.nsIHttpActivityObserver.ACTIVITY_TYPE_HTTP_TRANSACTION ||
        aActivitySubtype != Ci.nsIHttpActivityObserver.ACTIVITY_SUBTYPE_TRANSACTION_CLOSE) {
      return;
    }

    let channel = aHttpChannel.QueryInterface(Ci.nsIHttpChannel);
    let loadInfo;
    try {
      loadInfo = channel.loadInfo;
    } catch (e) {
      // Channels without a loadInfo are not pertinent.
      return;
    }

    try {
      let uri = channel.URI;
      let triggerURI = loadInfo.triggeringPrincipal.URI;

      let resultDomainInfo = this.getSearchResultDomainCodes(uri.host);
      if (!resultDomainInfo) {
        return;
      }

      log.trace(`>>>> [${[...this._serpTabs.keys()]}]\n`);
      if (triggerURI) {
        log.trace(`>>>> triggeringPrincipal in map: ${this._serpTabs.has(triggerURI.spec)}`);
        log.trace(`>>>> triggeringPrincipal: ${triggerURI.spec}`);
      }
      log.trace(`>>>> channel.URI: ${uri.spec}`);
      if (resultDomainInfo &&
          uri.filePath.substring(1).startsWith(resultDomainInfo.prefix) &&
          this._serpTabs.has(triggerURI.spec)) {
        this.reportAdClick(triggerURI.spec);
      }
    } catch (e) {
      Cu.reportError(e);
    }
  }
}

this.EXPORTED_SYMBOLS = ["SerpMonitor"];
