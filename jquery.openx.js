/*
 * (C) Copyright 2012 juplo (http://juplo.de/).
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the GNU Lesser General Public License
 * (LGPL) version 3.0 which accompanies this distribution, and is available at
 * http://www.gnu.org/licenses/lgpl-3.0.html
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * Contributors:
 * - Kai Moritz
 */

/*
 * See http://coding.smashingmagazine.com/2011/10/11/essential-jquery-plugin-patterns/
 * for detailed explanations for the applied best practices.
 *
 * The semicolon guides our code for poorly written concatenated scripts.
 */
;(function( $, window, document, undefined ) {

  var

  settings, _options, domain, id, node,

  count = 0,
  slots = {},
  min_width = {},
  max_width = {},
  is_pagewidth = {},
  pagewidth,
  rendered = {},
  visible = {},
  rendering = false,
  resize_timer,
  queue = [],
  output = [];


  /*
   * Configuration-Options for jQuery.openx
   *
   * Since the domain-name of the ad-server is the only required parameter,
   * jQuery.openx for convenience can be configured with only that one
   * parameter. For example: "jQuery.openx('openx.example.org');". If more
   * configuration-options are needed, they must be specified as an object.
   * For example: "jQuery.openx({'server': 'openx.example.org', ... });".
   *
   *
   * Server-Settings:
   *
   * server:        string  Name of the server, without protocol or port. For
   *                        example "openx.example.org". This option is
   *                        REQUIRED.
   * protocol:              Optional parameter.
   *                http:   All connections to the ad-server are made via HTTP.
   *                https:  All connections to the ad-server are made via HTTPS.
   *                        If empty, document.location.protocol will be used.
   * http_port:     number  Port-Number for HTTP-connections to the ad-server
   *                        (only needed, when it is not the default-value 80).
   * https_port:            Port-Number for HTTPS-connections to the ad-server
   *                        (only needed, when it is not the default-value 443).
   *
   *
   * Seldom needed special Server-Settings (these parameters are only needed,
   * if the default delivery-configration of the OpenX-Server was changed):
   *
   * path:          string  Path to delivery-scripts. DEFAULT: "/www/delivery".
   * fl:            string  Flash-Include-Script. DEFAULT: "fl.js".
   *
   *
   * Delivery-Options (for details and explanations see the see:
   * http://www.openx.com/docs/2.8/userguide/single%20page%20call):
   *
   * block:         1       Don't show the banner again on the same page.
   *                0       A Banner might be shown multiple times on the same
   *                        page (DEFAULT).
   * blockcampaign: 1       Don't show a banner from the same campaign again on
   *                        the same page.
   *                0       A Banner from the same campaign might be shown
   *                        muliple times on the same page (DEFAULT).
   * target:        string  The value is addes as the HTML TARGET attribute in
   *                        the ad code. Examples for sensible values: "_blank",
   *                        "_top".
   * withtext:      1       Show text below banner. Enter this text in the
   *			    Banner properties page.
   *                0       Ignore the text-field from the banner-properties
                            (DEFAULT).
   * charset:       string  Charset used, when delivering the banner-codes.
   *                        If empty, the charset is guessed by OpenX. Examples
   *                        for sensible values: "UTF-8", "ISO-8859-1".
   *
   *
   * Other settings:
   *
   * selector:      string  A selector for selecting the DOM-elements, that
   *                        should display ad-banners. DEFAULT: ".oa".
   *                        See: http://api.jquery.com/category/selectors/
   * min_prefix:    string  Prefix for the encoding of the minmal width as
   *                        CSS-class. DEFAULT: "min_".
   * max_prefix:    string  Prefix for the encoding of the maximal width as
   *                        CSS-class. DEFAULT: "max_".
   * pw_marker:     string  CSS-class, that marks the encoded maximal and minmal
   *                        width as page width. DEFAULT: "pw".
   * resize_delay:  number  Number of milliseconds to wait, before a
   *                        recalculation of the visible ads is scheduled.
   *                        If the value is choosen to small, a recalculation
   *                        might be scheduled, while resizing is still in
   *                        progress. DEFAULT: 200.
   * debug:         boolean Turn on/off console-debugging. DEFAULT: false.
   */
  $.openx = function( options ) {

    if (domain) {
      if (console.error) {
        console.error('jQuery.openx was already initialized!');
        console.log('Configured options: ', _options);
      }
      return;
    }

    /** Enable convenient-configuration */
    if (typeof(options) == 'string')
      options = { 'server': options };

    _options = options;

    if (!options.server) {
      if (console.error) {
        console.error('Required option "server" is missing!');
        console.log('options: ', options);
      }
      return;
    }

    settings = $.extend(
      {
        'protocol': document.location.protocol,
        'delivery': '/www/delivery',
        'fl': 'fl.js',
        'selector': '.oa',
        'min_prefix': 'min_',
        'max_prefix': 'max_',
        'pw_marker': 'pw',
        'resize_delay': 200,
        'debug': false
      },
      options
      );

    domain = settings.protocol + '//';
    domain += settings.server;
    if (settings.protocol === 'http:' && settings.http_port)
      domain += ':' + settings.http_port;
    if (settings.protocol === 'https:' && settings.https_port)
      domain += ':' + settings.https_port;

    if (settings.debug && console.debug)
      console.debug('Ad-Server: ' + domain);

    /**
     * Without this option, jQuery appends an timestamp to every URL, that
     * is fetched via $.getScript(). This can mess up badly written
     * third-party-ad-scripts, that assume that the called URL's are not
     * altered.
     */
    $.ajaxSetup({ 'cache': true });

    /**
     * jQuery.openx only works with "named zones", because it does not know,
     * which zones belong to which website. For mor informations about
     * "named zones" see:
     * http://www.openx.com/docs/2.8/userguide/single%20page%20call
     *
     * For convenience, jQuery.openx only fetches banners, that are really
     * included in the actual page. This way, you can configure jQuery.openx
     * with all zones available for your website - for example in a central
     * template - and does not have to worry about performance penalties due
     * to unnecessarily fetched banners.
     */
    for(name in OA_zones) {
      $(settings.selector).each(function() {
        var
        id,
        classes,
        i,
        min = new RegExp('^' + settings.min_prefix + '([0-9]+)$'),
        max = new RegExp('^' + settings.max_prefix + '([0-9]+)$'),
        match;
        if (this.id === name) {
          id = 'oa_' + ++count;
          slots[id] = this;
          min_width[id] = 0;
          max_width[id] = Number.MAX_VALUE;
          is_pagewidth[id] = false;
          classes = this.className.split(/\s+/);
          for (i=0; i<classes.length; i++) {
            match = min.exec(classes[i]);
            if (match)
              min_width[id] = +match[1];
            match = max.exec(classes[i]);
            if (match)
              max_width[id] = +match[1];
            is_pagewidth[id] = classes[i] === settings.pw_marker;
          }
          rendered[id] = false;
          visible[id] = false;
          if (settings.debug && console.debug)
            console.debug(
                'Slot ' + count + ': ' + this.id
                + (is_pagewidth[id] ? ', pagewidth: ' : ', width: ')
                + min_width[id]
                + (max_width[id] != Number.MAX_VALUE ? '-' + max_width[id] : '')
                );
        }
      });
    }

    /** Add resize-event */
    $(window).resize(function() {
      clearTimeout(resize_timer);
      resize_timer = setTimeout(recalculate_visible , settings.resize_timeout);
    });

    /** Fetch the JavaScript for Flash and schedule the initial fetch */
    $.getScript(domain + settings.delivery + '/' + settings.fl, recalculate_visible);

  }

  function recalculate_visible() {

    pagewidth = $(document).width();
    if (settings.debug && console.debug)
      console.debug('Scheduling recalculation of visible banners for width ' + pagewidth);
    if (!rendering)
      fetch_ads();
    
  }

  function fetch_ads() {

    /** Guide rendering-process for early restarts */
    rendering = true;

    if (settings.debug && console.debug)
      console.debug('Starting recalculation of visible banners for width ' + pagewidth);

    var name, width, src = domain + settings.delivery + '/spc.php';

    /** Order banners for all zones that were found on the page */
    src += '?zones=';
    for(id in slots) {
      width =
          is_pagewidth[id]
          ? pagewidth
          : Math.round($(slots[id]).parent().width());
      visible[id] = width >= min_width[id] && width <= max_width[id];
      if (visible[id]) {
        if (!rendered[id]) {
          queue.push(id);
          src += escape(id + '=' + OA_zones[slots[id].id] + "|");
          rendered[id] = true;
          if (settings.debug && console.debug)
            console.debug('Fetching banner ' + slots[id].id);
        }
        else {
          /** Unhide already fetched visible banners */
          if (settings.debug && console.debug)
            console.debug('Unhiding already fetched banner ' + slots[id].id);
          $(slots[id]).slideDown();
        }
      }
      else {
        /** Hide unvisible banners */
        if (settings.debug && console.debug)
          console.debug('Hiding banner ' + slots[id].id);
        $(slots[id]).hide();
      }
    }
    src += '&nz=1'; // << We want to fetch named zones!

    /**
     * These are some additions to the URL of spc.php, that are originally
     * made in spcjs.php
     */
    src += '&r=' + Math.floor(Math.random()*99999999);
    if (window.location)   src += "&loc=" + escape(window.location);
    if (document.referrer) src += "&referer=" + escape(document.referrer);

    /** Add the configured options */
    if (settings.block === 1)
      src += '&block=1';
    if (settings.blockcampaign === 1)
      src += '&blockcampaign=1';
    if (settings.target)
      src += '&target=' + settings.target;
    if (settings.withtext === 1)
      src += '&withtext=1';
    if (settings.charset)
      src += '&charset=' + settings.charset;

    /** Add the source-code - if present */
    if (typeof OA_source !== 'undefined')
      src += "&source=" + escape(OA_source);

    /** Signal, that this task is done / in progress */
    pagewidth = undefined;

    /** Fetch data from OpenX and schedule the render-preparation */
    $.getScript(src, init_ads);

  }

  function init_ads() {

    var i, id, ads = [];
    for (i=0; i<queue.length; i++) {
      id = queue[i];
      if (typeof(OA_output[id]) != 'undefined' && OA_output[id] != '')
        ads.push(id);
    }
    queue = ads;

    document.write = document_write;
    document.writeln = document_write;

    render_ads();

  }

  function render_ads() {

    while (queue.length > 0) {

      var result, src, inline;

      id = queue.shift();
      node = $(slots[id]);

      if (settings.debug && console.debug)
        console.debug('Rendering banner ' + slots[id].id);

      node.slideDown();

      // node.append(id + ": " + node.attr('class'));

      /**
       * If output was added via document.write(), this output must be
       * rendered before other banner-code from the OpenX-server is rendered!
       */
      insert_output();

      while ((result = /<script/i.exec(OA_output[id])) != null) {
        node.append(OA_output[id].slice(0,result.index));
        /** Strip all text before "<script" from OA_output[id] */
        OA_output[id] = OA_output[id].slice(result.index,OA_output[id].length);
        result = /^([^>]*)>([\s\S]*?)<\\?\/script>/i.exec(OA_output[id]);
        if (result == null) {
          /** Invalid syntax in delivered banner-code: ignoring the rest of this banner-code! */
          // alert(OA_output[id]);
          OA_output[id] = "";
        }
        else {
          /** Remember iinline-code, if present */
          src = result[1] + ' ' // << simplifies the following regular expression: the string ends with a space in any case, so that the src-URL cannot be followed by the end of the string emediately!
          inline = result[2];
          /** Strip all text up to and including "</script>" from OA_output[id] */
          OA_output[id] = OA_output[id].slice(result[0].length,OA_output[id].length);
          result = /src\s*=\s*['"]?([^'"]*)['"]?\s/i.exec(src);
          if (result == null) {
            /** script-tag with inline-code: execute inline-code! */
            result = /^\s*<.*$/m.exec(inline);
            if (result != null) {
              /** Remove leading HTML-comments, because IE will stumble otherwise */
              inline = inline.slice(result[0].length,inline.length);
            }
            $.globalEval(inline);
            insert_output(); // << The executed inline-code might have called document.write()!
          }
          else {
            /** script-tag with src-URL! */
            if (OA_output[id].length > 0)
              /** The banner-code was not rendered completely yet! */
              queue.unshift(id);
            /** Load the script and halt all work until the script is loaded and executed... */
            $.getScript(result[1], render_ads); // << jQuery.getScript() generates onload-Handler for _all_ browsers ;)
            return;
          }
        }
      }

      node.append(OA_output[id]);
      OA_output[id] = "";
    }

    /** All entries from OA_output were rendered */

    id = undefined;
    node = undefined;
    rendering = false;

    if (settings.debug && console.debug)
      console.debug('Recalculation of visible banners done!');

    /** Restart rendering, if new task was queued */
    if (pagewidth)
      fetch_ads();

  }

  /** This function is used to overwrite document.write and document.writeln */
  function document_write() {

    if (id == undefined)
      return;

    for (var i=0; i<arguments.length; i++)
      output.push(arguments[i]);

    if (id != queue[0])
      /**
       * Re-Add the last banner-code to the working-queue, because included
       * scripts had added markup via document.write(), which is not
       * proccessed yet.
       * Otherwise the added markup would be falsely rendered together with
       * the markup from the following banner-code.
       */
      queue.unshift(id);

  }

  /**
   * This function prepends the collected output from calls to
   * document_write() to the current banner-code.
   */
  function insert_output() {

    if (output.length > 0) {
      output.push(OA_output[id]);
      OA_output[id] = "";
      for (i=0; i<output.length; i++)
        OA_output[id] += output[i];
      output = [];
    }

  }

})( jQuery, window, document );

var OA_output = {}; // << Needed, because IE will complain loudly otherwise!
