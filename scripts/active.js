// author: InMon Corp.
// version: 0.2
// date: 12/1/2016
// description: SDN Active Route Manager
// copyright: Copyright (c) 2015-2016 InMon Corp. ALL RIGHTS RESERVED

include(scriptdir() + '/inc/trend.js');

var trend = new Trend(300,1);
var points;

var SEP = '_SEP_';
var flow_timeout = 2;

var reflectorIP = getSystemProperty("arm.reflector.ip") || "127.0.0.1";
var reflectorIP6 = getSystemProperty("arm.reflector.ip6") || "::1";
var reflectorAS = getSystemProperty("arm.reflector.as") || 65000;
var reflectorID = getSystemProperty("arm.reflector.id");

var targetIP = getSystemProperty("arm.target.ip");
var targetIP6 = getSystemProperty("arm.target.ip6");
var targetAS = getSystemProperty("arm.target.as");
var targetID = getSystemProperty("arm.target.id");
var targetPrefixes = getSystemProperty("arm.target.prefixes") || 20000;
var targetMinPrefix = getSystemProperty("arm.target.minPrefix") || 1;
var targetPrefixes6 = getSystemProperty("arm.target.prefixes6") || 20000;
var targetMinPrefix6 = getSystemProperty("arm.target.minPrefix6") || 1;
var targetMinValue = getSystemProperty("arm.target.minvalue") || 0;
var targetPeriod = getSystemProperty("arm.target.period") || "24h";
var targetMailNotification = getSystemProperty("arm.target.mailNotification") || null;

var sFlowIP = getSystemProperty("arm.sflow.ip") || reflectorIP;
var sFlowT = getSystemProperty("arm.sflow.t") || 10;
var httpPort = getSystemProperty("http.port") || 8008;

if(reflectorIP && reflectorAS) bgpAddNeighbor(reflectorIP,reflectorAS,reflectorID);
if(reflectorIP6 && reflectorAS) bgpAddNeighbor(reflectorIP6,reflectorAS,reflectorID,{'ipv6':true});
if(sFlowIP && reflectorIP && sFlowT) bgpAddSource(sFlowIP,{router:reflectorIP,router6:reflectorIP6},sFlowT,'bytes');
if(targetIP && targetAS) bgpAddNeighbor(targetIP,targetAS,targetID);
if(targetIP6 && targetAS) bgpAddNeighbor(targetIP6,targetAS,targetID,{'ipv6':true});

sharedSet('arm_config', {reflectorIP:reflectorIP, targetIP:targetIP, targetPrefixes:targetPrefixes, targetMinValue:targetMinValue, targetMinPrefix:targetMinPrefix, targetPeriod:targetPeriod, targetMailNotification:targetMailNotification, httpPort:httpPort});
sharedSet('arm_config6', {reflectorIP:reflectorIP6, targetIP:targetIP6, targetPrefixes:targetPrefixes6, targetMinValue:targetMinValue, targetMinPrefix:targetMinPrefix6});

setFlow('arm_bytes', {value:'bytes',n:10,t:flow_timeout,fs:SEP});
setFlow('arm_dstaspath', {keys:'bgpdestinationaspath', value:'bytes', n:10, t:flow_timeout, fs:SEP});
setFlow('arm_dstas', {keys:'bgpdestinationas', value:'bytes', n:10, t:flow_timeout, fs:SEP});
setFlow('arm_dstpeer', {keys:'bgpdestinationpeeras', value:'bytes', n:10, t:flow_timeout, fs:SEP});
setFlow('arm_srcas', {keys:'bgpsourceas', value:'bytes', n:10, t:flow_timeout, fs:SEP});

var other = '-other-';
function calculateTopN(agents,metric,n,minVal,total_bps) {
  var total, top, topN, i, bps;
  top = activeFlows(agents,metric,n,minVal,'sum');
  var topN = {};
  if(top) {
    total = 0;
    for(i in top) {
      bps = top[i].value * 8;
      topN[top[i].key] = bps;
      total += bps;
    }
    if(total_bps > total) topN[other] = total_bps - total;
  }
  return topN;
}

function getMetric(res, idx, defVal) {
  var val = defVal;
  if(res && res.length && res.length > idx && res[idx].hasOwnProperty('metricValue')) val = res[idx].metricValue;
  return val;
}

setIntervalHandler(function(now) {
  points = {};

  let top = activeFlows(sFlowIP,'arm_bytes',1,0,'sum');
  let bps = 0;
  if(top && top.length > 0) bps = top[0].value * 8;
  points['bps'] = bps;

  let stats = sharedGet('arm_stats') || {};
  points['bgp-nprefixes'] = stats['bgp-nprefixes'] || 0;
  points['bgp-adds'] = stats['bgp-adds'] || 0;
  points['bgp-removes'] = stats['bgp-removes'] || 0;
  points['cache-prefixes-added'] = stats['cache-prefixes-added'] || 0;
  points['cache-prefixes-removed'] = stats['cache-prefixes-removed'] || 0;
  points['cache-prefixes'] = stats['cache-prefixes'] || 0;
  points['cache-hitrate'] = stats['cache-hitrate'] || 0;
  points['cache-missrate'] = stats['cache-missrate'] || 0;
  points['cache-missdelete'] = stats['cache-missrecent'] || 0;
  points['cache-missadd'] = points['cache-missrate'] - points['cache-missdelete'];
  points['active-prefixes'] = stats['active-prefixes'] || 0;
  points['active-coverage'] = stats['active-coverage'] || 0;
  points['active-coveredprefixes'] = stats['active-coveredprefixes'] || 0;
  points['active-activeprefixes'] = stats['active-prefixes'] - stats['active-coveredprefixes'];

  trend.addPoints(now,points);
}, 1);

setHttpHandler(function(req) {
  var result, key, name, path = req.path;
  if(!path || path.length == 0) throw "not_found";

  switch(path[0]) {
    case 'trend':
      if(path.length > 1) throw "not_found";
      result = {};
      result.trend = req.query.after ? trend.after(parseInt(req.query.after)) : trend;
      break;
    case 'metric':
      if(path.length == 1) result = points;
      else {
        if(path.length != 2) throw "not_found";
        if(points.hasOwnProperty(path[1])) result = points[path[1]];
        else throw "not_found";
      }
    default: throw "not_found";
  }
  return result;
});
