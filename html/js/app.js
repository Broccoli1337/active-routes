$(function() {
  var restPath =  '../scripts/active.js/';
  var dataURL = restPath + 'trend/json';

  var SEP = '_SEP_';

  var defaults = {
    tab:0,
    cache0:'show',
    cache1:'hide',
    cache2:'hide',
    cache60:'show',
    cache61:'hide',
    cache62:'hide',
    hlp0:'hide',
    hlp1:'hide'
  };

  var state = {};
  $.extend(state,defaults);

  function createQuery(params) {
    var query, key, value;
    for(key in params) {
      value = params[key];
      if(value == defaults[key]) continue;
      if(query) query += '&';
      else query = '';
      query += encodeURIComponent(key)+'='+encodeURIComponent(value);
    }
    return query;
  }

  function getState(key, defVal) {
    return window.sessionStorage.getItem('arm_'+key) || state[key] || defVal;
  }

  function setState(key, val, showQuery) {
    state[key] = val;
    window.sessionStorage.setItem('arm_'+key, val);
    if(showQuery) {
      var query = createQuery(state);
      window.history.replaceState({},'',query ? '?' + query : './');
    }
  }

  function setQueryParams(query) {
    var vars, params, i, pair;
    vars = query.split('&');
    params = {};
    for(i = 0; i < vars.length; i++) {
      pair = vars[i].split('=');
      if(pair.length == 2) setState(decodeURIComponent(pair[0]), decodeURIComponent(pair[1]),false);
    }
  }

  var search = window.location.search;
  if(search) setQueryParams(search.substring(1));

  $('#clone_button').button({icons:{primary:'ui-icon-newwin'},text:false}).click(function() {
    window.open(window.location);
  });

  $('#cache-acc > div').each(function(idx) {
    $(this).accordion({
      heightStyle:'content',
      collapsible: true,
      active: getState('cache'+idx, 'hide') == 'show' ? 0 : false,
      activate: function(event, ui) {
        var newIndex = $(this).accordion('option','active');
        setState('cache'+idx, newIndex === 0 ? 'show' : 'hide', true);
        $.event.trigger({type:'updateChart'});
      }
    });
  });

  $('#cache6-acc > div').each(function(idx) {
    $(this).accordion({
      heightStyle:'content',
      collapsible: true,
      active: getState('cache6'+idx, 'hide') == 'show' ? 0 : false,
      activate: function(event, ui) {
        var newIndex = $(this).accordion('option','active');
        setState('cache6'+idx, newIndex === 0 ? 'show' : 'hide', true);
        $.event.trigger({type:'updateChart'});
      }
    });
  });

  $('#help-acc > div').each(function(idx) {
    $(this).accordion({
      heightStyle:'content',
      collapsible: true,
      active: getState('hlp'+idx, 'hide') === 'show' ? 0 : false,
      activate: function(event, ui) {
        var newIndex = $(this).accordion('option','active');
        setState('hlp'+idx, newIndex === 0 ? 'show' : 'hide', true);
      }
    });
  });


  $('#tabs').tabs({
    active: getState('tab', 0),
    activate: function(event, ui) {
      var newIndex = ui.newTab.index();
      setState('tab', newIndex, true);
      $.event.trigger({type:'updateChart'});
    },
    create: function(event,ui) {
      $.event.trigger({type:'updateChart'});
    }
  });

  // define charts
  var db = {};

  // IPv4 Prefixes
  $('#prefixes').chart({
    type: 'trend',
    metrics: ['bgp-nprefixes'],
    stack:false,
    units: 'Total Prefixes'},
  db);
  $('#prefixchanges').chart({
    type: 'trend',
    metrics: ['bgp-adds','bgp-removes'],
    stack:false,
    legend:['Adds','Removes'],
    units: 'Prefixes per Second'},
  db);
  $('#cachedprefixes').chart({
    type: 'trend',
    metrics: ['cache-prefixes'],
    stack:false,
    units: 'Total Prefixes'},
  db);
  $('#cachedprefixchanges').chart({
    type: 'trend',
    metrics: ['cache-prefixes-added','cache-prefixes-removed'],
    stack:false,
    legend:['Adds','Removes'],
    units: 'Prefixes per Second'},
  db);
  $('#cachedhitrate').chart({
    type: 'trend',
    metrics: ['cache-missadd','cache-missdelete'],
    legend: ['New','Deleted'],
    stack:true,
    units: '%Cache Misses'},
  db);
  $('#activeprefixes').chart({
    type: 'trend',
    metrics: ['active-activeprefixes','active-coveredprefixes'],
    legend: ['Active','Covered'],
    stack:true,
    units: 'Prefixes'},
  db);
  $('#activecoverage').chart({
    type: 'trend',
    metrics: ['active-coverage'],
    stack:false,
    units: '%Active Prefix Traffic'},
  db);

  function updateData(data) {
    if(!data
      || !data.trend
      || !data.trend.times
      || data.trend.times.length == 0) return;

    if(db.trend) {
      // merge in new data
      var maxPoints = db.trend.maxPoints;
      var remove = db.trend.times.length > maxPoints ? db.trend.times.length - maxPoints : 0;
      db.trend.times = db.trend.times.concat(data.trend.times);
      if(remove) db.trend.times = db.trend.times.slice(remove);
      for(var name in db.trend.trends) {
        db.trend.trends[name] = db.trend.trends[name].concat(data.trend.trends[name]);
        if(remove) db.trend.trends[name] = db.trend.trends[name].slice(remove);
      }
    } else db.trend = data.trend;

    db.trend.start = new Date(db.trend.times[0]);
    db.trend.end = new Date(db.trend.times[db.trend.times.length - 1]);

    $.event.trigger({type:'updateChart'});
  }

  function pollTrends() {
    $.ajax({
      url: dataURL,
      data: db.trend && db.trend.end ? {after:db.trend.end.getTime()} : null,
      success: function(data) {
        updateData(data);
        setTimeout(pollTrends, 1000);
      },
      error: function(result,status,errorThrown) {
        setTimeout(pollTrends,5000);
      },
      timeout: 60000
    });
  };

  $(window).resize(function() {
    $.event.trigger({type:'updateChart'});
  });

  pollTrends();
});
