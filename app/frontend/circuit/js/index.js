import 'ionicons-npm/css/ionicons.min.css'
import "../less/index.less"
import "font-awesome/css/font-awesome.css"
import "octicons/build/font/octicons.css"
import "./dialog/PopConfirm"

import global from "./global"

//require('webpack-jquery-ui/css');  //ommit, if you don't want to load basic css theme

// Resolve name collision between jQuery UI and Twitter Bootstrap
/*** Handle jQuery plugin naming conflict between jQuery UI and Bootstrap ***/
$.widget.bridge('uibutton', $.ui.button)
$.widget.bridge('uitooltip', $.ui.tooltip)


// required to be compatible with jquery.layout and jquery.handsontable
//
jQuery.uaMatch = function (ua) {
  ua = ua.toLowerCase()
  var match = /(chrome)[ \/]([\w.]+)/.exec(ua) ||
    /(webkit)[ \/]([\w.]+)/.exec(ua) ||
    /(opera)(?:.*version|)[ \/]([\w.]+)/.exec(ua) ||
    /(msie) ([\w.]+)/.exec(ua) ||
    ua.indexOf("compatible") < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/.exec(ua) ||
    []
  return {
    browser: match[1] || "",
    version: match[2] || "0"
  }
}
if (!jQuery.browser) {
  let matched = jQuery.uaMatch(navigator.userAgent)
  let browser = {}
  if (matched.browser) {
    browser[matched.browser] = true
    browser.version = matched.version
  }
// Chrome is Webkit, but Webkit is also Safari.
  if (browser.chrome) {
    browser.webkit = true
  } else if (browser.webkit) {
    browser.safari = true
  }
  jQuery.browser = browser
}


import hardware from "./hardware"

$(window).load(function () {
  $.getScript("../assets/shapes/index.js",function(){

    console.log("loaded")
    // export all required classes for deserialize JSON with "eval"
    // "eval" code didn't sees imported class or code
    //
    for(var k in global) window[k]=global[k];
    socket = io()
    app = require("./Application")
    hardware.init(socket)
  });
});