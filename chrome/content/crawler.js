/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

function abprequire(module)
{
  let result = {};
  result.wrappedJSObject = result;
  Services.obs.notifyObservers(result, "adblockplus-require", module);
  if ("exports" in result)
    return result.exports;
  else
    return Cu.import("chrome://adblockplus-modules/content/" + module[0].toUpperCase() + module.substr(1) + ".jsm", null);
}

let {Policy} = abprequire("contentPolicy");
let {Filter} = abprequire("filterClasses");

let policyGlobal = Cu.getGlobalForObject(Policy);
let PolicyPrivate = null;
if (policyGlobal == window)
{
  // Work-around for bug 736316 - getGlobalForObject gave us our own window
  let {XPIProvider} = Cu.import("resource://gre/modules/XPIProvider.jsm", null);
  let addonID = "{d10d0bf8-f5b5-c8b4-a8b2-2b9879e08c5d}"
  if (addonID in XPIProvider.bootstrapScopes)
    policyGlobal = XPIProvider.bootstrapScopes[addonID];
}

if ("PolicyPrivate" in policyGlobal)              // ABP 2.0.x
  PolicyPrivate = policyGlobal.PolicyPrivate;
else if ("PolicyImplementation" in policyGlobal)  // ABP 2.1+ with scope separation
  PolicyPrivate = policyGlobal.PolicyImplementation;
else if ("require" in policyGlobal)               // ABP 2.1+ without scope separation
  PolicyPrivate = policyGlobal.require.scopes.contentPolicy.PolicyImplementation;
else
  window.close();

let origShouldLoad = PolicyPrivate.shouldLoad;
let origProcessNode = Policy.processNode;

function appendBlocked(site, requestUrl)
{
  let siteCell = document.createElement("treecell");
  siteCell.setAttribute("label", site);

  let requestUrlCell = document.createElement("treecell");
  requestUrlCell.setAttribute("label", requestUrl);

  let treeRow = document.createElement("treerow");
  treeRow.appendChild(siteCell);
  treeRow.appendChild(requestUrlCell);

  let treeItem = document.createElement("treeitem");
  treeItem.appendChild(treeRow);

  let list = document.getElementById("list");
  let treeChildren = list.getElementsByTagName("treechildren")[0];
  treeChildren.appendChild(treeItem);
}

function handleNode(result, location, site)
{
  if (result === Ci.nsIContentPolicy.REJECT_REQUEST)
    // TODO: Send to backend instead of displaying
    appendBlocked(site, location.spec);
}

function shouldLoad(contentType, contentLocation, requestOrigin, node, mimeTypeGuess, extra)
{
  let result = origShouldLoad.apply(this, arguments);
  handleNode(result, contentLocation, requestOrigin.spec);
  return result;
}

function processNode(wnd, node, contentType, location, collapse)
{
  let result = origProcessNode.apply(this, arguments);
  // TODO: Get the site
  Application.console.log(node);
  handleNode(result, location, "Unknown");
  return result;
}

function init()
{
  PolicyPrivate.shouldLoad = shouldLoad;
  Policy.processNode = processNode;
}

function destroy()
{
  if (origShouldLoad)
    PolicyPrivate.shouldLoad = origShouldLoad;
  if (origProcessNode)
    Policy.processNode = origProcessNode;
}

function fetchCrawlableUrls(backendUrl, callback)
{
  let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
  request.mozBackgroundRequest = true;
  request.open("GET", backendUrl + "/crawlableUrls");
  request.addEventListener("load", function()
  {
    let urls = request.responseText.trim().split("\n");
    callback(urls);
  });
  request.send();
}

function loadUrl(url)
{
    let tab = window.opener.gBrowser.addTab(url);
    let progressListener = {
      onStateChange: function(aBrowser, aWebProgress, aRequest, aStateFlags, aStatus)
      {
        if (!(aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_STOP && aStatus === 0))
          return;

        window.opener.gBrowser.removeTabsProgressListener(progressListener);
        window.opener.gBrowser.removeTab(tab);
      }    
    }
    window.opener.gBrowser.addTabsProgressListener(progressListener);    
}

function crawl()
{
  let backendUrlTextBox = document.getElementById("backend-url");
  let backendUrl = backendUrlTextBox.value;
  fetchCrawlableUrls(backendUrl, function(urls)
  {
    for (let i = 0; i < urls.length; i++)
      loadUrl(urls[i]);
  });
}
